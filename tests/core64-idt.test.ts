import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";
import { Core64 } from "../src/core64/cpu";
import { createExceptionFrame } from "../src/core64/exceptions";
import { Core64IdtInterruptSink } from "../src/core64/pic-dispatch";
import { createLongModeTss } from "../src/core64/tss";
import { CmosRtc } from "../src/core16/cmos";
import { ProgrammableIntervalTimer } from "../src/core16/devices";
import { DualPic8259, PicIrqLineSink } from "../src/core16/pic";
import { ScheduledAtaPioDevice, type AsyncAtaBlockMedia } from "../src/core16/ata";
import { BootTrace } from "../src/lab/boot-trace";
import { DeterministicScheduler, type ScheduledCpu } from "../src/lab/deterministic-scheduler";
import { CORE64_EXCEPTION_CORPUS } from "../src/lab/execution-corpus";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

function read64(space: LongModeAddressSpace, address: bigint): bigint {
  let value = 0n;
  for (let byte = 0; byte < 8; byte += 1) value |= BigInt(space.read8(address + BigInt(byte), "read")) << BigInt(byte * 8);
  return value;
}

function writeGate(memory: LinearMemory, physicalAddress: number, handler: bigint, type: 0xe | 0xf): void {
  memory.write8(physicalAddress, Number(handler & 0xffn));
  memory.write8(physicalAddress + 1, Number((handler >> 8n) & 0xffn));
  memory.write8(physicalAddress + 2, 0x08);
  memory.write8(physicalAddress + 3, 0);
  memory.write8(physicalAddress + 4, 0);
  memory.write8(physicalAddress + 5, 0x80 | type);
  memory.write8(physicalAddress + 6, Number((handler >> 16n) & 0xffn));
  memory.write8(physicalAddress + 7, Number((handler >> 24n) & 0xffn));
  write64(memory, physicalAddress + 8, handler >> 32n);
}

function createFixture(): { cpu: Core64; space: LongModeAddressSpace; memory: LinearMemory } {
  const memory = new LinearMemory();
  write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n);
  write64(memory, 0x3000, 0x4003n); write64(memory, 0x4000, 0x8003n);
  const space = new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n }));
  return { cpu: new Core64(space, { rsp: 0x900n, rip: 0x123n, rflags: 0x202n }), space, memory };
}

class ReadyAtaMedia implements AsyncAtaBlockMedia {
  readonly sectorSize = 512;
  readonly sectorCount = 1;
  private cached = false;
  async prefetch(): Promise<Uint8Array> { this.cached = true; return new Uint8Array(512); }
  readSector(): Uint8Array { if (!this.cached) throw new Error("ATA sector was not prefetched"); return new Uint8Array(512); }
}

