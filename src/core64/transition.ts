import { assertLongModeReady, type LongModeControlState, protectedModeEnabled64 } from "./control";
import type { LongModeAddressSpace } from "./address-space";
import { readLongModeGdtCodeDescriptor, type LongModeGdtr } from "./gdt";

export type JustGoExecutionMode = "real" | "protected" | "long";

export interface LongModeCodeSegment {
  readonly selector: number;
  readonly present: boolean;
  readonly executable: boolean;
  readonly longMode: boolean;
}

export interface LongModeMachineState {
  readonly mode: JustGoExecutionMode;
  readonly control: LongModeControlState;
  readonly cs: number;
  readonly rip: bigint;
}

export function classifyExecutionMode(control: LongModeControlState): JustGoExecutionMode {
  if (protectedModeEnabled64(control)) return "protected";
  return "real";
}

/**
 * Models the architectural point after paging/EFER are ready and a 64-bit GDT
 * code segment is selected. CPU instruction decode is intentionally separate.
 */
export function enterLongMode(state: LongModeMachineState, code: LongModeCodeSegment, entryRip: bigint): LongModeMachineState {
  if (state.mode !== "protected") throw new Error("لا يمكن دخول long mode إلا من protected mode في JustGo.");
  assertLongModeReady(state.control);
  if ((code.selector & 0x3) !== 0) throw new Error("يتطلب انتقال long mode code segment بصلاحية kernel في المرحلة الحالية.");
  if (!code.present || !code.executable || !code.longMode) throw new Error("يتطلب انتقال long mode code segment موجوداً وقابلاً للتنفيذ بعلم L.");
  return { mode: "long", control: state.control, cs: code.selector & 0xffff, rip: entryRip & 0xffff_ffff_ffff_ffffn };
}

/** Enter long mode using the code descriptor stored in guest GDT memory. */
export function enterLongModeFromGdt(
  state: LongModeMachineState,
  memory: LongModeAddressSpace,
  gdtr: LongModeGdtr,
  selector: number,
  entryRip: bigint,
): LongModeMachineState {
  return enterLongMode(state, readLongModeGdtCodeDescriptor(memory, gdtr, selector), entryRip);
}
