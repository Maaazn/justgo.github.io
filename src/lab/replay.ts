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
