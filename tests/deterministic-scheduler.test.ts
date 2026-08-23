import { describe, expect, it } from "vitest";
import { BootTrace } from "../src/lab/boot-trace";
import { DeterministicScheduler, type ClockedDevice, type ScheduledCpu } from "../src/lab/deterministic-scheduler";

class FakeCpu implements ScheduledCpu {
  readonly state = { halted: false, steps: 0 };
  constructor(private readonly haltAfter: number) {}
  step() {
    const index = this.state.steps++;
    if (this.state.steps >= this.haltAfter) this.state.halted = true;
    return { address: index, opcode: index === this.haltAfter - 1 ? 0xf4 : 0x90, mnemonic: this.state.halted ? "HLT" : "NOP" };
  }
}

class FakePit implements ClockedDevice {
  ticks = 0;
  advanceOscillatorTicks(ticks: number): number { this.ticks += ticks; return Math.floor(this.ticks / 6); }
}

function runScenario(): BootTrace {
  const trace = new BootTrace();
  const scheduler = new DeterministicScheduler(new FakeCpu(5), new FakePit(), trace, { instructionsPerTick: 3, oscillatorTicksPerInstruction: 2 });
  scheduler.runTick();
  scheduler.runTick();
  return trace;
}

describe("JustGo deterministic scheduler", () => {
  it("produces identical ordered boot traces for identical guest inputs", () => {
    const first = runScenario();
    const second = runScenario();
    expect(first.equals(second)).toBe(true);
    expect(first.snapshot().map((event) => event.sequence)).toEqual([...Array(first.snapshot().length).keys()]);
  });

  it("uses a fixed CPU → PIT → video event order per tick", () => {
    const trace = runScenario().snapshot();
    const firstTick = trace.filter((event) => event.tick === 0).map((event) => `${event.source}:${event.kind}`);
    expect(firstTick).toEqual(["scheduler:tick.begin", "cpu:instruction", "cpu:instruction", "cpu:instruction", "pit:advance", "video:frame.ready", "scheduler:tick.end"]);
  });
});
