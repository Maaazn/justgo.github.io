/**
 * JustGo Local Engine design: each local session is explicit, short lived,
 * and never represents Windows 10 unless a verified compatible image is used.
 */
export type RuntimeFamily = "x86-webassembly";

export type SessionState =
  | "idle"
  | "validating"
  | "loading-runtime"
  | "preparing-storage"
  | "booting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export interface LocalImageDescriptor {
  id: string;
  label: string;
  family: "freedos" | "reactos" | "custom";
  format: "hard-disk" | "cdrom";
  source: "external-demo" | "user-provided" | "future-hosted";
  imageUrl?: string;
  terms: string;
  supportLevel: "verified-demo" | "experimental" | "not-bundled";
}

export interface ViewportSpec {
  width: number;
  height: number;
  memoryMiB: number;
}

export interface LocalLaunchRequest {
  image: LocalImageDescriptor;
  viewport: ViewportSpec;
  persistState: boolean;
}

export interface LocalSessionSnapshot {
  id: string;
  state: SessionState;
  startedAt?: string;
  imageId?: string;
  message: string;
}

export interface RuntimeBridge {
  boot(request: LocalLaunchRequest, mount: HTMLElement): Promise<void>;
  stop(): Promise<void>;
  saveState?(): Promise<Uint8Array>;
}
