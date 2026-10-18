import { useRef, useState, useEffect, useCallback } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface Props {
  before: string;
  after: string;
}

export function BeforeAfter({ before, after }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updatePos = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => updatePos(e.clientX);
    const onUp = () => setDragging(false);
    const onTouch = (e: TouchEvent) => updatePos(e.touches[0].clientX);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouch);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, updatePos]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center select-none overflow-hidden rounded-lg cursor-ew-resize"
      onMouseDown={(e) => { setDragging(true); updatePos(e.clientX); }}
      onTouchStart={(e) => { setDragging(true); updatePos(e.touches[0].clientX); }}
    >
      <div className="relative inline-block max-w-full max-h-[70vh]">
        {/* After (base layer) */}
        <img src={after} alt="Restored" className="block max-w-full max-h-[70vh] object-contain" draggable={false} />
        {/* Before (clipped via clip-path to match base layer exactly) */}
        <img
          src={before}
          alt="Original"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />
        {/* Labels */}
        <span className="absolute top-3 left-3 px-2 py-1 rounded-md text-xs font-medium bg-ink-950/70 text-ink-300 backdrop-blur-sm pointer-events-none">Before</span>
        <span className="absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-medium bg-gold-500/90 text-ink-950 backdrop-blur-sm pointer-events-none">After</span>
        {/* Divider handle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gold-500 shadow-[0_0_12px_rgba(230,178,82,0.6)] pointer-events-none"
          style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-gold-500 flex items-center justify-center shadow-lg">
            <MoveHorizontal className="w-5 h-5 text-ink-950" />
          </div>
        </div>
      </div>
    </div>
  );
}
