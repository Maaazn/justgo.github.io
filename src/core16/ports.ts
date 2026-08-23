/** JustGo Core-16 design: port I/O is an injected contract, never a hidden DOM side effect. */
import { u8 } from "./types";

export interface PortBus {
  in8(port: number): number;
  out8(port: number, value: number): void;
}

export class TestPortBus implements PortBus {
  readonly writes: Array<{ port: number; value: number }> = [];
  private readonly inputs = new Map<number, number>();

  setInput(port: number, value: number): void {
    this.inputs.set(port & 0xffff, u8(value));
  }

  in8(port: number): number {
    return this.inputs.get(port & 0xffff) ?? 0xff;
  }

  out8(port: number, value: number): void {
    this.writes.push({ port: port & 0xffff, value: u8(value) });
  }
}
