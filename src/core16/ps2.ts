import { u8 } from "./types";

/** Minimal 8042-compatible controller state for deterministic guest input. */
export class Ps2Controller {
  private readonly output: number[] = [];
  private commandByte = 0x45;
  private awaitingCommandByte = false;
  private keyboardEnabled = true;

  enqueueScanCode(scanCode: number): void {
    if (this.keyboardEnabled) this.output.push(u8(scanCode));
  }

  readData(): number {
    return this.output.shift() ?? 0;
  }

  readStatus(): number {
    return (this.output.length > 0 ? 1 : 0) | (this.awaitingCommandByte ? 2 : 0);
  }

  writeControllerCommand(command: number): void {
    switch (u8(command)) {
      case 0x20:
        this.output.push(this.commandByte);
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
      default:
        break;
    }
  }

  writeData(value: number): void {
    if (!this.awaitingCommandByte) return;
    this.commandByte = u8(value);
    this.awaitingCommandByte = false;
  }
}
