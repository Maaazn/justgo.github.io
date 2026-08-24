import type { InterruptSink } from "../core16/devices";
import type { Core64 } from "./cpu";

/** Bridges a platform PIC vector into the guest's configured long-mode IDT. */
export class Core64IdtInterruptSink implements InterruptSink {
  constructor(private readonly cpu: Core64) {}

  request(vector: number): void {
    this.cpu.deliverInterrupt(vector);
  }
}
