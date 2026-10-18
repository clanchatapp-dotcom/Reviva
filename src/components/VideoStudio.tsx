import { useRef, useState, useCallback } from 'react';
import { Upload, Download, Loader2, Film, ChevronDown, AlertCircle, Play } from 'lucide-react';
import { RestoreOptions, DEFAULT_OPTIONS } from '@/lib/imageProcessing';
import { processVideo, downloadBlob, getVideoMetadata } from '@/lib/videoProcessing';
import { saveItem, makeThumbFromDataURL, GalleryItem } from '@/lib/gallery';
import { RestoreControls } from './RestoreControls';

interface Props {
  onSave: () => void;
}

export function VideoStudio({ onSave }: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [options, setOptions] = useState<RestoreOptions>({ ...DEFAULT_OPTIONS, upscale: 1, repair: 25, denoise: 30, sharpen: 35 });
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; pct: number; frame?: { current: number; total: number } }>({ stage: '', pct: 0 });
  const [fileName, setFileName] = useState('restored-video');
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [autoColorize, setAutoColorize] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) return;
    setProcessing(true);
    setProgress({ stage: 'Loading video', pct: 0 });
    setResultUrl(null); setResultBlob(null);
    try {
      const m = await getVideoMetadata(file);
      setMeta({ duration: m.duration, width: m.width, height: m.height });
      setVideoUrl(URL.createObjectURL(file));
      setFileName(file.name.replace(/\.[^.]+$/, '') || 'restored-video');
    } catch (e) { console.error(e); }
    setProcessing(false);
  }, []);

  const handleProcess = async () => {
    if (!videoUrl) return;
    setProcessing(true);
    setProgress({ stage: 'Starting', pct: 0 });
    setResultUrl(null); setResultBlob(null);
    try {
      // Fetch the file back from the object URL for processing
      const resp = await fetch(videoUrl);
      const file = new File([await resp.blob()], 'source', { type: resp.headers.get('content-type') || 'video/mp4' });
      const result = await processVideo(file, options, (s, p, frame) => setProgress({ stage: s, pct: p, frame }));
      setResultBlob(result.blob);
      setResultUrl(URL.createObjectURL(result.blob));
    } catch (e) {
      console.error(e);
      alert('Video processing failed. Try a shorter clip or lower upscale.');
    }
    setProcessing(false);
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    downloadBlob(resultBlob, `${fileName}-restored.webm`);
  };

  const handleSaveToGallery = async () => {
    if (!resultUrl || !videoUrl || !resultBlob) return;
    const id = `item-${Date.now()}`;
    const thumb = await makeThumbFromDataURL(resultUrl, 320).catch(() => '');
    const origThumb = await makeThumbFromDataURL(videoUrl, 320).catch(() => '');
    const item: GalleryItem = {
      id,
      kind: 'video',
      name: fileName,
      createdAt: Date.now(),
      thumbnail: thumb,
      originalPreview: origThumb,
      resultBlobKey: `blob-${id}`,
      width: meta?.width ?? 0,
      height: meta?.height ?? 0,
      options,
      durationMs: 0,
      videoDuration: meta?.duration,
      mimeType: resultBlob.type,
    };
    await saveItem(item, resultBlob);
    onSave();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  if (!videoUrl) {
    return (
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-20">
        <div className="text-center mb-10 animate-floatUp">
          <h1 className="font-display text-5xl md:text-6xl font-medium leading-[1.05] tracking-tight">
            Restore your <span className="gold-gradient-text italic">moving</span>
            <br />memories.
          </h1>
          <p className="text-ink-300 mt-5 text-lg max-w-xl mx-auto leading-relaxed">
            Repair blurry, damaged, and black-and-white video frame by frame —
            upscaled, stabilized in tone, and re-encoded with original audio preserved.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`relative rounded-2xl border-2 border-dashed border-ink-700 bg-ink-900/40 p-12 md:p-20 text-center transition-all duration-300 ${isDragging ? 'drag-active scale-[1.01]' : 'hover:border-ink-600'}`}
        >
          <div className="flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ink-800 to-ink-850 border border-ink-700 flex items-center justify-center shadow-lg">
              <Film className="w-8 h-8 text-gold-400" />
            </div>
            <div>
              <p className="text-ink-100 text-lg font-medium">Drop a video here</p>
              <p className="text-ink-400 text-sm mt-1">MP4, WebM, MOV — shorter clips process faster</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold transition-colors shadow-lg shadow-gold-500/20"
            >
              Choose Video
            </button>
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        </div>

        <div className="mt-6 glass rounded-xl p-4 border border-ink-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-gold-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-300 leading-relaxed">
            Video restoration runs entirely in your browser and processes each frame individually.
            For best results, use clips under 30 seconds. Output is WebM format.
          </p>
        </div>
      </div>
    );
  }

  const fmtTime = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-6 pb-20">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => { setVideoUrl(null); setResultUrl(null); setMeta(null); }}
            className="px-3 py-1.5 rounded-lg text-sm text-ink-300 hover:text-ink-100 hover:bg-ink-800 transition-colors flex items-center gap-1.5"
          >
            <ChevronDown className="w-4 h-4 rotate-90" /> New
          </button>
          <span className="text-ink-400 text-sm truncate">{fileName}</span>
          {meta && <span className="text-ink-500 text-xs">{meta.width}×{meta.height} · {fmtTime(meta.duration)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveToGallery}
            disabled={!resultBlob}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-100 bg-ink-800 hover:bg-ink-750 border border-ink-700 transition-colors disabled:opacity-40"
          >
            Save to Gallery
          </button>
          <button
            onClick={handleDownload}
            disabled={!resultBlob || processing}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gold-500 hover:bg-gold-400 text-ink-950 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        <div className="glass rounded-2xl border border-ink-800 overflow-hidden flex flex-col">
          <div className="flex-1 flex items-center justify-center p-4 bg-ink-950/60 relative min-h-[300px]">
            {processing && (
              <div className="absolute inset-0 z-10 bg-ink-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 animate-fadeIn">
                <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
                <p className="text-ink-200 text-sm font-medium">{progress.stage}…</p>
                {progress.frame && (
                  <p className="text-ink-400 text-xs font-mono">Frame {progress.frame.current} / {progress.frame.total}</p>
                )}
                <div className="w-56 h-1 bg-ink-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-500 transition-all duration-200" style={{ width: `${progress.pct*100}%` }} />
                </div>
              </div>
            )}
            {resultUrl ? (
              <video src={resultUrl} controls className="max-w-full max-h-[65vh] rounded-lg" />
            ) : videoUrl ? (
              <video src={videoUrl} controls className="max-w-full max-h-[65vh] rounded-lg" />
            ) : null}
          </div>
          <div className="p-4 border-t border-ink-800 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-400">
              {resultUrl ? 'Restored result — review below.' : 'Preview your source video, then restore.'}
            </p>
            {!resultUrl && (
              <button
                onClick={handleProcess}
                disabled={processing}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-gold-500 hover:bg-gold-400 text-ink-950 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Play className="w-4 h-4" /> Restore Video
              </button>
            )}
          </div>
        </div>

        <div className="glass rounded-2xl border border-ink-800 p-5 max-h-[calc(100vh-180px)] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium">Settings</h2>
            <button onClick={() => setOptions({ ...DEFAULT_OPTIONS, upscale: 1 })} className="text-xs text-ink-400 hover:text-ink-100">Reset</button>
          </div>
          <RestoreControls options={options} onChange={setOptions} autoColorize={autoColorize} onAutoColorizeChange={setAutoColorize} />
        </div>
      </div>
    </div>
  );
}
