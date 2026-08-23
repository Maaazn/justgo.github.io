import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { createResetVectorRom, DevicePortBus, FirmwareRom, MappedMemory, SectorDisk, TextModeVga } from "../src/core16/devices";
import { InterruptQueue } from "../src/core16/interrupts";
import { LinearMemory } from "../src/core16/memory";
import { FLAG_INTERRUPT } from "../src/core16/types";

describe("JustGo Core-16 devices", () => {
  it("maps text-mode VGA writes through the memory bus", () => {
    const vga = new TextModeVga();
    const memory = new MappedMemory(new LinearMemory(), [vga]);
    memory.write8(0xb8000, "J".charCodeAt(0));
    memory.write8(0xb8001, 0x0a);
    expect(vga.line(0).startsWith("J")).toBe(true);
  });

  it("preserves fixed-size sector disk writes", () => {
    const disk = new SectorDisk(2);
    const sector = new Uint8Array(512);
    sector[0] = 0x55;
    sector[511] = 0xaa;
    disk.writeSector(0, sector);
    expect(disk.readSector(0)).toEqual(sector);
  });

  it("delivers software interrupts through the vector table and returns", () => {
    const memory = new LinearMemory();
    const ports = new DevicePortBus();
    const core = new Core16(memory, ports);
    memory.write16(0x20 * 4, 0x0100);
    memory.write16(0x20 * 4 + 2, 0x0000);
    memory.load(0x0100, Uint8Array.from([0xb8, 0xef, 0xbe, 0xcf]));
    core.loadProgram(Uint8Array.from([0xcd, 0x20, 0xf4]));
    core.run();
    expect(core.state.ax).toBe(0xbeef);
    expect(core.state.halted).toBe(true);
  });

  it("delivers queued hardware interrupts only while IF is enabled", () => {
    const memory = new LinearMemory();
    const ports = new DevicePortBus();
    const queue = new InterruptQueue();
    const core = new Core16(memory, ports, queue);
    memory.write16(0x21 * 4, 0x0100);
    memory.write16(0x21 * 4 + 2, 0x0000);
    memory.load(0x0100, Uint8Array.from([0xb8, 0x34, 0x12, 0xcf]));
    core.loadProgram(Uint8Array.from([0xf4]));
    core.state.flags |= FLAG_INTERRUPT;
    queue.request(0x21);
    core.run();
    expect(core.state.ax).toBe(0x1234);
  });

  it("keeps a queued hardware interrupt pending while IF is disabled", () => {
    const memory = new LinearMemory();
    const ports = new DevicePortBus();
    const queue = new InterruptQueue();
    const core = new Core16(memory, ports, queue);
    memory.write16(0x22 * 4, 0x0100);
    memory.write16(0x22 * 4 + 2, 0x0000);
    memory.load(0x0100, Uint8Array.from([0xb8, 0x78, 0x56, 0xcf]));
    core.loadProgram(Uint8Array.from([0x90, 0xf4]));
    queue.request(0x22);
    core.step();
    expect(core.state.ax).toBe(0);
    core.state.flags |= FLAG_INTERRUPT;
    core.run();
    expect(core.state.ax).toBe(0x5678);
  });

  it("connects keyboard and debug devices through port I/O", () => {
    const memory = new LinearMemory();
    const ports = new DevicePortBus();
    const core = new Core16(memory, ports);
    ports.enqueueKeyboardScanCode(0x1e);
    core.loadProgram(Uint8Array.from([0xe4, 0x60, 0xe6, 0xe9, 0xf4]));
    core.run();
    expect(ports.debugText()).toBe(String.fromCharCode(0x1e));
  });

  it("maps a read-only firmware ROM and exposes a deterministic x86 reset vector", () => {
    const firmware = createResetVectorRom(0x1234);
    const bus = new MappedMemory(new LinearMemory(), [firmware]);
    expect(bus.read8(0xffff0)).toBe(0xea);
    expect(bus.read16(0xffff1)).toBe(0x1234);
    expect(bus.read16(0xffff3)).toBe(0xf000);
    bus.write8(0xffff0, 0x90);
    expect(bus.read8(0xffff0)).toBe(0xea);
    expect(firmware.ignoredWrites).toEqual([0x90]);
  });

  it("rejects ROM windows outside the system firmware range", () => {
    expect(() => new FirmwareRom(new Uint8Array(1), 0xeffff)).toThrow("ROM firmware");
  });
});
