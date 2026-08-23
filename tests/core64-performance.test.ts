import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";
import { Core64 } from "../src/core64/cpu";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

function createCpuWithMappedPages(pageCount: number): Core64 {
  const memory = new LinearMemory();
  write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n); write64(memory, 0x3000, 0x4003n);
  for (let page = 0; page < pageCount; page += 1) write64(memory, 0x4000 + page * 8, BigInt(0x8000 + page * 0x1000) | 0x3n);
  return new Core64(new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n })));
}

describe("JustGo Core-64 benchmark", () => {
  it("reports deterministic REX.W instruction throughput over multiple PML4 pages", () => {
    const instructions = 8_000;
    const program = new Uint8Array(instructions * 6 + 1);
    for (let index = 0; index < instructions; index += 1) {
      const offset = index * 6;
      program.set([0x48, 0x05, 0x01, 0x00, 0x00, 0x00], offset);
    }
    program[program.length - 1] = 0xf4;
    const cpu = createCpuWithMappedPages(Math.ceil(program.length / 4096));
    cpu.loadProgram(program);
    const started = performance.now();
    cpu.run(instructions + 1);
    const elapsed = performance.now() - started;
    console.log(`JUSTGO_CORE64_BENCHMARK instructions=${instructions + 1} elapsed_ms=${elapsed.toFixed(2)} rax=${cpu.state.rax}`);
    expect(cpu.state.rax).toBe(BigInt(instructions));
    expect(cpu.state.steps).toBe(instructions + 1);
  });
});
