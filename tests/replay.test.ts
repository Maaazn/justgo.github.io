import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";
import { Core64 } from "../src/core64/cpu";
import { Core64IdtInterruptSink } from "../src/core64/pic-dispatch";
import { CmosRtc } from "../src/core16/cmos";
import { ProgrammableIntervalTimer } from "../src/core16/devices";
import { DualPic8259, PicIrqLineSink } from "../src/core16/pic";
import { BootTrace } from "../src/lab/boot-trace";
import { DeterministicScheduler, type ScheduledCpu } from "../src/lab/deterministic-scheduler";
import { CORE64_SCHEDULED_REPLAY_CORPUS } from "../src/lab/execution-corpus";
import { captureCore64ReplayState, compareReplayExecutions, firstGuestStateDivergence, firstTraceDivergence, replayDevicesFromTrace, replayInputsFromTrace, runRepeatedReplay, type ReplayExecution } from "../src/lab/replay";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

function writeGate(memory: LinearMemory, physicalAddress: number, handler: bigint): void {
  memory.write8(physicalAddress, Number(handler & 0xffn)); memory.write8(physicalAddress + 1, Number((handler >> 8n) & 0xffn));
  memory.write8(physicalAddress + 2, 0x08); memory.write8(physicalAddress + 5, 0x8e);
  memory.write8(physicalAddress + 6, Number((handler >> 16n) & 0xffn)); memory.write8(physicalAddress + 7, Number((handler >> 24n) & 0xffn));
  write64(memory, physicalAddress + 8, handler >> 32n);
}

function executeCore64ReplayFixture(initial = 3): ReplayExecution {
  const memory = new LinearMemory();
  write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n);
  write64(memory, 0x3000, 0x4003n); write64(memory, 0x4000, 0x8003n);
  const cpu = new Core64(new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n })));
  cpu.loadProgram(new Uint8Array([0x48, 0xb8, initial, 0, 0, 0, 0, 0, 0, 0, 0x48, 0x05, 2, 0, 0, 0, 0xf4]));
  const trace = new BootTrace();
  trace.record(0, "scheduler", "tick.begin", { instructionBudget: 3 });
  for (const instruction of cpu.run()) trace.record(0, "cpu", "instruction", { address: instruction.address.toString(16), opcode: instruction.opcode, mnemonic: instruction.mnemonic });
  trace.record(0, "scheduler", "tick.end", { executed: cpu.state.steps, halted: cpu.state.halted });
  return { trace: trace.snapshot(), guest: captureCore64ReplayState(cpu.state) };
}

function executeScheduledReplay(millisecondsPerTick: number): ReplayExecution {
  const scenario = CORE64_SCHEDULED_REPLAY_CORPUS[0]!;
  const memory = new LinearMemory();
  write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n); write64(memory, 0x3000, 0x4003n); write64(memory, 0x4000, 0x8003n);
  const cpu = new Core64(new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n })), { rsp: 0x900n, rflags: 0x202n });
  writeGate(memory, 0x8000 + 0x400 + 0x20 * 16, 0x300n); writeGate(memory, 0x8000 + 0x400 + 0x70 * 16, 0x320n);
  memory.write8(0x8000 + 0x300, 0xcf); memory.write8(0x8000 + 0x320, 0xcf);
  cpu.loadIdtr({ base: 0x400n, limit: 0x7ff }); cpu.loadProgram(scenario.bytes);
  const pic = new DualPic8259();
  pic.out8(0x21, 0); pic.out8(0xa1, 0); pic.out8(0x20, 0x11); pic.out8(0x21, 0x20); pic.out8(0x21, 0x04); pic.out8(0x21, 0x01);
  pic.out8(0xa0, 0x11); pic.out8(0xa1, 0x70); pic.out8(0xa1, 0x02); pic.out8(0xa1, 0x01);
  const pit = new ProgrammableIntervalTimer(new PicIrqLineSink(pic, 0)); pit.configureDivisor(1);
  const rtc = new CmosRtc(new PicIrqLineSink(pic, 8)); const trace = new BootTrace();
  const scheduledCpu: ScheduledCpu = { state: cpu.state, step: () => { const step = cpu.step(); return { ...step, address: Number(step.address) }; } };
  const scheduler = new DeterministicScheduler(scheduledCpu, pit, trace, { instructionsPerTick: 1, oscillatorTicksPerInstruction: 1, millisecondsPerTick }, {
    rtc,
    interrupts: { dispatch: () => pic.dispatch(new Core64IdtInterruptSink(cpu)) },
  });
  scheduler.runTick(); pic.out8(0x20, 0x20); pit.configureDivisor(0xffff); scheduler.runTick();
  return { trace: trace.snapshot(), guest: captureCore64ReplayState(cpu.state) };
}

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

  it("repeats an executable PML4 guest fixture and reports the first divergent CPU effect", () => {
    expect(runRepeatedReplay(() => executeCore64ReplayFixture())).toMatchObject({ equivalent: true, traceDivergence: undefined, guestStateDivergence: undefined });
    const divergence = compareReplayExecutions(executeCore64ReplayFixture(3), executeCore64ReplayFixture(4));
    expect(divergence.traceDivergence).toBeUndefined();
    expect(divergence.guestStateDivergence).toMatchObject({ field: "registers.rax", expected: 5n, actual: 6n });
  });

  it("replays the PIT/RTC/PIC/IDT corpus deterministically and exposes an RTC divergence", () => {
    const scenario = CORE64_SCHEDULED_REPLAY_CORPUS[0]!;
    expect(runRepeatedReplay(() => executeScheduledReplay(scenario.millisecondsPerTick))).toMatchObject({ equivalent: true, traceDivergence: undefined, guestStateDivergence: undefined });
    const completed = executeScheduledReplay(scenario.millisecondsPerTick);
    expect(completed.guest.rip).toBe(scenario.expectedRip);
    expect(completed.trace.filter((event) => event.source === "pic").map((event) => event.data.vector)).toEqual(scenario.expectedVectors);
    const divergence = compareReplayExecutions(completed, executeScheduledReplay(0));
    expect(divergence.traceDivergence?.index).toBe(3);
    expect(divergence.guestStateDivergence).toMatchObject({ field: "rip", expected: 0x320n, actual: 1n });
  });
});
