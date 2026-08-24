import { describe, expect, it } from "vitest";
import { BootTrace } from "../src/lab/boot-trace";
import { firstTraceDivergence, replayInputsFromTrace } from "../src/lab/replay";

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
});
