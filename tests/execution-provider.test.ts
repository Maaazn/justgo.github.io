import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { InterruptQueue } from "../src/core16/interrupts";
import { VersionedMemory } from "../src/core16/memory";
import { DevicePortBus } from "../src/core16/devices";
import { createExecutionProvider } from "../src/lab/execution-provider";

function createCore(memory: VersionedMemory): Core16 {
  return new Core16(memory, new DevicePortBus(), new InterruptQueue());
}

const program = new Uint8Array([
  0xb8, 0x02, 0x00, // MOV AX, 2
  0x40,             // INC AX
  0x40,             // INC AX
  0x2d, 0x01, 0x00, // SUB AX, 1
  0xf4,             // HLT
]);

describe("JustGo execution providers", () => {
  it("keeps interpreter and block-cache guest state equivalent", () => {
    const interpreterMemory = new VersionedMemory();
    const cachedMemory = new VersionedMemory();
    const interpreted = createCore(interpreterMemory);
    const cached = createCore(cachedMemory);
    interpreted.loadProgram(program);
    cached.loadProgram(program);
    const direct = createExecutionProvider("interpreter").execute(interpreted, 16);
    const translated = createExecutionProvider("block-cache", cachedMemory).execute(cached, 16);
    expect(direct.executed).toBe(translated.executed);
    expect(cached.state.ax).toBe(interpreted.state.ax);
    expect(cached.state.ip).toBe(interpreted.state.ip);
    expect(cached.state.halted).toBe(interpreted.state.halted);
  });

  it("requires versioned memory before selecting the block-cache mode", () => {
    expect(() => createExecutionProvider("block-cache")).toThrow("VersionedMemory");
  });
});
