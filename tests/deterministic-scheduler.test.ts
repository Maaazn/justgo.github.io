import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { ProgrammableIntervalTimer, DevicePortBus } from "../src/core16/devices";
import { InterruptQueue } from "../src/core16/interrupts";
import { LinearMemory } from "../src/core16/memory";
import { Ps2Controller } from "../src/core16/ps2";
import { BootTrace } from "../src/lab/boot-trace";
import { DeterministicPs2Input } from "../src/lab/deterministic-input";
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

  it("replays an actual Core-16 and PIT schedule with the same boot trace", () => {
    const runCore = (): BootTrace => {
      const memory = new LinearMemory();
      const interrupts = new InterruptQueue();
      const cpu = new Core16(memory, new DevicePortBus(), interrupts);
      cpu.loadProgram(new Uint8Array([0xfb, 0x90, 0x90, 0xf4]));
      const pit = new ProgrammableIntervalTimer(interrupts);
      pit.configureDivisor(2);
      const trace = new BootTrace();
      const scheduler = new DeterministicScheduler(cpu, pit, trace, { instructionsPerTick: 2, oscillatorTicksPerInstruction: 1 });
      scheduler.runTick(); scheduler.runTick(); scheduler.runTick();
      return trace;
    };
    const first = runCore();
    const second = runCore();
    expect(first.equals(second)).toBe(true);
    expect(first.snapshot().some((event) => event.source === "pit" && event.data.generatedInterrupts === 1)).toBe(true);
  });

  it("records queued PS/2 input before CPU execution in the same deterministic slot", () => {
    const cpu: ScheduledCpu = { state: { halted: false, steps: 0 }, step: () => ({ address: 0, opcode: 0x90, mnemonic: "NOP" }) };
    const trace = new BootTrace();
    const input = new DeterministicPs2Input(new Ps2Controller());
    input.enqueue({ kind: "keyboard", scanCode: 0x1c });
    new DeterministicScheduler(cpu, { advanceOscillatorTicks: () => 0 }, trace, { instructionsPerTick: 1, oscillatorTicksPerInstruction: 0 }, { input }).runTick();
    expect(trace.snapshot().map((event) => `${event.source}:${event.kind}`)).toEqual(["scheduler:tick.begin", "ps2:input", "cpu:instruction", "pit:advance", "video:frame.ready", "scheduler:tick.end"]);
  });
});
