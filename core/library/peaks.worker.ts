import { computePeaks } from './peaks';

self.onmessage = (e: MessageEvent<{ samples: Float32Array; buckets: number }>) => {
  const peaks = computePeaks(e.data.samples, e.data.buckets);
  (self as unknown as Worker).postMessage(peaks, [peaks.buffer]);
};
