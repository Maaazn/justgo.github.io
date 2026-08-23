import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { createResetVectorRom, DevicePortBus, FirmwareRom, FrameBufferVga, MappedMemory, ProgrammableIntervalTimer, SectorDisk, TextModeVga } from "../src/core16/devices";
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

  it("maps RGBA framebuffer bytes and exposes pixels without a DOM surface", () => {
    const framebuffer = new FrameBufferVga(2, 2);
    const memory = new MappedMemory(new LinearMemory(), [framebuffer]);
    memory.write8(0xa0000, 0x11);
    memory.write8(0xa0001, 0x22);
    memory.write8(0xa0002, 0x33);
    memory.write8(0xa0003, 0xff);
    expect(framebuffer.pixel(0, 0)).toEqual([0x11, 0x22, 0x33, 0xff]);
    framebuffer.setPixel(1, 1, [1, 2, 3, 4]);
    expect(framebuffer.frame()).toHaveLength(16);
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

  it("records unsupported port reads and writes without stopping the guest by default", () => {
    const ports = new DevicePortBus();
    expect(ports.in8(0x3f8)).toBe(0xff);
    ports.out8(0x3f8, 0x41);
    expect(ports.unsupportedPorts).toEqual([
      { direction: "in", port: 0x3f8 },
      { direction: "out", port: 0x3f8, value: 0x41 },
    ]);
  });

  it("models PS/2 controller status, command byte and keyboard enable state", () => {
    const ports = new DevicePortBus();
    ports.enqueueKeyboardScanCode(0x1e);
    expect(ports.in8(0x64) & 1).toBe(1);
    expect(ports.in8(0x60)).toBe(0x1e);
    ports.out8(0x64, 0x20);
    expect(ports.in8(0x60)).toBe(0x45);
    ports.out8(0x64, 0xad);
    ports.enqueueKeyboardScanCode(0x30);
    expect(ports.in8(0x60)).toBe(0);
    ports.out8(0x64, 0xae);
    ports.enqueueKeyboardScanCode(0x30);
    expect(ports.in8(0x60)).toBe(0x30);
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

  it("queues IRQ0 after each configured PIT period", () => {
    const queue = new InterruptQueue();
    const pit = new ProgrammableIntervalTimer(queue);
    pit.configureDivisor(4);
    expect(pit.advanceOscillatorTicks(3)).toBe(0);
    expect(pit.advanceOscillatorTicks(5)).toBe(2);
    expect(queue.nextPending()).toBe(0x08);
    expect(queue.nextPending()).toBe(0x08);
  });

  it("delivers PIT IRQ0 to the guest once STI enables hardware interrupts", () => {
    const memory = new LinearMemory();
    const queue = new InterruptQueue();
    const core = new Core16(memory, new DevicePortBus(), queue);
    const pit = new ProgrammableIntervalTimer(queue);
    memory.write16(0x08 * 4, 0x0100);
    memory.write16(0x08 * 4 + 2, 0x0000);
    memory.load(0x0100, Uint8Array.from([0xb8, 0x34, 0x12, 0xcf]));
    core.loadProgram(Uint8Array.from([0xfb, 0xf4]));
    pit.configureDivisor(1);
    pit.advanceOscillatorTicks(1);
    core.run();
    expect(core.state.ax).toBe(0x1234);
    expect(core.state.halted).toBe(true);
  });
});
