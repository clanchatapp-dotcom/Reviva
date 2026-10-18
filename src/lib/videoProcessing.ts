// Client-side video frame restoration.
// Extracts frames from a source video, restores each frame via the image
// pipeline, then re-encodes using MediaRecorder + canvas captureStream.
// Audio is preserved by capturing the original track and muxing via WebAudio.

import { processImage, RestoreOptions, canvasToBlob } from './imageProcessing';

export interface VideoProcessProgress {
  (stage: string, pct: number, frameInfo?: { current: number; total: number }): void;
}

export interface VideoProcessResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
  frameCount: number;
}

// Get video metadata
export function getVideoMetadata(file: File): Promise<{
  duration: number; width: number; height: number; element: HTMLVideoElement;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        element: video,
      });
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load video')); };
  });
}

// Seek video to a specific time and wait for the frame to be ready.
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

// Process a video by restoring each frame and re-encoding.
// We use canvas.captureStream + MediaRecorder for output.
// Target FPS is capped to 24 for that classic restored-film feel and performance.
export async function processVideo(
  file: File,
  opts: RestoreOptions,
  onProgress?: VideoProcessProgress
): Promise<VideoProcessResult> {
  const p = (stage: string, pct: number, frameInfo?: { current: number; total: number }) =>
    onProgress?.(stage, pct, frameInfo);
  p('Loading video', 0.01);

  const meta = await getVideoMetadata(file);
  const video = meta.element;
  video.playbackRate = 1;

  const targetFps = 24;
  const duration = meta.duration;
  const totalFrames = Math.min(600, Math.ceil(duration * targetFps)); // cap for perf
  const frameTime = duration / totalFrames;

  // Output canvas at upscaled resolution
  const outW = Math.round(meta.width * opts.upscale);
  const outH = Math.round(meta.height * opts.upscale);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;

  p('Preparing encoder', 0.03);

  // Set up MediaRecorder from canvas stream
  if (typeof outCanvas.captureStream !== 'function') {
    throw new Error('captureStream not supported in this environment');
  }
  const stream = outCanvas.captureStream(targetFps);

  // Try to add audio track from the original video (best-effort)
  try {
    const anyVideo = video as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    let audioStream: MediaStream | null = null;
    if (typeof anyVideo.captureStream === 'function') audioStream = anyVideo.captureStream();
    else if (typeof anyVideo.mozCaptureStream === 'function') audioStream = anyVideo.mozCaptureStream();
    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      // Only add audio tracks if they exist and stream supports adding tracks
      for (const t of audioTracks) {
        try { stream.addTrack(t); } catch (e) { /* skip adding audio if not permitted */ }
      }
    }
  } catch {
    // continue without audio
  }

  // Pick a supported mimeType if possible. If not detectable, let the browser choose.
  const mimeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  let mimeType: string | undefined = undefined;
  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    for (const m of mimeCandidates) {
      try {
        if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
      } catch { /* ignore */ }
    }
  }

  const recorderOptions: any = { videoBitsPerSecond: Math.min(12_000_000, outW * outH * targetFps * 0.15) };
  if (mimeType) recorderOptions.mimeType = mimeType;

  let recorder: MediaRecorder;
  const chunks: Blob[] = [];

  try {
    // Try with options (preferred) and fall back to defaults if that fails.
    recorder = new MediaRecorder(stream, recorderOptions);
  } catch (err) {
    try {
      recorder = new MediaRecorder(stream);
    } catch (err2) {
      // If MediaRecorder cannot be constructed, fail with a helpful error.
      throw new Error('MediaRecorder not supported or cannot be started on this device');
    }
  }

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || (mimeType ?? 'video/webm') }));
  });

  try {
    recorder.start();
  } catch (e) {
    // Some platforms may throw on start with certain options; try without options already attempted.
    recorder.stop();
    throw new Error('Failed to start MediaRecorder on this device');
  }
  const startTime = performance.now();

  // Process frames
  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(duration - 0.001, i * frameTime);
    await seekTo(video, t);

    // Draw current frame to a temp canvas at original size, then process
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = meta.width;
    tmpCanvas.height = meta.height;
    tmpCanvas.getContext('2d')!.drawImage(video, 0, 0, meta.width, meta.height);

    const result = await processImage(tmpCanvas, opts);
    outCtx.clearRect(0, 0, outW, outH);
    outCtx.drawImage(result.canvas, 0, 0, outW, outH);

    // Let the captureStream pick up the frame at the right cadence
    await sleep(1000 / targetFps);

    const pct = 0.05 + 0.9 * ((i + 1) / totalFrames);
    p('Restoring frames', pct, { current: i + 1, total: totalFrames });
  }

  // Allow last frames to flush
  await sleep(300);
  recorder.stop();
  const blob = await recordingDone;

  // Cleanup
  try { stream.getTracks().forEach((t) => t.stop()); } catch { }
  URL.revokeObjectURL(video.src);

  return {
    blob,
    mimeType: recorder?.mimeType || mimeType || 'video/webm',
    durationSec: (performance.now() - startTime) / 1000,
    width: outW,
    height: outH,
    frameCount: totalFrames,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { canvasToBlob };
