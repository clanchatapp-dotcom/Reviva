// IndexedDB-backed gallery for restored projects.
import { RestoreOptions } from './imageProcessing';

export interface GalleryItem {
  id: string;
  kind: 'image' | 'video' | 'document';
  name: string;
  createdAt: number;
  thumbnail: string; // small dataURL
  originalPreview: string; // small dataURL of original
  resultDataUrl?: string; // for images: full-res dataURL
  resultBlobKey?: string; // for videos: key in blob store
  width: number;
  height: number;
  options: RestoreOptions;
  durationMs: number;
  videoDuration?: number;
  mimeType?: string;
  transcript?: string; // for documents: recognized text
  ocrConfidence?: number;
  ocrLang?: string;
}

const DB_NAME = 'reviva-gallery';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_BLOBS = 'blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveItem(item: GalleryItem, resultBlob?: Blob): Promise<void> {
  const db = await openDB();
  if (resultBlob && item.resultBlobKey) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).put(resultBlob, item.resultBlobKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    tx.objectStore(STORE_ITEMS).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listItems(): Promise<GalleryItem[]> {
  const db = await openDB();
  const items = await new Promise<GalleryItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    const req = tx.objectStore(STORE_ITEMS).getAll();
    req.onsuccess = () => resolve(req.result as GalleryItem[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getItem(id: string): Promise<GalleryItem | undefined> {
  const db = await openDB();
  const item = await new Promise<GalleryItem | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    const req = tx.objectStore(STORE_ITEMS).get(id);
    req.onsuccess = () => resolve(req.result as GalleryItem | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item;
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const db = await openDB();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

export async function deleteItem(id: string): Promise<void> {
  const db = await openDB();
  const item = await getItem(id);
  if (item?.resultBlobKey) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).delete(item.resultBlobKey!);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    tx.objectStore(STORE_ITEMS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Generate a small thumbnail dataURL from a canvas.
export function makeThumbnail(canvas: HTMLCanvasElement, maxDim = 320): string {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const tw = Math.max(1, Math.round(canvas.width * scale));
  const th = Math.max(1, Math.round(canvas.height * scale));
  const tc = document.createElement('canvas');
  tc.width = tw; tc.height = th;
  tc.getContext('2d')!.drawImage(canvas, 0, 0, tw, th);
  return tc.toDataURL('image/jpeg', 0.78);
}

export function makeThumbFromDataURL(dataUrl: string, maxDim = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const tw = Math.max(1, Math.round(img.width * scale));
      const th = Math.max(1, Math.round(img.height * scale));
      const tc = document.createElement('canvas');
      tc.width = tw; tc.height = th;
      tc.getContext('2d')!.drawImage(img, 0, 0, tw, th);
      resolve(tc.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error('thumb failed'));
    img.src = dataUrl;
  });
}

export function canvasToDataURL(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.9);
}

export function blobToObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}
