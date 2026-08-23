/**
 * JustGo Core-16 design: a deliberately small, exact interpreter. Unsupported
 * opcodes fail loudly; they never silently imitate a broader x86 engine.
 */
import type { MemoryBus } from "./memory";
import type { InterruptBus } from "./interrupts";
import type { PortBus } from "./ports";
import {
  createCpu16State,
  FLAG_AUXILIARY,
  FLAG_CARRY,
  FLAG_INTERRUPT,
  FLAG_OVERFLOW,
  FLAG_PARITY,
  FLAG_SIGN,
  FLAG_ZERO,
  physicalAddress,
  signed8,
  signed16,
  type Cpu16State,
  type Register16Name,
  type StepTrace,
  u8,
  u16,
} from "./types";

const REGISTERS: readonly Register16Name[] = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"];

export class UnsupportedOpcodeError extends Error {
  constructor(opcode: number, address: number) {
    super(`تعليمة x86 غير مدعومة في Core-16: 0x${opcode.toString(16).padStart(2, "0")} عند 0x${address.toString(16).padStart(5, "0")}.`);
  }
}

export class StepLimitError extends Error {
  constructor(limit: number) {
    super(`تجاوز البرنامج حد ${limit} خطوة؛ أوقف JustGo التنفيذ لمنع حلقة غير منتهية.`);
  }
}

export class Core16 {
  readonly state: Cpu16State;

  constructor(private readonly memory: MemoryBus, private readonly ports: PortBus, private readonly interrupts?: InterruptBus, state: Partial<Cpu16State> = {}) {
    this.state = createCpu16State(state);
  }

  reset(state: Partial<Cpu16State> = {}): void {
    Object.assign(this.state, createCpu16State(state));
  }

  loadProgram(bytes: Uint8Array, cs = 0, ip = 0): void {
    this.state.cs = u16(cs);
    this.state.ip = u16(ip);
    this.state.halted = false;
    this.state.steps = 0;
    this.memory.load(physicalAddress(cs, ip), bytes);
  }

  run(maxSteps = 100_000): StepTrace[] {
    const trace: StepTrace[] = [];
    while (!this.state.halted) {
      if (this.state.steps >= maxSteps) throw new StepLimitError(maxSteps);
      trace.push(this.step());
    }
    return trace;
  }

  step(): StepTrace {
    if (this.state.halted) return { address: physicalAddress(this.state.cs, this.state.ip), opcode: 0xf4, mnemonic: "HLT" };
    const pendingInterrupt = this.hasFlag(FLAG_INTERRUPT) ? this.interrupts?.nextPending() : undefined;
    if (pendingInterrupt !== undefined) {
      const address = physicalAddress(this.state.cs, this.state.ip);
      this.invokeInterrupt(pendingInterrupt);
      this.state.steps += 1;
      return { address, opcode: 0xff, mnemonic: `HWINT 0x${pendingInterrupt.toString(16).padStart(2, "0")}` };
    }
    const address = physicalAddress(this.state.cs, this.state.ip);
    const opcode = this.fetch8();
    const mnemonic = this.execute(opcode);
    this.state.steps += 1;
    return { address, opcode, mnemonic };
  }

  /**
   * Used only by the block translator after it has restored the instruction
   * pointer to the byte immediately after a prefetched opcode.
   */
  executePrefetchedOpcode(opcode: number): string {
    return this.execute(opcode);
  }

  canUseTranslatedBlock(): boolean {
    return !this.state.halted && !this.hasFlag(FLAG_INTERRUPT);
  }

  noteTranslatedInstruction(): void {
    this.state.steps += 1;
  }

