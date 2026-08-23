/** Pure control-register model for long-mode eligibility and activation. */
export const CR0_PROTECTED_MODE = 1n << 0n;
export const CR0_PAGING = 1n << 31n;
export const CR4_PAE = 1n << 5n;
export const EFER_LME = 1n << 8n;

export interface LongModeControlState {
  cr0: bigint;
  cr3: bigint;
  cr4: bigint;
  efer: bigint;
}

export function createLongModeControlState(overrides: Partial<LongModeControlState> = {}): LongModeControlState {
  return { cr0: 0n, cr3: 0n, cr4: 0n, efer: 0n, ...overrides };
}

export function hasPae(state: LongModeControlState): boolean { return (state.cr4 & CR4_PAE) !== 0n; }
export function longModeEnabled(state: LongModeControlState): boolean { return (state.efer & EFER_LME) !== 0n; }
export function protectedModeEnabled64(state: LongModeControlState): boolean { return (state.cr0 & CR0_PROTECTED_MODE) !== 0n; }
export function pagingEnabled64(state: LongModeControlState): boolean { return (state.cr0 & CR0_PAGING) !== 0n; }

export function assertLongModeReady(state: LongModeControlState): void {
  if (!protectedModeEnabled64(state)) throw new Error("يتطلب long mode تفعيل CR0.PE.");
  if (!hasPae(state)) throw new Error("يتطلب long mode تفعيل CR4.PAE.");
  if (!longModeEnabled(state)) throw new Error("يتطلب long mode تفعيل EFER.LME.");
  if (!pagingEnabled64(state)) throw new Error("يتطلب long mode تفعيل CR0.PG.");
  if ((state.cr3 & 0xfffn) !== 0n) throw new Error("يتطلب PML4 عنوان CR3 محاذياً إلى 4KiB.");
}

export function longModeActive(state: LongModeControlState): boolean {
  try { assertLongModeReady(state); return true; } catch { return false; }
}
