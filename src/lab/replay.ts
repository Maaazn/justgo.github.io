import type { Cpu64State, Register64Name } from "../core64/registers";
import type { BootTraceEvent } from "./boot-trace";

export interface ReplayInput {
  readonly tick: number;
  readonly kind: "keyboard" | "mouse";
}

export interface ReplayDeviceEvent {
  readonly tick: number;
  readonly source: "pic" | "device";
  readonly kind: string;
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface TraceDivergence {
  readonly index: number;
  readonly expected?: BootTraceEvent;
  readonly actual?: BootTraceEvent;
}

export interface GuestReplayState {
  readonly rip: bigint;
  readonly rsp: bigint;
  readonly rflags: bigint;
  readonly registers: Readonly<Record<string, bigint>>;
}

export interface GuestStateDivergence {
  readonly field: string;
  readonly expected: bigint;
  readonly actual: bigint;
}

export interface ReplayExecution {
  readonly trace: readonly BootTraceEvent[];
  readonly guest: GuestReplayState;
}

export interface DifferentialReplayResult {
  readonly traceDivergence: TraceDivergence | undefined;
  readonly guestStateDivergence: GuestStateDivergence | undefined;
  readonly equivalent: boolean;
}

const CORE64_REPLAY_REGISTERS: readonly Register64Name[] = [
  "rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp",
  "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15",
];

/** Capture the Core-64 architectural state that must remain stable across replay. */
export function captureCore64ReplayState(state: Readonly<Cpu64State>): GuestReplayState {
  const registers: Record<string, bigint> = {};
  for (const name of CORE64_REPLAY_REGISTERS) registers[name] = state[name];
  return { rip: state.rip, rsp: state.rsp, rflags: state.rflags, registers };
}

/** Compare fully executed deterministic fixtures without hiding their first mismatch. */
export function compareReplayExecutions(expected: ReplayExecution, actual: ReplayExecution): DifferentialReplayResult {
  const traceDivergence = firstTraceDivergence(expected.trace, actual.trace);
  const guestStateDivergence = firstGuestStateDivergence(expected.guest, actual.guest);
  return { traceDivergence, guestStateDivergence, equivalent: traceDivergence === undefined && guestStateDivergence === undefined };
}

/** Execute an isolated fixture twice, then report trace and architectural-state equivalence. */
export function runRepeatedReplay(execute: () => ReplayExecution): DifferentialReplayResult {
  return compareReplayExecutions(execute(), execute());
}

export function replayInputsFromTrace(events: readonly BootTraceEvent[]): readonly ReplayInput[] {
  let lastSequence = -1;
  let lastTick = -1;
  const inputs: ReplayInput[] = [];
  for (const event of events) {
    if (event.sequence !== lastSequence + 1 || event.tick < lastTick) throw new Error("سجل replay غير مرتب أو غير متصل.");
    lastSequence = event.sequence; lastTick = event.tick;
    if (event.source !== "ps2" || event.kind !== "input") continue;
    const kind = event.data.kind;
    if (kind !== "keyboard" && kind !== "mouse") throw new Error("حدث PS/2 في السجل لا يملك نوع إعادة صالحاً.");
    inputs.push({ tick: event.tick, kind });
  }
  return inputs;
}

/** Extract deterministic PIC/RTC/storage events at the tick where they occurred. */
export function replayDevicesFromTrace(events: readonly BootTraceEvent[]): readonly ReplayDeviceEvent[] {
  let lastSequence = -1;
  let lastTick = -1;
  const devices: ReplayDeviceEvent[] = [];
  for (const event of events) {
    if (event.sequence !== lastSequence + 1 || event.tick < lastTick) throw new Error("سجل replay غير مرتب أو غير متصل.");
    lastSequence = event.sequence; lastTick = event.tick;
    if (event.source !== "pic" && event.source !== "device") continue;
    devices.push({ tick: event.tick, source: event.source, kind: event.kind, data: { ...event.data } });
  }
  return devices;
}

export function firstTraceDivergence(expected: readonly BootTraceEvent[], actual: readonly BootTraceEvent[]): TraceDivergence | undefined {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(expected[index]) !== JSON.stringify(actual[index])) return { index, expected: expected[index], actual: actual[index] };
  }
  return undefined;
}

/** Find the first architectural guest-state difference after replay. */
export function firstGuestStateDivergence(expected: GuestReplayState, actual: GuestReplayState): GuestStateDivergence | undefined {
  for (const field of ["rip", "rsp", "rflags"] as const) {
    if (expected[field] !== actual[field]) return { field, expected: expected[field], actual: actual[field] };
  }
  const names = [...new Set([...Object.keys(expected.registers), ...Object.keys(actual.registers)])].sort();
  for (const name of names) {
    const wanted = expected.registers[name] ?? 0n;
    const found = actual.registers[name] ?? 0n;
    if (wanted !== found) return { field: `registers.${name}`, expected: wanted, actual: found };
  }
  return undefined;
}
