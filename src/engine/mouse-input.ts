import type { InputMode } from "./input-control";

export interface PointerMotionSample {
  readonly movementX: number;
  readonly movementY: number;
  readonly buttons: number;
  readonly pointerType: "mouse" | "touch" | "pen";
}

export interface GuestMouseMotion {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly buttons: number;
}

/** Maps browser button bits to the PS/2 left/right/middle bit order. */
export function toPs2Buttons(browserButtons: number): number {
  return ((browserButtons & 1) ? 1 : 0) | ((browserButtons & 2) ? 4 : 0) | ((browserButtons & 4) ? 2 : 0);
}

/** Converts browser Y-down movement to the guest's Y-up PS/2 convention. */
export function translatePointerMotion(sample: PointerMotionSample, mode: InputMode, focused: boolean): GuestMouseMotion | undefined {
  if (!focused) return undefined;
  if (sample.pointerType === "touch" && mode === "pointer-lock") return undefined;
  return {
    deltaX: clamp(sample.movementX),
    deltaY: clamp(-sample.movementY),
    buttons: toPs2Buttons(sample.buttons),
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-255, Math.min(255, Math.trunc(value)));
}
