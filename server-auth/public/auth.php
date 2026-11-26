<?php
// Music Player sign-in check.
//
// POST /auth.php  {"accessToken": "<Google access token>", "edition": "play|personal"}
//   200 {"session": "<signed token>", "exp": <unix seconds>, "email": "...", "name": "..."}
//   400 bad request, 401 Google token refused, 403 {"error": "blocked"}, 500/502 server or Google trouble
//
// What it does: asks Google who owns the token (and that it was issued to one of our two apps),
// records the e-mail in app_users (open registration), refuses blocked e-mails, and returns a
// session token that the app keeps for `session_days` days. No token is stored or logged.

declare(strict_types=1);

// The config path comes from the environment (SetEnv in .htaccess shows up in $_SERVER).
$configPath = getenv('MUSIK_AUTH_CONFIG') ?: ($_SERVER['MUSIK_AUTH_CONFIG'] ?? '') ?: (__DIR__ . '/../auth-config.php');
$config = is_file($configPath) ? require $configPath : null;

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!is_array($config)) {
    respond(500, ['error' => 'config']);
}

// CORS: only the app origins.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $config['allowed_origins'], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['error' => 'method']);
}

$raw = file_get_contents('php://input', false, null, 0, 8192);
$input = json_decode($raw === false ? '' : $raw, true);
$token = is_array($input) && is_string($input['accessToken'] ?? null) ? trim($input['accessToken']) : '';
$edition = is_array($input) && in_array($input['edition'] ?? '', ['play', 'personal'], true) ? $input['edition'] : '';
if ($token === '' || strlen($token) > 4096) {
    respond(400, ['error' => 'token']);
}

/** GET a Google endpoint with a bearer or query token. Returns [status, decoded JSON or null]. */
function google_get(string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($body === false) {
        return [0, null];
    }
    $json = json_decode((string) $body, true);
    return [$status, is_array($json) ? $json : null];
}

// 1. Was the token issued to one of our apps, and whose is it?
[$status, $info] = google_get($config['google_tokeninfo_url'] . '?access_token=' . rawurlencode($token));
if ($status === 0) {
    respond(502, ['error' => 'google']);
}
if ($status !== 200 || $info === null) {
    respond(401, ['error' => 'token']);
}
$audience = (string) ($info['aud'] ?? '');
$authorized = (string) ($info['azp'] ?? '');
if (!in_array($audience, $config['client_ids'], true) && !in_array($authorized, $config['client_ids'], true)) {
    respond(401, ['error' => 'audience']);
}
if ((int) ($info['expires_in'] ?? 0) <= 0) {
    respond(401, ['error' => 'token']);
}
$email = strtolower(trim((string) ($info['email'] ?? '')));
$verified = ($info['email_verified'] ?? '') === 'true' || ($info['email_verified'] ?? false) === true;
if ($email === '' || !$verified || strlen($email) > 254 || !str_contains($email, '@')) {
    respond(401, ['error' => 'email']);
}

// 2. Display name (best effort, never decides access).
$name = '';
$ch = curl_init($config['google_userinfo_url']);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 6,
    CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Accept: application/json'],
]);
$profileBody = curl_exec($ch);
curl_close($ch);
if ($profileBody !== false) {
    $profile = json_decode((string) $profileBody, true);
    if (is_array($profile) && is_string($profile['name'] ?? null)) {
        $name = mb_substr(trim($profile['name']), 0, 200);
    }
}

// 3. Record the user (open registration) and read the status.
try {
    $pdo = new PDO($config['db_dsn'], $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $up = $pdo->prepare(
        'INSERT INTO app_users (email, name, edition, first_seen, last_seen, login_count)
         VALUES (:email, :name, :edition, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1)
         ON DUPLICATE KEY UPDATE
           name = IF(VALUES(name) <> \'\', VALUES(name), name),
           edition = IF(VALUES(edition) <> \'\', VALUES(edition), edition),
           last_seen = UTC_TIMESTAMP(),
           login_count = login_count + 1'
    );
    $up->execute([':email' => $email, ':name' => $name, ':edition' => $edition]);
    $q = $pdo->prepare('SELECT status FROM app_users WHERE email = :email');
    $q->execute([':email' => $email]);
    $status = $q->fetchColumn();
} catch (Throwable $e) {
    error_log('musik-auth db: ' . get_class($e));
    respond(500, ['error' => 'db']);
}
if ($status === 'blocked') {
    respond(403, ['error' => 'blocked']);
}

// 4. Session token: base64url(payload) . '.' . hmac.
$now = time();
$exp = $now + (int) $config['session_days'] * 86400;
$payload = rtrim(strtr(base64_encode(json_encode(['e' => $email, 'iat' => $now, 'exp' => $exp])), '+/', '-_'), '=');
$sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, (string) $config['session_secret'], true)), '+/', '-_'), '=');

respond(200, ['session' => $payload . '.' . $sig, 'exp' => $exp, 'email' => $email, 'name' => $name]);
