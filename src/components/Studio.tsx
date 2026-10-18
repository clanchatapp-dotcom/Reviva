import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  Download,
  Loader2,
  Wand2,
  Image as ImageIcon,
  Film,
  ChevronDown,
} from 'lucide-react';
import {
  RestoreOptions,
  DEFAULT_OPTIONS,
  processImage,
  loadImageFromFile,
  canvasToBlob,
} from '@/lib/imageProcessing';
import { saveItem, makeThumbnail, makeThumbFromDataURL, canvasToDataURL, GalleryItem } from '@/lib/gallery';
import { RestoreControls } from './RestoreControls';
import { BeforeAfter } from './BeforeAfter';

interface StudioProps {
  onSave: () => void;
}

export function Studio({ onSave }: StudioProps) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const [options, setOptions] = useState<RestoreOptions>({ ...DEFAULT_OPTIONS });
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; pct: number }>({ stage: '', pct: 0 });
  const [fileName, setFileName] = useState('restored');
  const [autoColorize, setAutoColorize] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setProcessing(true);
    setProgress({ stage: 'Loading', pct: 0 });
    setResultUrl(null);
    try {
      const img = await loadImageFromFile(file);
      setSourceImg(img);
      setOriginalUrl(img.src);
      setFileName(file.name.replace(/\.[^.]+$/, '') || 'restored');
      // Auto-detect grayscale for colorize default
      let isGray = false;
      if (autoColorize) {
        const tc = document.createElement('canvas');
        tc.width = Math.min(200, img.width);
        tc.height = Math.max(1, Math.round(tc.width * img.height / img.width));
        tc.getContext('2d')!.drawImage(img, 0, 0, tc.width, tc.height);
        const d = tc.getContext('2d')!.getImageData(0,0,tc.width,tc.height).data;
        let diff = 0, n = 0;
        for (let i = 0; i < d.length; i += 4*5) { diff += Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]); n++; }
        isGray = (diff/n) < 8;
      }
      const effectiveOpts = { ...options, colorize: isGray ? 65 : options.colorize };
      setOptions(effectiveOpts);
      const result = await processImage(img, effectiveOpts, (s, p) => setProgress({ stage: s, pct: p }));
      setResultCanvas(result.canvas);
      setResultUrl(result.canvas.toDataURL('image/jpeg', 0.92));
    } catch (e) {
      console.error(e);
    }
    setProcessing(false);
  }, [options, autoColorize]);

  // Re-process when options change (debounced)
  useEffect(() => {
    if (!sourceImg) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setProcessing(true);
      try {
        const result = await processImage(sourceImg, options, (s, p) => setProgress({ stage: s, pct: p }));
        setResultCanvas(result.canvas);
        setResultUrl(result.canvas.toDataURL('image/jpeg', 0.92));
      } catch (e) { console.error(e); }
      setProcessing(false);
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [options, sourceImg]);

  const handleDownload = async () => {
    if (!resultCanvas) return;
    const blob = await canvasToBlob(resultCanvas, 'image/png');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${fileName}-restored.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSaveToGallery = async () => {
    if (!resultCanvas || !originalUrl) return;
    const id = `item-${Date.now()}`;
    const thumb = makeThumbnail(resultCanvas, 320);
    const origThumb = await makeThumbFromDataURL(originalUrl, 320).catch(() => originalUrl);
    const fullData = canvasToDataURL(resultCanvas);
    const item: GalleryItem = {
      id,
      kind: 'image',
      name: fileName,
      createdAt: Date.now(),
      thumbnail: thumb,
      originalPreview: origThumb,
      resultDataUrl: fullData,
      width: resultCanvas.width,
      height: resultCanvas.height,
      options,
      durationMs: progress.pct ? 0 : 0,
    };
    await saveItem(item);
    onSave();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  if (!sourceImg) {
    return (
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-20">
        <div className="text-center mb-10 animate-floatUp">
          <h1 className="font-display text-5xl md:text-6xl font-medium leading-[1.05] tracking-tight">
            Bring your old photos
            <br />
            <span className="gold-gradient-text italic">back to life.</span>
          </h1>
          <p className="text-ink-300 mt-5 text-lg max-w-xl mx-auto leading-relaxed">
            Restore damaged, blurry, and black-and-white photographs with authentic,
            film-faithful results — upscale to 4x, repair scratches, and reveal true color.
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
              <Upload className="w-8 h-8 text-gold-400" />
            </div>
            <div>
              <p className="text-ink-100 text-lg font-medium">Drop a photo here</p>
              <p className="text-ink-400 text-sm mt-1">or click to browse — JPG, PNG, WEBP</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold transition-colors shadow-lg shadow-gold-500/20"
            >
              Choose Photo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {[
            { icon: Sparkles, title: 'Authentic color', desc: 'Subtle, film-like tones — never the over-painted AI look.' },
            { icon: Wand2, title: 'Smart repair', desc: 'Removes scratches, dust, and damage while preserving detail.' },
            { icon: ImageIcon, title: '4x upscaling', desc: 'Lanczos resampling restores sharpness on small prints.' },
          ].map((f, i) => (
            <div key={i} className="glass rounded-xl p-5 border border-ink-800 animate-floatUp" style={{ animationDelay: `${i*80}ms` }}>
              <f.icon className="w-5 h-5 text-gold-400 mb-3" />
              <h3 className="font-medium text-ink-100">{f.title}</h3>
              <p className="text-sm text-ink-400 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-6 pb-20">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => { setSourceImg(null); setResultUrl(null); setOriginalUrl(null); }}
            className="px-3 py-1.5 rounded-lg text-sm text-ink-300 hover:text-ink-100 hover:bg-ink-800 transition-colors flex items-center gap-1.5"
          >
            <ChevronDown className="w-4 h-4 rotate-90" /> New
          </button>
          <span className="text-ink-400 text-sm truncate">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveToGallery}
            disabled={!resultCanvas}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-100 bg-ink-800 hover:bg-ink-750 border border-ink-700 transition-colors disabled:opacity-40"
          >
            Save to Gallery
          </button>
          <button
            onClick={handleDownload}
            disabled={!resultCanvas || processing}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gold-500 hover:bg-gold-400 text-ink-950 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* Viewer */}
        <div className="glass rounded-2xl border border-ink-800 overflow-hidden min-h-[400px] flex flex-col">
          <div className="flex-1 flex items-center justify-center p-4 bg-ink-950/60 relative">
            {processing && (
              <div className="absolute inset-0 z-10 bg-ink-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 animate-fadeIn">
                <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
                <p className="text-ink-200 text-sm font-medium">{progress.stage}…</p>
                <div className="w-48 h-1 bg-ink-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-500 transition-all duration-300" style={{ width: `${progress.pct*100}%` }} />
                </div>
              </div>
            )}
            {originalUrl && resultUrl ? (
              <BeforeAfter before={originalUrl} after={resultUrl} />
            ) : (
              <div className="text-ink-500">Processing…</div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="glass rounded-2xl border border-ink-800 p-5 max-h-[calc(100vh-180px)] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium">Restoration</h2>
            <button
              onClick={() => setOptions({ ...DEFAULT_OPTIONS })}
              className="text-xs text-ink-400 hover:text-ink-100 transition-colors"
            >
              Reset
            </button>
          </div>
          <RestoreControls options={options} onChange={setOptions} autoColorize={autoColorize} onAutoColorizeChange={setAutoColorize} />
        </div>
      </div>
    </div>
  );
}
