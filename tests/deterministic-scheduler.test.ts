import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { ProgrammableIntervalTimer, DevicePortBus } from "../src/core16/devices";
import { InterruptQueue } from "../src/core16/interrupts";
import { LinearMemory } from "../src/core16/memory";
import { DualPic8259, PicIrqLineSink } from "../src/core16/pic";
import { Ps2Controller } from "../src/core16/ps2";
import { ScheduledAtaPioDevice, type AsyncAtaBlockMedia } from "../src/core16/ata";
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

class ReadyAtaMedia implements AsyncAtaBlockMedia {
  readonly sectorSize = 512;
  readonly sectorCount = 1;
  private cached = false;
  async prefetch(): Promise<Uint8Array> { this.cached = true; return new Uint8Array(512); }
  readSector(): Uint8Array { if (!this.cached) throw new Error("missing cache"); return new Uint8Array(512); }
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

  it("routes a PIT edge through PIC after the clock phase in a reproducible tick", () => {
    const cpu: ScheduledCpu = { state: { halted: false, steps: 0 }, step: () => ({ address: 0, opcode: 0x90, mnemonic: "NOP" }) };
    const pic = new DualPic8259();
    const vectors: number[] = [];
    const pit = new ProgrammableIntervalTimer(new PicIrqLineSink(pic, 0));
    pit.configureDivisor(1);
    const trace = new BootTrace();
    const scheduler = new DeterministicScheduler(cpu, pit, trace, { instructionsPerTick: 1, oscillatorTicksPerInstruction: 1 }, { interrupts: { dispatch: () => pic.dispatch({ request: (vector) => vectors.push(vector) }) } });
    const result = scheduler.runTick();
    expect(result.deliveredInterrupt).toBe(0x08);
    expect(vectors).toEqual([0x08]);
    expect(trace.snapshot().map((event) => `${event.source}:${event.kind}`)).toEqual(["scheduler:tick.begin", "cpu:instruction", "pit:advance", "pic:dispatch", "video:frame.ready", "scheduler:tick.end"]);
  });

  it("runs RTC and storage phases before PIC dispatch in a reproducible order", () => {
    const cpu: ScheduledCpu = { state: { halted: false, steps: 0 }, step: () => ({ address: 0, opcode: 0x90, mnemonic: "NOP" }) };
    const trace = new BootTrace();
    new DeterministicScheduler(
      cpu,
      { advanceOscillatorTicks: () => 0 },
      trace,
      { instructionsPerTick: 1, oscillatorTicksPerInstruction: 0, millisecondsPerTick: 1000 },
      { rtc: { advanceMilliseconds: () => 1 }, storage: { pump: () => [{ kind: "ata.prefetch.ready" }] }, interrupts: { dispatch: () => 0x76 } },
    ).runTick();
    expect(trace.snapshot().map((event) => `${event.source}:${event.kind}`)).toEqual([
      "scheduler:tick.begin", "cpu:instruction", "pit:advance", "device:rtc", "device:storage", "pic:dispatch", "video:frame.ready", "scheduler:tick.end",
    ]);
  });

  it("records an ATA prefetch completion before dispatching its IRQ14 PIC vector", async () => {
    const cpu: ScheduledCpu = { state: { halted: false, steps: 0 }, step: () => ({ address: 0, opcode: 0x90, mnemonic: "NOP" }) };
    const pic = new DualPic8259();
    pic.out8(0x21, 0); pic.out8(0xa1, 0);
    pic.out8(0x20, 0x11); pic.out8(0x21, 0x20); pic.out8(0x21, 0x04); pic.out8(0x21, 0x01);
    pic.out8(0xa0, 0x11); pic.out8(0xa1, 0x70); pic.out8(0xa1, 0x02); pic.out8(0xa1, 0x01);
    const ata = new ScheduledAtaPioDevice(new ReadyAtaMedia(), new PicIrqLineSink(pic, 14));
    ata.out8(0x1f2, 1); ata.out8(0x1f3, 0); ata.out8(0x1f6, 0xe0); ata.out8(0x1f7, 0x20);
    await Promise.resolve();
    const trace = new BootTrace(); const vectors: number[] = [];
    const scheduler = new DeterministicScheduler(cpu, { advanceOscillatorTicks: () => 0 }, trace, { instructionsPerTick: 1, oscillatorTicksPerInstruction: 0 }, {
      storage: ata,
      interrupts: { dispatch: () => pic.dispatch({ request: (vector) => vectors.push(vector) }) },
    });
    expect(scheduler.runTick().deliveredInterrupt).toBe(0x76);
    expect(vectors).toEqual([0x76]);
    expect(trace.snapshot().filter((event) => event.source === "device")).toEqual([
      expect.objectContaining({ kind: "storage", data: { kind: "ata.prefetch.ready", lba: 0 } }),
    ]);
    const phases = trace.snapshot().map((event) => `${event.source}:${event.kind}`);
    expect(phases.indexOf("device:storage")).toBeLessThan(phases.indexOf("pic:dispatch"));
  });
});
