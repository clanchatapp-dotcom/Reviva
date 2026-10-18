// In-browser OCR using tesseract.js.
// Runs on the restored canvas so faded/damaged text is recognized more reliably.
import Tesseract from 'tesseract.js';

export type OcrProgress = (stage: string, pct: number) => void;

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  text: string;
  confidence: number;
  words: OcrWord[];
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  confidence: number;
}

export async function recognizeText(
  canvas: HTMLCanvasElement,
  lang: string,
  onProgress?: OcrProgress
): Promise<OcrResult> {
  onProgress?.('Loading OCR engine', 0.02);
  const result = await Tesseract.recognize(canvas, lang, {
    logger: (m: { status: string; progress: number }) => {
      const stageMap: Record<string, string> = {
        'loading tesseract core': 'Loading engine',
        'initializing tesseract': 'Initializing',
        'loading language traineddata': 'Loading language',
        'initializing api': 'Preparing',
        'recognizing text': 'Reading text',
      };
      const stage = stageMap[m.status] ?? m.status;
      const pct = m.status === 'recognizing text' ? 0.2 + m.progress * 0.78 : m.progress;
      onProgress?.(stage, Math.max(0.02, Math.min(0.98, pct)));
    },
  });

  const data = result.data;
  const rawLines = (data as unknown as { lines?: unknown[] }).lines || [];
  const lines: OcrLine[] = (rawLines as {
    text: string; confidence: number;
    words?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
  }[])
    .filter((l) => l.text && l.text.trim().length > 0)
    .map((l) => ({
      text: l.text.trim(),
      confidence: l.confidence,
      words: (l.words || []).map((w) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
      })),
    }));

  onProgress?.('Done', 1);
  return {
    text: data.text.trim(),
    lines,
    confidence: data.confidence,
  };
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'dan', label: 'Danish' },
  { code: 'swe', label: 'Swedish' },
  { code: 'nor', label: 'Norwegian' },
  { code: 'fin', label: 'Finnish' },
  { code: 'rus', label: 'Russian' },
];
