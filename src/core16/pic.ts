/**
 * Dual 8259A-compatible interrupt fabric for the JustGo guest platform.
 * It models the execution-critical IRR/IMR/ISR state, cascade IRQ2, fixed
 * priority, initialization words and EOI. It deliberately does not claim APIC
 * or every rotating/special-mask mode yet.
 */
import type { InterruptSink } from "./devices";
import { u8 } from "./types";

type ReadRegister = "irr" | "isr";

class PicUnit {
  private irr = 0;
  private imr = 0;
  private isr = 0;
  private vectorBase: number;
  private initStep = 0;
  private readRegister: ReadRegister = "irr";

  constructor(vectorBase: number) { this.vectorBase = vectorBase; }

  request(line: number): void {
    if (line < 0 || line > 7 || !Number.isInteger(line)) throw new Error("خط IRQ في PIC خارج النطاق.");
    this.irr |= 1 << line;
  }

  readCommand(): number { return this.readRegister === "irr" ? this.irr : this.isr; }
  readData(): number { return this.imr; }

  writeCommand(value: number): void {
    const command = u8(value);
    if ((command & 0x10) !== 0) {
      this.initStep = 1;
      this.irr = 0;
      this.isr = 0;
      return;
    }
    if ((command & 0x08) !== 0 && (command & 0x02) !== 0) {
      this.readRegister = (command & 0x01) !== 0 ? "isr" : "irr";
      return;
    }
    if ((command & 0x20) !== 0) this.endOfInterrupt();
  }

  writeData(value: number): void {
    const data = u8(value);
    if (this.initStep === 1) { this.vectorBase = data & 0xf8; this.initStep = 2; return; }
    if (this.initStep === 2) { this.initStep = 3; return; } // ICW3: cascade topology is fixed by DualPic.
    if (this.initStep === 3) { this.initStep = 0; return; } // ICW4: 8086 mode accepted.
    this.imr = data;
  }

  nextLine(): number | null {
    const pending = this.irr & ~this.imr;
    for (let line = 0; line < 8; line += 1) {
      const bit = 1 << line;
      if ((pending & bit) === 0) continue;
      if (this.higherPriorityInService(line)) continue;
      return line;
    }
    return null;
  }

  acknowledge(line: number): number {
    const bit = 1 << line;
    this.irr &= ~bit;
    this.isr |= bit;
    return this.vectorBase + line;
  }

  endOfInterrupt(): void {
    for (let line = 0; line < 8; line += 1) {
      const bit = 1 << line;
      if ((this.isr & bit) !== 0) { this.isr &= ~bit; return; }
    }
  }

  snapshot(): Readonly<{ irr: number; imr: number; isr: number; vectorBase: number }> {
    return { irr: this.irr, imr: this.imr, isr: this.isr, vectorBase: this.vectorBase };
  }

  private higherPriorityInService(candidate: number): boolean {
    for (let line = 0; line < candidate; line += 1) if ((this.isr & (1 << line)) !== 0) return true;
    return false;
  }
}

export class DualPic8259 {
  static readonly MASTER_COMMAND = 0x20;
  static readonly MASTER_DATA = 0x21;
  static readonly SLAVE_COMMAND = 0xa0;
  static readonly SLAVE_DATA = 0xa1;
  private readonly master = new PicUnit(0x08);
  private readonly slave = new PicUnit(0x70);

  requestIrq(irq: number): void {
    if (!Number.isInteger(irq) || irq < 0 || irq > 15) throw new Error("رقم IRQ خارج نطاق 0–15.");
    if (irq < 8) this.master.request(irq);
    else { this.slave.request(irq - 8); this.master.request(2); }
  }

  /** Delivers at most one request per deterministic scheduler phase. */
  dispatch(sink: InterruptSink): number | null {
    const masterLine = this.master.nextLine();
    if (masterLine === null) return null;
    if (masterLine !== 2) {
      const vector = this.master.acknowledge(masterLine);
      sink.request(vector);
      return vector;
    }
    const slaveLine = this.slave.nextLine();
    if (slaveLine === null) return null;
    this.master.acknowledge(2);
    const vector = this.slave.acknowledge(slaveLine);
    sink.request(vector);
    return vector;
  }

  in8(port: number): number {
    switch (port & 0xffff) {
      case DualPic8259.MASTER_COMMAND: return this.master.readCommand();
      case DualPic8259.MASTER_DATA: return this.master.readData();
      case DualPic8259.SLAVE_COMMAND: return this.slave.readCommand();
      case DualPic8259.SLAVE_DATA: return this.slave.readData();
      default: throw new Error(`منفذ PIC غير صالح: 0x${port.toString(16)}.`);
    }
  }

  out8(port: number, value: number): void {
    switch (port & 0xffff) {
      case DualPic8259.MASTER_COMMAND: this.master.writeCommand(value); return;
      case DualPic8259.MASTER_DATA: this.master.writeData(value); return;
      case DualPic8259.SLAVE_COMMAND: this.slave.writeCommand(value); return;
      case DualPic8259.SLAVE_DATA: this.slave.writeData(value); return;
      default: throw new Error(`منفذ PIC غير صالح: 0x${port.toString(16)}.`);
    }
  }

  snapshot(): Readonly<{ master: ReturnType<PicUnit["snapshot"]>; slave: ReturnType<PicUnit["snapshot"]> }> {
    return { master: this.master.snapshot(), slave: this.slave.snapshot() };
  }
}