  private execute(opcode: number): string {
    if (opcode >= 0xb8 && opcode <= 0xbf) {
      const register = REGISTERS[opcode - 0xb8];
      this.setReg(register, this.fetch16());
      return `MOV ${register.toUpperCase()}, imm16`;
    }
    if (opcode >= 0x40 && opcode <= 0x47) {
      const register = REGISTERS[opcode - 0x40];
      const carry = this.hasFlag(FLAG_CARRY);
      const before = this.getReg(register);
      this.setReg(register, this.add16(before, 1));
      this.setFlag(FLAG_CARRY, carry);
      return `INC ${register.toUpperCase()}`;
    }
    if (opcode >= 0x48 && opcode <= 0x4f) {
      const register = REGISTERS[opcode - 0x48];
      const carry = this.hasFlag(FLAG_CARRY);
      const before = this.getReg(register);
      this.setReg(register, this.sub16(before, 1));
      this.setFlag(FLAG_CARRY, carry);
      return `DEC ${register.toUpperCase()}`;
    }
    if (opcode >= 0x50 && opcode <= 0x57) {
      const register = REGISTERS[opcode - 0x50];
      this.push16(this.getReg(register));
      return `PUSH ${register.toUpperCase()}`;
    }
    if (opcode >= 0x58 && opcode <= 0x5f) {
      const register = REGISTERS[opcode - 0x58];
      this.setReg(register, this.pop16());
      return `POP ${register.toUpperCase()}`;
    }

    switch (opcode) {
      case 0x90: return "NOP";
      case 0xfa:
        this.setFlag(FLAG_INTERRUPT, false);
        return "CLI";
      case 0xfb:
        this.setFlag(FLAG_INTERRUPT, true);
        return "STI";
      case 0xf4:
        this.state.halted = true;
        return "HLT";
      case 0x04:
        this.setAL(this.add8(this.getAL(), this.fetch8()));
        return "ADD AL, imm8";
      case 0x05:
        this.state.ax = this.add16(this.state.ax, this.fetch16());
        return "ADD AX, imm16";
      case 0x2c:
        this.setAL(this.sub8(this.getAL(), this.fetch8()));
        return "SUB AL, imm8";
      case 0x2d:
        this.state.ax = this.sub16(this.state.ax, this.fetch16());
        return "SUB AX, imm16";
      case 0x3c:
        this.sub8(this.getAL(), this.fetch8());
        return "CMP AL, imm8";
      case 0x3d:
        this.sub16(this.state.ax, this.fetch16());
        return "CMP AX, imm16";
      case 0xa0:
        this.setAL(this.memory.read8(physicalAddress(this.state.ds, this.fetch16())));
        return "MOV AL, moffs8";
      case 0xa1:
        this.state.ax = this.memory.read16(physicalAddress(this.state.ds, this.fetch16()));
        return "MOV AX, moffs16";
      case 0xa2:
        this.memory.write8(physicalAddress(this.state.ds, this.fetch16()), this.getAL());
        return "MOV moffs8, AL";
      case 0xa3:
        this.memory.write16(physicalAddress(this.state.ds, this.fetch16()), this.state.ax);
        return "MOV moffs16, AX";
      case 0xc3:
        this.state.ip = this.pop16();
        return "RET";
      case 0xcd:
        this.invokeInterrupt(this.fetch8());
        return "INT imm8";
      case 0xcf:
        this.state.ip = this.pop16();
        this.state.cs = this.pop16();
        this.state.flags = this.pop16();
        return "IRET";
      case 0xe2:
        this.state.cx = u16(this.state.cx - 1);
        if (this.state.cx !== 0) this.relativeJump(signed8(this.fetch8()));
        else this.fetch8();
        return "LOOP rel8";
      case 0xe4:
        this.setAL(this.ports.in8(this.fetch8()));
        return "IN AL, imm8";
      case 0xe6:
        this.ports.out8(this.fetch8(), this.getAL());
        return "OUT imm8, AL";
      case 0xe8:
        this.callRelative(signed16(this.fetch16()));
        return "CALL rel16";
      case 0xe9:
        this.relativeJump(signed16(this.fetch16()));
        return "JMP rel16";
      case 0xeb:
        this.relativeJump(signed8(this.fetch8()));
        return "JMP rel8";
      case 0x74:
        this.conditionalJump(this.hasFlag(FLAG_ZERO));
        return "JZ rel8";
      case 0x75:
        this.conditionalJump(!this.hasFlag(FLAG_ZERO));
        return "JNZ rel8";
      default:
        throw new UnsupportedOpcodeError(opcode, physicalAddress(this.state.cs, u16(this.state.ip - 1)));
    }
  }

  private fetch8(): number {
    const value = this.memory.read8(physicalAddress(this.state.cs, this.state.ip));
    this.state.ip = u16(this.state.ip + 1);
    return value;
  }

