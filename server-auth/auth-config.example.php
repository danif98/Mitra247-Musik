<?php
// Copy to auth-config.php OUTSIDE the web root (or set the MUSIK_AUTH_CONFIG environment variable
// to its path) and fill it in. Never commit the real file.
return [
    // MySQL / MariaDB on the same Virtualmin server.
    'db_dsn' => 'mysql:host=127.0.0.1;dbname=musik_app;charset=utf8mb4',
    'db_user' => 'musik_app',
    'db_pass' => 'CHANGE-ME',

    // OAuth client IDs of the two Android apps (Google Cloud, Clients). A token is only accepted
    // when it was issued to one of these, so tokens of other apps are refused.
    'client_ids' => [
        '653398046329-0r71gaiqa8sd8166lnit5sr9pcn7qfs9.apps.googleusercontent.com', // play
        '653398046329-rj1sj034eavv05cdk17s3ps892tekd4n.apps.googleusercontent.com', // personal
    ],

    // Random secret (>= 32 chars) that signs session tokens: php -r "echo bin2hex(random_bytes(32));"
    'session_secret' => 'CHANGE-ME-TO-A-LONG-RANDOM-STRING',

    // How long a verified session stays valid, also while the phone is offline.
    'session_days' => 30,

    // Origins allowed to call this endpoint from the app (Capacitor serves the app from these).
    'allowed_origins' => ['https://localhost', 'http://localhost'],

    // Only change for tests.
    'google_tokeninfo_url' => 'https://oauth2.googleapis.com/tokeninfo',
    'google_userinfo_url' => 'https://www.googleapis.com/oauth2/v3/userinfo',
];
