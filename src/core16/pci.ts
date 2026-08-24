import { u8 } from "./types";

export interface PciDeviceIdentity {
  readonly bus: number;
  readonly device: number;
  readonly function: number;
  readonly vendorId: number;
  readonly deviceId: number;
  readonly classCode: number;
  readonly subclass: number;
  readonly programmingInterface?: number;
}

/** PCI configuration mechanism #1 with byte-accessible address and data ports. */
export class PciConfigurationMechanism {
  private readonly addressBytes = new Uint8Array(4);
  private readonly devices = new Map<string, Uint8Array>();

  constructor(identities: readonly PciDeviceIdentity[] = defaultPciDevices()) {
    identities.forEach((identity) => this.addDevice(identity));
  }

  addDevice(identity: PciDeviceIdentity): void {
    const config = new Uint8Array(256).fill(0);
    config[0] = identity.vendorId & 0xff;
    config[1] = identity.vendorId >>> 8;
    config[2] = identity.deviceId & 0xff;
    config[3] = identity.deviceId >>> 8;
    config[9] = identity.programmingInterface ?? 0;
    config[10] = identity.subclass;
    config[11] = identity.classCode;
    config[14] = 0;
    this.devices.set(keyOf(identity.bus, identity.device, identity.function), config);
  }

  in8(port: number): number {
    if (port >= 0xcf8 && port <= 0xcfb) return this.addressBytes[port - 0xcf8] ?? 0;
    if (port < 0xcfc || port > 0xcff) return 0xff;
    const address = this.address();
    if ((address & 0x8000_0000) === 0) return 0xff;
    const bus = (address >>> 16) & 0xff;
    const device = (address >>> 11) & 0x1f;
    const functionNumber = (address >>> 8) & 7;
    const offset = (address & 0xfc) + (port - 0xcfc);
    return this.devices.get(keyOf(bus, device, functionNumber))?.[offset] ?? 0xff;
  }

  out8(port: number, value: number): void {
    if (port >= 0xcf8 && port <= 0xcfb) this.addressBytes[port - 0xcf8] = u8(value);
  }

  private address(): number {
    return (this.addressBytes[0] ?? 0)
      | ((this.addressBytes[1] ?? 0) << 8)
      | ((this.addressBytes[2] ?? 0) << 16)
      | ((this.addressBytes[3] ?? 0) << 24);
  }
}

function keyOf(bus: number, device: number, functionNumber: number): string {
  return `${bus & 0xff}:${device & 0x1f}:${functionNumber & 7}`;
}

function defaultPciDevices(): readonly PciDeviceIdentity[] {
  return [
    { bus: 0, device: 0, function: 0, vendorId: 0x4a47, deviceId: 0x0001, classCode: 0x06, subclass: 0x00 },
    { bus: 0, device: 1, function: 0, vendorId: 0x4a47, deviceId: 0x0002, classCode: 0x01, subclass: 0x01, programmingInterface: 0x80 },
    { bus: 0, device: 2, function: 0, vendorId: 0x4a47, deviceId: 0x0003, classCode: 0x03, subclass: 0x00 },
  ];
}
