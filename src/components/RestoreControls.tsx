import { RotateCcw, Wand2 } from 'lucide-react';
import { RestoreOptions } from '@/lib/imageProcessing';

interface Props {
  options: RestoreOptions;
  onChange: (o: RestoreOptions) => void;
  autoColorize: boolean;
  onAutoColorizeChange: (v: boolean) => void;
}

function Slider({
  label, value, min, max, step = 1, onChange, suffix = '', display,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; suffix?: string; display?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <label className="text-sm text-ink-200">{label}</label>
        <span className="text-xs text-ink-400 font-mono tabular-nums">{display ?? `${value > 0 ? '+' : ''}${value}${suffix}`}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function RestoreControls({ options, onChange, autoColorize, onAutoColorizeChange }: Props) {
  const set = <K extends keyof RestoreOptions>(k: K, v: RestoreOptions[K]) =>
    onChange({ ...options, [k]: v });

  return (
    <div>
      <Slider label="Upscale" value={options.upscale} min={1} max={4} step={1}
        onChange={(v) => set('upscale', v)} display={`${options.upscale}x`} />

      <div className="h-px bg-ink-800 my-4" />

      <Slider label="Damage repair" value={options.repair} min={0} max={100}
        onChange={(v) => set('repair', v)} suffix="%" display={`${options.repair}%`} />
      <Slider label="Noise reduction" value={options.denoise} min={0} max={100}
        onChange={(v) => set('denoise', v)} suffix="%" display={`${options.denoise}%`} />
      <Slider label="Detail / sharpen" value={options.sharpen} min={0} max={100}
        onChange={(v) => set('sharpen', v)} suffix="%" display={`${options.sharpen}%`} />

      <div className="h-px bg-ink-800 my-4" />

      <div className="mb-4">
        <div className="flex justify-between items-baseline mb-1.5">
          <label className="text-sm text-ink-200 flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-teal-400" /> Colorize
          </label>
          <span className="text-xs text-ink-400 font-mono tabular-nums">{options.colorize}%</span>
        </div>
        <input type="range" min={0} max={100} value={options.colorize}
          onChange={(e) => set('colorize', Number(e.target.value))} />
        <label className="flex items-center gap-2 mt-2 text-xs text-ink-400 cursor-pointer">
          <input type="checkbox" checked={autoColorize}
            onChange={(e) => onAutoColorizeChange(e.target.checked)}
            className="accent-gold-500" />
          Auto-detect black & white photos
        </label>
      </div>

      <div className="h-px bg-ink-800 my-4" />

      <p className="text-xs uppercase tracking-wider text-ink-500 mb-3 font-medium">Tone</p>
      <Slider label="Brightness" value={options.brighten} min={-50} max={50}
        onChange={(v) => set('brighten', v)} />
      <Slider label="Contrast" value={options.contrast} min={-50} max={50}
        onChange={(v) => set('contrast', v)} />
      <Slider label="Saturation" value={options.saturation} min={-50} max={50}
        onChange={(v) => set('saturation', v)} />
      <Slider label="Warmth" value={options.warmTint} min={-50} max={50}
        onChange={(v) => set('warmTint', v)} />

      <div className="h-px bg-ink-800 my-4" />

      <label className="flex items-center gap-2 text-sm text-ink-200 cursor-pointer">
        <input type="checkbox" checked={options.faceProtect}
          onChange={(e) => set('faceProtect', e.target.checked)}
          className="accent-gold-500" />
        Preserve fine detail
      </label>

      <button
        onClick={() => onChange({ ...{ upscale: 2, denoise: 35, sharpen: 45, colorize: 0, repair: 30, brighten: 8, contrast: 12, saturation: 10, warmTint: 6, faceProtect: true } })}
        className="mt-5 w-full py-2 rounded-lg text-sm text-ink-300 hover:text-ink-100 border border-ink-700 hover:border-ink-600 transition-colors flex items-center justify-center gap-1.5"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Reset all
      </button>
    </div>
  );
}
