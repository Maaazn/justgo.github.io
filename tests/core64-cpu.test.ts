import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";
import { Core64 } from "../src/core64/cpu";
import { CORE64_MEMORY_ALU_CORPUS } from "../src/lab/execution-corpus";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

function createCpu(): Core64 {
  const memory = new LinearMemory();
  write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n);
  write64(memory, 0x3000, 0x4003n); write64(memory, 0x4000, 0x8003n);
  return new Core64(new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n })));
}

describe("JustGo Core-64 narrow interpreter", () => {
  it("executes REX.W MOV, extended-register MOV, arithmetic and HLT", () => {
    const cpu = createCpu();
    cpu.loadProgram(new Uint8Array([
      0x48, 0xb8, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01,
      0x49, 0xb8, 0xef, 0xbe, 0xad, 0xde, 0, 0, 0, 0,
      0x48, 0x05, 0x05, 0, 0, 0,
      0xf4,
    ]));
    expect(cpu.run().map((entry) => entry.mnemonic)).toEqual(["MOV RAX, imm64", "MOV R8, imm64", "ADD RAX, imm32", "HLT"]);
    expect(cpu.state.rax).toBe(0x0102_0304_0506_070dn);
    expect(cpu.state.r8).toBe(0x0000_0000_dead_beefn);
  });

  it("zero extends a 32-bit immediate write", () => {
    const cpu = createCpu();
    cpu.loadProgram(new Uint8Array([0xb8, 0x78, 0x56, 0x34, 0x12, 0xf4]));
    cpu.run();
    expect(cpu.state.rax).toBe(0x1234_5678n);
  });

  it("executes REX-extended register moves and register arithmetic", () => {
    const cpu = createCpu();
    cpu.loadProgram(new Uint8Array([
      0x49, 0xb8, 0x10, 0, 0, 0, 0, 0, 0, 0,
      0x49, 0xb9, 0x05, 0, 0, 0, 0, 0, 0, 0,
      0x4d, 0x01, 0xc8,
      0x4d, 0x89, 0xc2,
      0xf4,
    ]));
    cpu.run();
    expect(cpu.state.r8).toBe(0x15n);
    expect(cpu.state.r10).toBe(0x15n);
  });

  it("moves 64-bit values through a PML4-translated ModR/M memory operand", () => {
    const cpu = createCpu();
    cpu.loadProgram(new Uint8Array([
      0x48, 0xb8, 0x80, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0xb9, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11,
      0x48, 0x89, 0x08,
      0x48, 0x8b, 0x10,
      0xf4,
    ]));
    cpu.run();
    expect(cpu.state.rdx).toBe(0x1122_3344_5566_7788n);
  });

  it("runs a named PML4 guest program from the execution corpus", () => {
    const sample = CORE64_MEMORY_ALU_CORPUS[0];
    const cpu = createCpu();
    cpu.loadProgram(sample.bytes);
    cpu.run();
    expect(cpu.state[sample.expected.register]).toBe(sample.expected.value);
  });

  it("executes ADD and CMP against a PML4-translated memory operand", () => {
    const cpu = createCpu();
    cpu.loadProgram(new Uint8Array([
      0x48, 0xb8, 0x80, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0xb9, 0x02, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0xba, 0x05, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0x89, 0x10,
      0x48, 0x01, 0x08,
      0x48, 0xba, 0x07, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0x39, 0x10,
      0xf4,
    ]));
    cpu.run();
    expect(cpu.state.rflags & (1n << 6n)).toBe(1n << 6n);
  });
});
