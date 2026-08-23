import { describe, expect, it } from "vitest";
import { Ps2Controller } from "../src/core16/ps2";
import { DeterministicPs2Input } from "../src/lab/deterministic-input";

describe("deterministic PS/2 input", () => {
  it("delivers queued keyboard bytes only when the scheduler consumes a batch", () => {
    const ps2 = new Ps2Controller();
    const input = new DeterministicPs2Input(ps2);
    input.enqueue({ kind: "keyboard", scanCode: 0x1c });
    expect(ps2.readStatus() & 1).toBe(0);
    expect(input.deliver()).toEqual([{ kind: "keyboard", scanCode: 0x1c }]);
    expect(ps2.readData()).toBe(0x1c);
  });
});
