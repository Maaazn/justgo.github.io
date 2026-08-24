import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { DevicePortBus } from "../src/core16/devices";
import { LinearMemory } from "../src/core16/memory";
import { PciConfigurationMechanism } from "../src/core16/pci";

describe("JustGo PCI configuration mechanism", () => {
  it("enumerates the deterministic host bridge through CF8/CFC", () => {
    const pci = new PciConfigurationMechanism();
    const ports = new DevicePortBus(false, { pci });
    [0x00, 0x00, 0x00, 0x80].forEach((value, index) => ports.out8(0xcf8 + index, value));
    expect([0, 1, 2, 3].map((offset) => ports.in8(0xcfc + offset))).toEqual([0x47, 0x4a, 0x01, 0x00]);
  });

  it("allows a Core-16 guest to select and read PCI configuration bytes through DX", () => {
    const ports = new DevicePortBus(false, { pci: new PciConfigurationMechanism() });
    const core = new Core16(new LinearMemory(), ports);
    core.loadProgram(Uint8Array.from([
      0xba, 0xf8, 0x0c, 0xb0, 0x00, 0xee,
      0xba, 0xf9, 0x0c, 0xb0, 0x00, 0xee,
      0xba, 0xfa, 0x0c, 0xb0, 0x00, 0xee,
      0xba, 0xfb, 0x0c, 0xb0, 0x80, 0xee,
      0xba, 0xfc, 0x0c, 0xec,
      0xf4,
    ]));
    core.run();
    expect(core.state.ax & 0xff).toBe(0x47);
  });
});
