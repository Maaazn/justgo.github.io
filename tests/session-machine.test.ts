import { describe, expect, it } from "vitest";
import { LocalSessionMachine } from "../src/engine/session-machine";

describe("LocalSessionMachine", () => {
  it("moves through the local boot lifecycle", () => {
    const machine = new LocalSessionMachine();
    machine.transition("validating", "validating");
    machine.transition("loading-runtime", "loading runtime");
    machine.transition("preparing-storage", "preparing storage");
    const booting = machine.transition("booting", "booting", "freedos-demo");
    const running = machine.transition("running", "running");

    expect(booting.startedAt).toBeTruthy();
    expect(running.imageId).toBe("freedos-demo");
    expect(running.state).toBe("running");
  });

  it("rejects invalid state jumps", () => {
    const machine = new LocalSessionMachine();
    expect(() => machine.transition("running", "not allowed")).toThrow("غير مسموح");
  });
});
