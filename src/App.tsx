import { useState, useCallback } from 'react';
import { Sparkles, Image as ImageIcon, Film, Clock, FileText } from 'lucide-react';
import { Studio } from '@/components/Studio';
import { VideoStudio } from '@/components/VideoStudio';
import { Gallery } from '@/components/Gallery';
import { DocumentStudio } from '@/components/DocumentStudio';

type View = 'image' | 'video' | 'document' | 'gallery';

function App() {
  const [view, setView] = useState<View>('image');
  const [galleryRefresh, setGalleryRefresh] = useState(0);

  const onSave = useCallback(() => {
    setGalleryRefresh((n) => n + 1);
  }, []);

  return (
    <div className="min-h-screen bg-ink-950 bg-noise text-ink-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-ink-800">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-500 to-gold-700 flex items-center justify-center shadow-lg shadow-gold-500/20">
              <Sparkles className="w-5 h-5 text-ink-950" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold tracking-tight">Reviva</p>
              <p className="text-[10px] text-ink-400 -mt-0.5 uppercase tracking-widest">Restoration Studio</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-ink-850 border border-ink-800 rounded-xl p-1 overflow-x-auto no-scrollbar">
            <NavBtn active={view === 'image'} onClick={() => setView('image')} icon={ImageIcon} label="Photo" />
            <NavBtn active={view === 'video'} onClick={() => setView('video')} icon={Film} label="Video" />
            <NavBtn active={view === 'document'} onClick={() => setView('document')} icon={FileText} label="Docs" />
            <NavBtn active={view === 'gallery'} onClick={() => setView('gallery')} icon={Clock} label="Gallery" />
          </nav>

          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs text-ink-500">100% in-browser · private</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        {view === 'image' && <Studio onSave={onSave} />}
        {view === 'video' && <VideoStudio onSave={onSave} />}
        {view === 'document' && <DocumentStudio onSave={onSave} />}
        {view === 'gallery' && <Gallery refreshKey={galleryRefresh} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-ink-800 py-6 px-6 text-center">
        <p className="text-xs text-ink-500">
          Reviva — authentic photo & video restoration. All processing happens locally in your browser.
        </p>
      </footer>
    </div>
  );
}

function NavBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof Sparkles; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
        active ? 'bg-gold-500 text-ink-950 shadow' : 'text-ink-300 hover:text-ink-100 hover:bg-ink-800'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

export default App;