describe("JustGo Core-64 IDT delivery", () => {
  it("delivers an interrupt gate through PML4, clears IF and IRETQ restores the guest frame", () => {
    const { cpu, memory } = createFixture();
    const vector = 32;
    writeGate(memory, 0x8000 + 0x400 + vector * 16, 0x300n, 0xe);
    memory.write8(0x8000 + 0x300, 0xcf);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });

    cpu.deliverInterrupt(vector);
    expect(cpu.state.rip).toBe(0x300n);
    expect(cpu.state.cs).toBe(0x8);
    expect(cpu.state.rflags & (1n << 9n)).toBe(0n);
    expect(cpu.step().mnemonic).toBe("IRETQ");
    expect(cpu.state.rip).toBe(0x123n);
    expect(cpu.state.rflags).toBe(0x202n);
    expect(cpu.state.rsp).toBe(0x900n);
  });

  it("pushes an exception error code ahead of RIP, CS and RFLAGS", () => {
    const { cpu, space, memory } = createFixture();
    const scenario = CORE64_EXCEPTION_CORPUS[0]!;
    writeGate(memory, 0x8000 + 0x400 + scenario.vector * 16, scenario.expectedHandler, 0xf);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });
    cpu.deliverException(createExceptionFrame("page-fault", 0x123n, { errorCode: scenario.errorCode, faultAddress: scenario.faultAddress }));

    expect(cpu.state.rip).toBe(scenario.expectedHandler);
    expect(cpu.state.rflags & (1n << 9n)).toBe(1n << 9n);
    expect(cpu.state.rsp).toBe(scenario.expectedStackPointer);
    expect(read64(space, scenario.expectedStackPointer)).toBe(BigInt(scenario.errorCode));
    expect(read64(space, scenario.expectedStackPointer + 8n)).toBe(0x123n);
    expect(read64(space, scenario.expectedStackPointer + 16n)).toBe(0x8n);
    expect(read64(space, scenario.expectedStackPointer + 24n)).toBe(0x202n);
  });

  it("bridges a platform PIC vector into the configured guest IDT", () => {
    const { cpu, memory } = createFixture();
    writeGate(memory, 0x8000 + 0x400 + 0x28 * 16, 0x360n, 0xe);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });
    new Core64IdtInterruptSink(cpu).request(0x28);
    expect(cpu.state.rip).toBe(0x360n);
  });

  it("delivers scheduled PIT IRQ0 and RTC IRQ8 through PIC into Core-64 IDT gates", () => {
    const { cpu, memory } = createFixture();
    writeGate(memory, 0x8000 + 0x400 + 0x20 * 16, 0x300n, 0xe);
    writeGate(memory, 0x8000 + 0x400 + 0x70 * 16, 0x320n, 0xe);
    memory.write8(0x8000 + 0x300, 0xcf); memory.write8(0x8000 + 0x320, 0xcf);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff }); cpu.loadProgram(new Uint8Array([0x90]));
    const pic = new DualPic8259();
    pic.out8(0x21, 0); pic.out8(0xa1, 0);
    pic.out8(0x20, 0x11); pic.out8(0x21, 0x20); pic.out8(0x21, 0x04); pic.out8(0x21, 0x01);
    pic.out8(0xa0, 0x11); pic.out8(0xa1, 0x70); pic.out8(0xa1, 0x02); pic.out8(0xa1, 0x01);
    const pit = new ProgrammableIntervalTimer(new PicIrqLineSink(pic, 0)); pit.configureDivisor(1);
    const rtc = new CmosRtc(new PicIrqLineSink(pic, 8));
    const scheduledCpu: ScheduledCpu = {
      state: cpu.state,
      step: () => {
        const instruction = cpu.step();
        return { ...instruction, address: Number(instruction.address) };
      },
    };
    const trace = new BootTrace(); const delivered: number[] = [];
    const scheduler = new DeterministicScheduler(scheduledCpu, pit, trace, { instructionsPerTick: 1, oscillatorTicksPerInstruction: 1, millisecondsPerTick: 1000 }, {
      rtc,
      interrupts: { dispatch: () => pic.dispatch({ request: (vector) => { delivered.push(vector); new Core64IdtInterruptSink(cpu).request(vector); } }) },
    });
    expect(scheduler.runTick().deliveredInterrupt).toBe(0x20);
    expect(cpu.state.rip).toBe(0x300n);
    pic.out8(0x20, 0x20); pit.configureDivisor(0xffff);
    expect(scheduler.runTick().deliveredInterrupt).toBe(0x70);
    expect(cpu.state.rip).toBe(0x320n);
    pic.out8(0xa0, 0x20); pic.out8(0x20, 0x20);
    expect(delivered).toEqual([0x20, 0x70]);
    expect(pic.snapshot().slave.isr).toBe(0);
    expect(trace.snapshot().filter((event) => event.source === "pic").map((event) => event.data.vector)).toEqual([0x20, 0x70]);
  });

  it("delivers a scheduler-completed local ATA IRQ14 through PIC into a Core-64 IDT gate", async () => {
    const { cpu, memory } = createFixture();
    writeGate(memory, 0x8000 + 0x400 + 0x76 * 16, 0x340n, 0xe);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff }); cpu.loadProgram(new Uint8Array([0x90]));
    const pic = new DualPic8259();
    pic.out8(0x21, 0); pic.out8(0xa1, 0);
    pic.out8(0x20, 0x11); pic.out8(0x21, 0x20); pic.out8(0x21, 0x04); pic.out8(0x21, 0x01);
    pic.out8(0xa0, 0x11); pic.out8(0xa1, 0x70); pic.out8(0xa1, 0x02); pic.out8(0xa1, 0x01);
    const ata = new ScheduledAtaPioDevice(new ReadyAtaMedia(), new PicIrqLineSink(pic, 14));
    ata.out8(0x1f2, 1); ata.out8(0x1f3, 0); ata.out8(0x1f6, 0xe0); ata.out8(0x1f7, 0x20);
    await Promise.resolve();
    const scheduledCpu: ScheduledCpu = { state: cpu.state, step: () => {
      const instruction = cpu.step(); return { ...instruction, address: Number(instruction.address) };
    } };
    const trace = new BootTrace(); const delivered: number[] = [];
    new DeterministicScheduler(scheduledCpu, { advanceOscillatorTicks: () => 0 }, trace, { instructionsPerTick: 1, oscillatorTicksPerInstruction: 0 }, {
      storage: ata,
      interrupts: { dispatch: () => pic.dispatch({ request: (vector) => { delivered.push(vector); new Core64IdtInterruptSink(cpu).request(vector); } }) },
    }).runTick();
    expect(delivered).toEqual([0x76]);
    expect(cpu.state.rip).toBe(0x340n);
    expect(trace.snapshot().map((event) => `${event.source}:${event.kind}`)).toContain("device:storage");
    expect(trace.snapshot().map((event) => `${event.source}:${event.kind}`).indexOf("device:storage")).toBeLessThan(trace.snapshot().map((event) => `${event.source}:${event.kind}`).indexOf("pic:dispatch"));
  });

  it("uses an IST stack from the loaded TSS before pushing an interrupt frame", () => {
    const { cpu, memory } = createFixture();
    const vector = 0x40;
    writeGate(memory, 0x8000 + 0x400 + vector * 16, 0x380n, 0xe);
    memory.write8(0x8000 + 0x400 + vector * 16 + 4, 1);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });
    cpu.loadTss(createLongModeTss({ ist: [0xa00n, 0n, 0n, 0n, 0n, 0n, 0n] }));
    cpu.deliverInterrupt(vector);
    expect(cpu.state.rsp).toBe(0xa00n - 24n);
    expect(cpu.state.rip).toBe(0x380n);
  });

  it("rejects an IDT gate that would require an unimplemented privilege transition", () => {
    const { cpu, memory } = createFixture();
    const vector = 0x41;
    const gateAddress = 0x8000 + 0x400 + vector * 16;
    writeGate(memory, gateAddress, 0x390n, 0xe);
    memory.write8(gateAddress + 2, 0x1b);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });
    expect(() => cpu.deliverInterrupt(vector)).toThrow(/امتياز/);
  });
});
