import { describe, expect, it } from "vitest";
import { BootTrace } from "../src/lab/boot-trace";
import { firstGuestStateDivergence, firstTraceDivergence, replayDevicesFromTrace, replayInputsFromTrace } from "../src/lab/replay";

describe("deterministic replay", () => {
  it("extracts PS/2 input replay slots and locates the first changed event", () => {
    const trace = new BootTrace();
    trace.record(0, "scheduler", "tick.begin"); trace.record(0, "ps2", "input", { kind: "keyboard" }); trace.record(0, "cpu", "instruction", { opcode: 0x90 });
    expect(replayInputsFromTrace(trace.snapshot())).toEqual([{ tick: 0, kind: "keyboard" }]);
    const changed = new BootTrace();
    changed.record(0, "scheduler", "tick.begin"); changed.record(0, "ps2", "input", { kind: "mouse" }); changed.record(0, "cpu", "instruction", { opcode: 0x90 });
    expect(firstTraceDivergence(trace.snapshot(), changed.snapshot())?.index).toBe(1);
  });

  it("rejects a malformed event sequence", () => {
    expect(() => replayInputsFromTrace([{ tick: 0, sequence: 2, source: "ps2", kind: "input", data: { kind: "keyboard" } }])).toThrow("غير مرتب");
  });

  it("extracts PIC, RTC and storage slots for deterministic device replay", () => {
    const trace = new BootTrace();
    trace.record(0, "scheduler", "tick.begin");
    trace.record(0, "device", "rtc", { irq: 8 });
    trace.record(0, "device", "ata.prefetch.ready", { lba: 3 });
    trace.record(0, "pic", "dispatch", { vector: 0x76 });
    trace.record(0, "cpu", "instruction", { opcode: 0x90 });
    expect(replayDevicesFromTrace(trace.snapshot())).toEqual([
      { tick: 0, source: "device", kind: "rtc", data: { irq: 8 } },
      { tick: 0, source: "device", kind: "ata.prefetch.ready", data: { lba: 3 } },
      { tick: 0, source: "pic", kind: "dispatch", data: { vector: 0x76 } },
    ]);
  });

  it("locates the first architectural guest-state difference after replay", () => {
    const expected = { rip: 0x100n, rsp: 0x900n, rflags: 0x202n, registers: { rax: 7n, rdx: 2n } };
    expect(firstGuestStateDivergence(expected, { ...expected, rip: 0x101n })).toMatchObject({ field: "rip", expected: 0x100n, actual: 0x101n });
    expect(firstGuestStateDivergence(expected, { ...expected, registers: { rax: 7n, rdx: 3n } })).toMatchObject({ field: "registers.rdx", expected: 2n, actual: 3n });
  });
});
