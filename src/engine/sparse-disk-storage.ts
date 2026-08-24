/**
 * JustGo local sparse-disk storage: only chunks the guest writes are stored.
 * The implementation never allocates or uploads the advertised disk capacity.
 */
const DATABASE = "justgo-sparse-disks";
const STORE = "chunks";

export interface SparseChunkStore {
  read(diskId: string, chunkIndex: number): Promise<Uint8Array | undefined>;
  write(diskId: string, chunkIndex: number, bytes: Uint8Array): Promise<void>;
}

function key(diskId: string, chunkIndex: number): [string, number] {
  return [diskId, chunkIndex];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح مخزن القرص المحلي."));
  });
}

async function request<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const result = operation(database.transaction(STORE, mode).objectStore(STORE));
    result.onsuccess = () => resolve(result.result as T);
    result.onerror = () => reject(result.error ?? new Error("تعذر تحديث قطاع القرص المحلي."));
  }).finally(() => database.close());
}

/** Browser-backed sector cache for a guest disk. It is intentionally origin-local. */
export class IndexedDbSparseChunkStore implements SparseChunkStore {
  async read(diskId: string, chunkIndex: number): Promise<Uint8Array | undefined> {
    const stored = await request<Uint8Array | undefined>("readonly", (store) => store.get(key(diskId, chunkIndex)));
    return stored ? stored.slice() : undefined;
  }

  async write(diskId: string, chunkIndex: number, bytes: Uint8Array): Promise<void> {
    await request<IDBValidKey>("readwrite", (store) => store.put(bytes.slice(), key(diskId, chunkIndex)));
  }
}

/**
 * A stable local identity without hashing the full image into RAM. Changing the
 * ISO file or disk capacity deliberately selects a different virtual disk.
 */
export function sparseDiskIdentity(imageId: string, file: File | undefined, sizeGiB: number): string {
  const source = file ? `${file.name}:${file.size}:${file.lastModified}` : imageId;
  return `v1:${imageId}:${source}:${sizeGiB}GiB`;
}
