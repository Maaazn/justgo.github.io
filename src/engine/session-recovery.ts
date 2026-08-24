/** Browser-only recovery for settings and an explicitly cached local boot medium. */
import type { DisplayPresetId } from "./display-presets";
import type { GuestMemoryMiB } from "./memory-policy";

const SETTINGS_KEY = "justgo.session-recovery.v1";
const DATABASE = "justgo-local-recovery";
const STORE = "media";
const MEDIA_KEY = "boot-medium";

export interface RecoverableSessionSettings {
  imageId: string;
  localFormat: "hard-disk" | "cdrom";
  memoryMiB: GuestMemoryMiB;
  displayId: DisplayPresetId;
  acpiExperimental: boolean;
  retainLocalMedium: boolean;
}

export function encodeRecoverySettings(settings: RecoverableSessionSettings): string {
  return JSON.stringify(settings);
}

export function decodeRecoverySettings(value: string | null): RecoverableSessionSettings | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<RecoverableSessionSettings>;
    if (typeof parsed.imageId !== "string" || (parsed.localFormat !== "hard-disk" && parsed.localFormat !== "cdrom")) return undefined;
    if (typeof parsed.memoryMiB !== "number" || typeof parsed.displayId !== "string" || typeof parsed.acpiExperimental !== "boolean" || typeof parsed.retainLocalMedium !== "boolean") return undefined;
    return parsed as RecoverableSessionSettings;
  } catch {
    return undefined;
  }
}

export function saveRecoverySettings(settings: RecoverableSessionSettings): void {
  window.localStorage.setItem(SETTINGS_KEY, encodeRecoverySettings(settings));
}

export function loadRecoverySettings(): RecoverableSessionSettings | undefined {
  return decodeRecoverySettings(window.localStorage.getItem(SETTINGS_KEY));
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح مخزن الاستعادة المحلي."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const request = operation(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("تعذر تحديث مخزن الاستعادة المحلي."));
  }).finally(() => db.close());
}

export async function saveRecoveryMedium(file: File): Promise<void> {
  await transaction("readwrite", (store) => store.put(file, MEDIA_KEY));
}

export async function loadRecoveryMedium(): Promise<File | undefined> {
  const stored = await transaction<Blob | File | undefined>("readonly", (store) => store.get(MEDIA_KEY));
  if (!stored) return undefined;
  return stored instanceof File ? stored : new File([stored], "restored-local-medium.iso", { type: stored.type });
}

export async function clearRecoveryMedium(): Promise<void> {
  await transaction("readwrite", (store) => store.delete(MEDIA_KEY));
}

export async function requestPersistentRecoveryStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