  private fetch16(): number {
    const low = this.fetch8();
    return low | (this.fetch8() << 8);
  }

  private getReg(register: Register16Name): number { return this.state[register]; }
  private setReg(register: Register16Name, value: number): void { this.state[register] = u16(value); }
  private getAL(): number { return this.state.ax & 0xff; }
  private setAL(value: number): void { this.state.ax = (this.state.ax & 0xff00) | u8(value); }

  private relativeJump(offset: number): void { this.state.ip = u16(this.state.ip + offset); }
  private conditionalJump(condition: boolean): void { const offset = signed8(this.fetch8()); if (condition) this.relativeJump(offset); }
  private callRelative(offset: number): void { this.push16(this.state.ip); this.relativeJump(offset); }
  private push16(value: number): void { this.state.sp = u16(this.state.sp - 2); this.memory.write16(physicalAddress(this.state.ss, this.state.sp), value); }
  private pop16(): number { const value = this.memory.read16(physicalAddress(this.state.ss, this.state.sp)); this.state.sp = u16(this.state.sp + 2); return value; }
  private invokeInterrupt(vector: number): void {
    this.push16(this.state.flags);
    this.push16(this.state.cs);
    this.push16(this.state.ip);
    this.state.flags &= ~FLAG_INTERRUPT;
    const tableOffset = (vector & 0xff) * 4;
    this.state.ip = this.memory.read16(tableOffset);
    this.state.cs = this.memory.read16(tableOffset + 2);
  }
  private hasFlag(flag: number): boolean { return (this.state.flags & flag) !== 0; }
  private setFlag(flag: number, enabled: boolean): void { this.state.flags = enabled ? this.state.flags | flag : this.state.flags & ~flag; }

  private updateCommonFlags(result: number, width: 8 | 16): void {
    const mask = width === 8 ? 0xff : 0xffff;
    const sign = width === 8 ? 0x80 : 0x8000;
    const normalized = result & mask;
    this.setFlag(FLAG_ZERO, normalized === 0);
    this.setFlag(FLAG_SIGN, (normalized & sign) !== 0);
    const low = normalized & 0xff;
    this.setFlag(FLAG_PARITY, ((low.toString(2).match(/1/g)?.length ?? 0) & 1) === 0);
  }

  private add8(left: number, right: number): number {
    const result = left + right;
    const normalized = u8(result);
    this.setFlag(FLAG_CARRY, result > 0xff);
    this.setFlag(FLAG_AUXILIARY, ((left & 0xf) + (right & 0xf)) > 0xf);
    this.setFlag(FLAG_OVERFLOW, ((~(left ^ right) & (left ^ normalized)) & 0x80) !== 0);
    this.updateCommonFlags(normalized, 8);
    return normalized;
  }

  private add16(left: number, right: number): number {
    const result = left + right;
    const normalized = u16(result);
    this.setFlag(FLAG_CARRY, result > 0xffff);
    this.setFlag(FLAG_AUXILIARY, ((left & 0xf) + (right & 0xf)) > 0xf);
    this.setFlag(FLAG_OVERFLOW, ((~(left ^ right) & (left ^ normalized)) & 0x8000) !== 0);
    this.updateCommonFlags(normalized, 16);
    return normalized;
  }

  private sub8(left: number, right: number): number {
    const normalized = u8(left - right);
    this.setFlag(FLAG_CARRY, u8(left) < u8(right));
    this.setFlag(FLAG_AUXILIARY, (left & 0xf) < (right & 0xf));
    this.setFlag(FLAG_OVERFLOW, (((left ^ right) & (left ^ normalized)) & 0x80) !== 0);
    this.updateCommonFlags(normalized, 8);
    return normalized;
  }

  private sub16(left: number, right: number): number {
    const normalized = u16(left - right);
    this.setFlag(FLAG_CARRY, u16(left) < u16(right));
    this.setFlag(FLAG_AUXILIARY, (left & 0xf) < (right & 0xf));
    this.setFlag(FLAG_OVERFLOW, (((left ^ right) & (left ^ normalized)) & 0x8000) !== 0);
    this.updateCommonFlags(normalized, 16);
    return normalized;
  }
}
