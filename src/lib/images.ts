import { uid } from "./uid";
import type { NoteImage } from "./types";

const DB_NAME = "habits-db";
const STORE = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredImage extends NoteImage {
  data: Blob | string;
}

export async function putImage(data: Blob | string, name: string, kind: NoteImage["kind"]): Promise<string> {
  const id = uid();
  await new Promise<void>((resolve, reject) => {
    openDb()
      .then((db) => {
        const t = db.transaction(STORE, "readwrite");
        t.objectStore(STORE).put({ id, data, name, kind, createdAt: Date.now() });
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      })
      .catch(reject);
  });
  return id;
}

export async function getImage(id: string): Promise<StoredImage | null> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as StoredImage | undefined) ?? null);
        };
        req.onerror = () => reject(req.error);
      })
      .catch(() => resolve(null));
  });
}

export async function deleteImage(id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    openDb()
      .then((db) => {
        const t = db.transaction(STORE, "readwrite");
        t.objectStore(STORE).delete(id);
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      })
      .catch(reject);
  });
}

export async function listImages(): Promise<NoteImage[]> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        req.onsuccess = () => {
          db.close();
          resolve(
            (req.result as StoredImage[]).map(({ id, name, kind, createdAt }) => ({
              id,
              name,
              kind,
              createdAt
            }))
          );
        };
        req.onerror = () => reject(req.error);
      })
      .catch(() => resolve([]));
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
