/** Deterministic CMOS/RTC subset: ports 70h/71h, BCD clock registers and periodic IRQ8. */
import type { InterruptSink } from "./devices";
import { u8 } from "./types";

function toBcd(value: number): number { return ((Math.floor(value / 10) << 4) | (value % 10)) & 0xff; }

export class CmosRtc {
  private index = 0;
  private nmiDisabled = false;
  private elapsedMs = 0;
  private seconds = 0;
  private readonly bytes = new Uint8Array(128);

  constructor(private readonly interrupts: InterruptSink, private readonly irqVector = 0x70) {
    this.bytes[0x0a] = 0x26; // divider + 1024Hz rate selector model
    this.bytes[0x0b] = 0x02; // 24h, BCD
    this.refreshClock();
  }

  out8(port: number, value: number): void {
    const normalized = port & 0xffff;
    if (normalized === 0x70) { this.nmiDisabled = (value & 0x80) !== 0; this.index = value & 0x7f; return; }
    if (normalized === 0x71) { this.writeRegister(this.index, value); return; }
    throw new Error(`منفذ CMOS غير صالح: 0x${normalized.toString(16)}.`);
  }

  in8(port: number): number {
    const normalized = port & 0xffff;
    if (normalized === 0x70) return (this.nmiDisabled ? 0x80 : 0) | this.index;
    if (normalized === 0x71) return this.bytes[this.index] ?? 0;
    throw new Error(`منفذ CMOS غير صالح: 0x${normalized.toString(16)}.`);
  }

  advanceMilliseconds(milliseconds: number): number {
    if (!Number.isInteger(milliseconds) || milliseconds < 0) throw new Error("زمن RTC غير صالح.");
    this.elapsedMs += milliseconds;
    let raised = 0;
    while (this.elapsedMs >= 1000) {
      this.elapsedMs -= 1000;
      this.seconds = (this.seconds + 1) % 86_400;
      this.refreshClock();
      this.bytes[0x0c] |= 0x10; // update-ended status
      this.interrupts.request(this.irqVector);
      raised += 1;
    }
    return raised;
  }

  snapshot(): Readonly<{ index: number; nmiDisabled: boolean; seconds: number; statusA: number; statusB: number }> {
    return { index: this.index, nmiDisabled: this.nmiDisabled, seconds: this.seconds, statusA: this.bytes[0x0a] ?? 0, statusB: this.bytes[0x0b] ?? 0 };
  }

  private writeRegister(index: number, value: number): void {
    if (index === 0x0c || index === 0x0d) return;
    this.bytes[index] = u8(value);
  }

  private refreshClock(): void {
    const hours = Math.floor(this.seconds / 3600);
    const minutes = Math.floor((this.seconds % 3600) / 60);
    const seconds = this.seconds % 60;
    this.bytes[0x00] = toBcd(seconds);
    this.bytes[0x02] = toBcd(minutes);
    this.bytes[0x04] = toBcd(hours);
    this.bytes[0x07] = toBcd(1); this.bytes[0x08] = toBcd(1); this.bytes[0x09] = toBcd(26);
  }
}
