import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";
import { Core64 } from "../src/core64/cpu";
import { createExceptionFrame } from "../src/core64/exceptions";
import { Core64IdtInterruptSink } from "../src/core64/pic-dispatch";
import { createLongModeTss } from "../src/core64/tss";

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
    const vector = 14;
    writeGate(memory, 0x8000 + 0x400 + vector * 16, 0x310n, 0xf);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });
    cpu.deliverException(createExceptionFrame("page-fault", 0x123n, { errorCode: 0x2, faultAddress: 0xdeadn }));

    expect(cpu.state.rip).toBe(0x310n);
    expect(cpu.state.rflags & (1n << 9n)).toBe(1n << 9n);
    expect(cpu.state.rsp).toBe(0x8e0n);
    expect(read64(space, 0x8e0n)).toBe(0x2n);
    expect(read64(space, 0x8e8n)).toBe(0x123n);
    expect(read64(space, 0x8f0n)).toBe(0x8n);
    expect(read64(space, 0x8f8n)).toBe(0x202n);
  });

  it("bridges a platform PIC vector into the configured guest IDT", () => {
    const { cpu, memory } = createFixture();
    writeGate(memory, 0x8000 + 0x400 + 0x28 * 16, 0x360n, 0xe);
    cpu.loadIdtr({ base: 0x400n, limit: 0x7ff });
    new Core64IdtInterruptSink(cpu).request(0x28);
    expect(cpu.state.rip).toBe(0x360n);
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
});
