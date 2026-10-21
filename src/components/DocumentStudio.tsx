import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Upload, FileText, Loader2, ChevronDown, Download, Copy, Check,
  Wand2, ScanText, Save, Image as ImageIcon,
} from 'lucide-react';
import {
  RestoreOptions, DEFAULT_OPTIONS, processImage, loadImageFromFile, canvasToBlob,
} from '@/lib/imageProcessing';
import { recognizeText, OCR_LANGUAGES } from '@/lib/ocr';
import { saveItem, makeThumbnail, makeThumbFromDataURL, canvasToDataURL, GalleryItem } from '@/lib/gallery';
import { RestoreControls } from './RestoreControls';
import { BeforeAfter } from './BeforeAfter';

interface Props {
  onSave: () => void;
}

export function DocumentStudio({ onSave }: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const [options, setOptions] = useState<RestoreOptions>({
    ...DEFAULT_OPTIONS,
    upscale: 2,
    denoise: 25,
    sharpen: 55,
    repair: 45,
    colorize: 0,
    brighten: 15,
    contrast: 20,
    saturation: -20,
    warmTint: 0,
    clahe: 75,
    dehaze: 50,
  });
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; pct: number }>({ stage: '', pct: 0 });
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ stage: string; pct: number }>({ stage: '', pct: 0 });
  const [lang, setLang] = useState('eng');
  const [fileName, setFileName] = useState('document');
  const [autoColorize, setAutoColorize] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasTranscribed, setHasTranscribed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setProcessing(true);
    setProgress({ stage: 'Loading', pct: 0 });
    setResultUrl(null);
    setOcrText(''); setOcrConfidence(null); setHasTranscribed(false);
    try {
      const img = await loadImageFromFile(file);
      setSourceImg(img);
      setOriginalUrl(img.src);
      setFileName(file.name.replace(/\.[^.]+$/, '') || 'document');
      const result = await processImage(img, options, (s, p) => setProgress({ stage: s, pct: p }));
      setResultCanvas(result.canvas);
      setResultUrl(result.canvas.toDataURL('image/jpeg', 0.92));
    } catch (e) { console.error(e); }
    setProcessing(false);
  }, [options]);

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

  const handleTranscribe = async () => {
    if (!resultCanvas) return;
    setOcrRunning(true);
    setOcrText(''); setOcrConfidence(null); setHasTranscribed(false);
    setOcrProgress({ stage: 'Starting', pct: 0 });
    try {
      const result = await recognizeText(resultCanvas, lang, (s, p) => setOcrProgress({ stage: s, pct: p }));
      setOcrText(result.text);
      setOcrConfidence(result.confidence);
      setHasTranscribed(true);
    } catch (e) {
      console.error(e);
      setOcrText('Transcription failed. Please try again.');
    }
    setOcrRunning(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ocrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([ocrText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${fileName}-transcript.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadImage = async () => {
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
      id, kind: 'document', name: fileName, createdAt: Date.now(),
      thumbnail: thumb, originalPreview: origThumb, resultDataUrl: fullData,
      width: resultCanvas.width, height: resultCanvas.height, options,
      durationMs: 0, transcript: ocrText || undefined,
      ocrConfidence: ocrConfidence ?? undefined, ocrLang: lang,
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
            Read the <span className="gold-gradient-text italic">unreadable.</span>
          </h1>
          <p className="text-ink-300 mt-5 text-lg max-w-xl mx-auto leading-relaxed">
            Restore faded, damaged, or handwritten documents, then transcribe them
            into clean, editable text — all in your browser.
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
              <FileText className="w-8 h-8 text-gold-400" />
            </div>
            <div>
              <p className="text-ink-100 text-lg font-medium">Drop a document here</p>
              <p className="text-ink-400 text-sm mt-1">Letters, records, certificates, scans — JPG, PNG, WEBP</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold transition-colors shadow-lg shadow-gold-500/20"
            >
              Choose Document
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {[
            { icon: Wand2, title: 'Restore first', desc: 'We enhance the scan before reading it, so faded text is recognized.' },
            { icon: ScanText, title: '12 languages', desc: 'Recognizes English, Spanish, French, German, Russian, and more.' },
            { icon: FileText, title: 'Editable output', desc: 'Copy the text or download it as a .txt file for your records.' },
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
            onClick={() => { setSourceImg(null); setResultUrl(null); setOriginalUrl(null); setOcrText(''); setHasTranscribed(false); }}
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
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-100 bg-ink-800 hover:bg-ink-750 border border-ink-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" /> Save
          </button>
          <button
            onClick={handleDownloadImage}
            disabled={!resultCanvas || processing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-100 bg-ink-800 hover:bg-ink-750 border border-ink-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <ImageIcon className="w-4 h-4" /> Image
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* Viewer + transcript */}
        <div className="flex flex-col gap-5">
          <div className="glass rounded-2xl border border-ink-800 overflow-hidden min-h-[300px] flex flex-col">
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

          {/* Transcript panel */}
          <div className="glass rounded-2xl border border-ink-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-ink-800">
              <div className="flex items-center gap-2.5">
                <ScanText className="w-5 h-5 text-gold-400" />
                <h2 className="font-display text-lg font-medium">Transcript</h2>
                {ocrConfidence !== null && hasTranscribed && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-ink-800 text-ink-300 font-mono">
                    {Math.round(ocrConfidence)}% confidence
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  disabled={ocrRunning}
                  className="px-2.5 py-1.5 rounded-lg text-sm bg-ink-850 border border-ink-700 text-ink-100 focus:outline-none focus:border-gold-500 disabled:opacity-50"
                >
                  {OCR_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                {hasTranscribed && ocrText && (
                  <>
                    <button
                      onClick={handleCopy}
                      className="px-2.5 py-1.5 rounded-lg text-sm text-ink-300 hover:text-ink-100 hover:bg-ink-800 transition-colors flex items-center gap-1"
                    >
                      {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={handleDownloadTxt}
                      className="px-2.5 py-1.5 rounded-lg text-sm text-ink-300 hover:text-ink-100 hover:bg-ink-800 transition-colors flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" /> .txt
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="relative">
              {ocrRunning && (
                <div className="absolute inset-0 z-10 bg-ink-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 animate-fadeIn">
                  <Loader2 className="w-7 h-7 text-gold-400 animate-spin" />
                  <p className="text-ink-200 text-sm font-medium">{ocrProgress.stage}…</p>
                  <div className="w-48 h-1 bg-ink-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-500 transition-all duration-200" style={{ width: `${ocrProgress.pct*100}%` }} />
                  </div>
                </div>
              )}
              {ocrText ? (
                <textarea
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  className="w-full p-5 bg-transparent text-ink-100 text-sm leading-relaxed font-mono resize-y min-h-[200px] focus:outline-none"
                  spellCheck={false}
                />
              ) : (
                <div className="p-8 text-center">
                  <p className="text-ink-400 text-sm mb-4">
                    {ocrRunning ? 'Reading your document…' : 'Restore the document, then transcribe it to editable text.'}
                  </p>
                  {!ocrRunning && (
                    <button
                      onClick={handleTranscribe}
                      disabled={!resultCanvas || processing}
                      className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5 mx-auto"
                    >
                      <ScanText className="w-4 h-4" /> Transcribe Document
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="glass rounded-2xl border border-ink-800 p-5 max-h-[calc(100vh-180px)] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium">Enhance</h2>
            <button onClick={() => setOptions({
              ...DEFAULT_OPTIONS,
              upscale: 2, denoise: 25, sharpen: 55, repair: 45, colorize: 0,
              brighten: 15, contrast: 20, saturation: -20, warmTint: 0,
              clahe: 75, dehaze: 50,
            })} className="text-xs text-ink-400 hover:text-ink-100">Reset</button>
          </div>
          <RestoreControls options={options} onChange={setOptions} autoColorize={autoColorize} onAutoColorizeChange={setAutoColorize} />
        </div>
      </div>
    </div>
  );
}
