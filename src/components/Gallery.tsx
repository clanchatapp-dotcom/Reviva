import { useEffect, useState, useCallback } from 'react';
import { Trash2, Download, Film, Image as ImageIcon, X, Clock, FileText } from 'lucide-react';
import { GalleryItem, listItems, deleteItem, getBlob } from '@/lib/gallery';
import { downloadBlob } from '@/lib/videoProcessing';

interface Props {
  refreshKey: number;
}

export function Gallery({ refreshKey }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listItems();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDelete = async (id: string) => {
    await deleteItem(id);
    setSelected(null);
    load();
  };

  const handleDownloadItem = async (item: GalleryItem) => {
    if (item.kind === 'image' && item.resultDataUrl) {
      const a = document.createElement('a');
      a.href = item.resultDataUrl;
      a.download = `${item.name}-restored.png`;
      a.click();
    } else if (item.kind === 'video' && item.resultBlobKey) {
      const blob = await getBlob(item.resultBlobKey);
      if (blob) downloadBlob(blob, `${item.name}-restored.webm`);
    } else if (item.kind === 'document') {
      // Download both the restored image and transcript if present
      if (item.resultDataUrl) {
        const a = document.createElement('a');
        a.href = item.resultDataUrl;
        a.download = `${item.name}-restored.png`;
        a.click();
      }
      if (item.transcript) {
        const blob = new Blob([item.transcript], { type: 'text/plain' });
        downloadBlob(blob, `${item.name}-transcript.txt`);
      }
    }
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const fmtSize = (item: GalleryItem) => {
    if (item.kind === 'video') return item.videoDuration ? `${Math.round(item.videoDuration)}s` : 'video';
    if (item.kind === 'document') return item.transcript ? 'document + text' : 'document';
    return `${item.width}×${item.height}`;
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 pt-20 text-center text-ink-400">Loading gallery…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 pt-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ink-850 border border-ink-800 flex items-center justify-center mx-auto mb-5">
          <Clock className="w-7 h-7 text-ink-500" />
        </div>
        <h2 className="font-display text-2xl font-medium text-ink-100">Your gallery is empty</h2>
        <p className="text-ink-400 mt-2">Restored photos, videos, and documents you save will appear here.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-medium">Gallery</h1>
        <span className="text-sm text-ink-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelected(item)}
            className="group relative rounded-xl overflow-hidden border border-ink-800 bg-ink-900 hover:border-ink-600 transition-all duration-300 animate-fadeIn text-left"
          >
            <div className="aspect-square bg-ink-950 overflow-hidden">
              <img
                src={item.thumbnail}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </div>
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-ink-950/80 backdrop-blur-sm flex items-center gap-1">
              {item.kind === 'video' ? <Film className="w-3 h-3 text-gold-400" /> : item.kind === 'document' ? <FileText className="w-3 h-3 text-gold-400" /> : <ImageIcon className="w-3 h-3 text-teal-400" />}
              <span className="text-ink-200 uppercase">{item.kind}</span>
            </div>
            <div className="p-2.5">
              <p className="text-sm text-ink-100 truncate font-medium">{item.name}</p>
              <p className="text-xs text-ink-500 mt-0.5">{fmtDate(item.createdAt)} · {fmtSize(item)}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelected(null)}
        >
          <div
            className="glass rounded-2xl border border-ink-700 max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-ink-800">
              <div className="min-w-0">
                <h3 className="font-medium text-ink-100 truncate">{selected.name}</h3>
                <p className="text-xs text-ink-400">{fmtDate(selected.createdAt)} · {fmtSize(selected)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadItem(selected)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gold-500 hover:bg-gold-400 text-ink-950 transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-red-400 hover:bg-ink-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-ink-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-ink-950/60 p-4">
              {selected.kind === 'image' && selected.resultDataUrl && (
                <div className="flex items-center justify-center">
                  <img src={selected.resultDataUrl} alt={selected.name} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
                </div>
              )}
              {selected.kind === 'video' && selected.resultBlobKey && (
                <div className="flex items-center justify-center">
                  <VideoPlayer blobKey={selected.resultBlobKey} />
                </div>
              )}
              {selected.kind === 'document' && selected.resultDataUrl && (
                <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-ink-500 mb-2 font-medium">Restored document</p>
                    <img src={selected.resultDataUrl} alt={selected.name} className="max-w-full max-h-[60vh] object-contain rounded-lg border border-ink-800" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">Transcript</p>
                      {selected.ocrConfidence !== undefined && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-ink-800 text-ink-300 font-mono">{Math.round(selected.ocrConfidence)}% confidence</span>
                      )}
                    </div>
                    {selected.transcript ? (
                      <pre className="text-sm text-ink-100 font-mono whitespace-pre-wrap leading-relaxed bg-ink-900/60 rounded-lg p-4 border border-ink-800 max-h-[60vh] overflow-y-auto">{selected.transcript}</pre>
                    ) : (
                      <p className="text-sm text-ink-500 italic">No transcript was saved with this document.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoPlayer({ blobKey }: { blobKey: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    getBlob(blobKey).then((blob) => {
      if (blob) { const u = URL.createObjectURL(blob); revoke = u; setUrl(u); }
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [blobKey]);

  if (!url) return <div className="text-ink-400">Loading video…</div>;
  return <video src={url} controls className="max-w-full max-h-[70vh] rounded-lg" />;
}
