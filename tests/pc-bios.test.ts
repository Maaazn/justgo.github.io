import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { PcBiosServices, type BiosBlockDevice } from "../src/core16/firmware";
import { LinearMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";
import { FLAG_CARRY } from "../src/core16/types";

function sector(bytes: readonly number[]): Uint8Array {
  const result = new Uint8Array(512);
  result.set(bytes);
  return result;
}

function createDisk(sectors: readonly Uint8Array[]): BiosBlockDevice {
  return { sectorSize: 512, sectorCount: sectors.length, readSector: (lba) => sectors[lba]?.slice() };
}

describe("JustGo PC BIOS services", () => {
  it("reports conventional memory through INT 12h", () => {
    const memory = new LinearMemory();
    const core = new Core16(memory, new TestPortBus(), undefined, {}, new PcBiosServices());
    core.loadProgram(Uint8Array.from([0xcd, 0x12, 0xf4]));
    core.run();
    expect(core.state.ax).toBe(640);
    expect(core.state.flags & FLAG_CARRY).toBe(0);
  });

  it("loads a boot sector through INT 13h CHS into ES:BX and hands it to the guest", () => {
    const disk = createDisk([sector([0xb8, 0xef, 0xbe, 0xf4])]);
    const memory = new LinearMemory();
    const core = new Core16(memory, new TestPortBus(), undefined, { es: 0, bx: 0x7c00 }, new PcBiosServices({ bootDevice: disk }));
    core.loadProgram(Uint8Array.from([
      0xb4, 0x02,
      0xb0, 0x01,
      0xb5, 0x00,
      0xb1, 0x01,
      0xb6, 0x00,
      0xb2, 0x80,
      0xcd, 0x13,
      0xea, 0x00, 0x7c, 0x00, 0x00,
    ]));
    core.run();
    expect(core.state.ax).toBe(0xbeef);
    expect(core.state.cs).toBe(0);
    expect(core.state.ip).toBe(0x7c04);
    expect(core.state.flags & FLAG_CARRY).toBe(0);
  });

  it("reports EDD and reads an LBA sector from a Disk Address Packet", () => {
    const disk = createDisk([sector([1]), sector([0xb8, 0x34, 0x12, 0xf4])]);
    const memory = new LinearMemory();
    memory.load(0x600, Uint8Array.from([
      0x10, 0x00, 0x01, 0x00,
      0x00, 0x7c, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]));
    const core = new Core16(memory, new TestPortBus(), undefined, { ds: 0, si: 0x600 }, new PcBiosServices({ bootDevice: disk }));
    core.loadProgram(Uint8Array.from([
      0xb4, 0x41, 0xbb, 0xaa, 0x55, 0xb2, 0x80, 0xcd, 0x13,
      0xb4, 0x42, 0xcd, 0x13,
      0xea, 0x00, 0x7c, 0x00, 0x00,
    ]));
    core.run();
    expect(core.state.ax).toBe(0x1234);
    expect(core.state.bx).toBe(0xaa55);
    expect(core.state.cx & 1).toBe(1);
    expect(core.state.flags & FLAG_CARRY).toBe(0);
  });
});
