import { u8 } from "./types";

export interface Ps2MouseMotion {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly buttons: number;
}

interface OutputByte {
  readonly value: number;
  readonly mouse: boolean;
}

/** Encodes the standard three-byte PS/2 mouse packet with guest Y-up coordinates. */
export function encodePs2MousePacket(motion: Ps2MouseMotion): readonly [number, number, number] {
  const x = clampDelta(motion.deltaX);
  const y = clampDelta(motion.deltaY);
  const buttons = motion.buttons & 0x07;
  const status = 0x08 | buttons | (x < 0 ? 0x10 : 0) | (y < 0 ? 0x20 : 0);
  return [status, x & 0xff, y & 0xff];
}

function clampDelta(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-255, Math.min(255, Math.trunc(value)));
}

/** Minimal 8042-compatible controller state for deterministic guest input. */
export class Ps2Controller {
  private readonly output: OutputByte[] = [];
  private commandByte = 0x45;
  private awaitingCommandByte = false;
  private awaitingMouseCommand = false;
  private keyboardEnabled = true;
  private mouseEnabled = true;
  private mouseStreaming = false;

  enqueueScanCode(scanCode: number): void {
    if (this.keyboardEnabled) this.output.push({ value: u8(scanCode), mouse: false });
  }

  enqueueMouseMotion(motion: Ps2MouseMotion): void {
    if (!this.mouseEnabled || !this.mouseStreaming) return;
    for (const value of encodePs2MousePacket(motion)) this.output.push({ value, mouse: true });
  }

  readData(): number {
    return this.output.shift()?.value ?? 0;
  }

  readStatus(): number {
    const next = this.output[0];
    return (next ? 1 : 0) | (this.awaitingCommandByte || this.awaitingMouseCommand ? 2 : 0) | (next?.mouse ? 0x20 : 0);
  }

  writeControllerCommand(command: number): void {
    switch (u8(command)) {
      case 0x20:
        this.output.push({ value: this.commandByte, mouse: false });
        break;
      case 0x60:
        this.awaitingCommandByte = true;
        break;
      case 0xad:
        this.keyboardEnabled = false;
        break;
      case 0xae:
        this.keyboardEnabled = true;
        break;
      case 0xa7:
        this.mouseEnabled = false;
        break;
      case 0xa8:
        this.mouseEnabled = true;
        break;
      case 0xd4:
        this.awaitingMouseCommand = true;
        break;
      default:
        break;
    }
  }

  writeData(value: number): void {
    if (this.awaitingMouseCommand) {
      this.awaitingMouseCommand = false;
      this.handleMouseCommand(value);
      return;
    }
    if (!this.awaitingCommandByte) return;
    this.commandByte = u8(value);
    this.awaitingCommandByte = false;
  }

  private handleMouseCommand(value: number): void {
    const command = u8(value);
    this.output.push({ value: 0xfa, mouse: true });
    if (command === 0xf4) this.mouseStreaming = true;
    if (command === 0xf5) this.mouseStreaming = false;
  }
}
