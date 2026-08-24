import { describe, expect, it } from "vitest";
import { Core16, StepLimitError, UnsupportedOpcodeError } from "../src/core16/cpu";
import { LinearMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";
import { FLAG_CARRY, FLAG_OVERFLOW, FLAG_SIGN, FLAG_ZERO, physicalAddress } from "../src/core16/types";

function createCore() {
  const memory = new LinearMemory();
  const ports = new TestPortBus();
  const core = new Core16(memory, ports);
  return { core, memory, ports };
}

describe("JustGo Core-16", () => {
  it("executes immediate arithmetic and exposes carry/zero flags", () => {
    const { core } = createCore();
    core.loadProgram(Uint8Array.from([0xb8, 0xff, 0xff, 0x05, 0x01, 0x00, 0xf4]));
    core.run();
    expect(core.state.ax).toBe(0);
    expect(core.state.flags & FLAG_CARRY).toBeTruthy();
    expect(core.state.flags & FLAG_ZERO).toBeTruthy();
  });

  it("keeps carry across INC but updates signed overflow", () => {
    const { core } = createCore();
    core.state.flags |= FLAG_CARRY;
    core.loadProgram(Uint8Array.from([0xb8, 0xff, 0x7f, 0x40, 0xf4]));
    core.run();
    expect(core.state.ax).toBe(0x8000);
    expect(core.state.flags & FLAG_OVERFLOW).toBeTruthy();
    expect(core.state.flags & FLAG_SIGN).toBeTruthy();
    expect(core.state.flags & FLAG_CARRY).toBeTruthy();
  });

  it("uses segment:offset addressing and word memory moves", () => {
    const { core, memory } = createCore();
    core.state.ds = 0x1234;
    core.loadProgram(Uint8Array.from([0xb8, 0xef, 0xbe, 0xa3, 0x20, 0x00, 0xb8, 0x00, 0x00, 0xa1, 0x20, 0x00, 0xf4]));
    core.run();
    expect(memory.read16(physicalAddress(0x1234, 0x20))).toBe(0xbeef);
    expect(core.state.ax).toBe(0xbeef);
  });

  it("supports call, stack and return", () => {
    const { core } = createCore();
    core.loadProgram(Uint8Array.from([0xe8, 0x01, 0x00, 0xf4, 0x90, 0xb8, 0x34, 0x12, 0xc3]));
    core.run();
    expect(core.state.ax).toBe(0x1234);
    expect(core.state.sp).toBe(0xfffe);
  });

  it("follows a BIOS reset vector through FAR JMP into a boot sector handoff", () => {
    const { core, memory } = createCore();
    memory.load(0xffff0, Uint8Array.from([0xea, 0x00, 0x01, 0x00, 0xf0]));
    memory.load(physicalAddress(0xf000, 0x0100), Uint8Array.from([0xea, 0x00, 0x7c, 0x00, 0x00]));
    memory.load(0x7c00, Uint8Array.from([0xb8, 0xef, 0xbe, 0xf4]));
    core.reset({ cs: 0xf000, ip: 0xfff0, sp: 0xfffe });
    expect(core.run().map((entry) => entry.mnemonic)).toEqual(["JMP ptr16:16", "JMP ptr16:16", "MOV AX, imm16", "HLT"]);
    expect(core.state.ax).toBe(0xbeef);
    expect(core.state.cs).toBe(0);
    expect(core.state.ip).toBe(0x7c04);
  });

  it("routes port I/O through the injected bus", () => {
    const { core, ports } = createCore();
    ports.setInput(0x66, 0xab);
    core.loadProgram(Uint8Array.from([0xe4, 0x66, 0xe6, 0xe9, 0xf4]));
    core.run();
    expect(core.state.ax & 0xff).toBe(0xab);
    expect(ports.writes).toEqual([{ port: 0xe9, value: 0xab }]);
  });

  it("refuses unknown instructions and infinite loops", () => {
    const unknown = createCore();
    unknown.core.loadProgram(Uint8Array.from([0x0f, 0xf4]));
    expect(() => unknown.core.run()).toThrow(UnsupportedOpcodeError);

    const looping = createCore();
    looping.core.loadProgram(Uint8Array.from([0xeb, 0xfe]));
    expect(() => looping.core.run(12)).toThrow(StepLimitError);
  });
});
