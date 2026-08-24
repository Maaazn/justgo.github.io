import { StepLimitError, UnsupportedOpcodeError } from "../core16/cpu";
import { LongModeAddressSpace } from "./address-space";
import { add64, sub64, type Alu64Result } from "./alu";
import { decodeRex, register64, signExtend32 } from "./decoder";
import { decodeModRm64, decodeModRmMemory64 } from "./modrm";
import { createLongModeIdtr, popLongModeIretFrame, pushLongModeInterruptFrame, readLongModeIdtGate, type LongModeIdtr } from "./idt";
import { selectInterruptStack, type LongModeTss } from "./tss";
import type { LongModeExceptionFrame } from "./exceptions";
import { createCpu64State, type Cpu64State, type Register64Name, u64, write32ZeroExtended } from "./registers";

const FLAG_CARRY = 1n << 0n;
const FLAG_ZERO = 1n << 6n;
const FLAG_SIGN = 1n << 7n;
const FLAG_OVERFLOW = 1n << 11n;

export interface Core64Trace {
  readonly address: bigint;
  readonly opcode: number;
  readonly mnemonic: string;
}

/**
 * A deliberately narrow long-mode interpreter. It executes only instructions
 * whose semantics and width are covered by tests; all others fail explicitly.
 */
export class Core64 {
  readonly state: Cpu64State;
  private idtr: LongModeIdtr = createLongModeIdtr();
  private tss: LongModeTss | undefined;

  constructor(private readonly memory: LongModeAddressSpace, state: Partial<Cpu64State> = {}) {
    this.state = createCpu64State(state);
  }

  loadProgram(bytes: Uint8Array, virtualAddress = 0n): void {
    bytes.forEach((byte, index) => this.memory.write8(virtualAddress + BigInt(index), byte));
    this.state.rip = virtualAddress;
    this.state.halted = false;
    this.state.steps = 0;
  }

  loadIdtr(idtr: LongModeIdtr): void { this.idtr = { ...idtr }; }
  loadTss(tss: LongModeTss | undefined): void { this.tss = tss; }

  deliverException(frame: LongModeExceptionFrame): void {
    const gate = readLongModeIdtGate(this.memory, this.idtr, frame.vector);
    pushLongModeInterruptFrame(this.memory, this.state, gate, { returnRip: frame.rip, errorCode: frame.errorCode, stackPointer: selectInterruptStack(gate, this.tss, this.state.rsp) });
  }

  deliverInterrupt(vector: number): void {
    const gate = readLongModeIdtGate(this.memory, this.idtr, vector);
    pushLongModeInterruptFrame(this.memory, this.state, gate, { returnRip: this.state.rip, stackPointer: selectInterruptStack(gate, this.tss, this.state.rsp) });
  }

  run(maxSteps = 100_000): Core64Trace[] {
    const trace: Core64Trace[] = [];
    while (!this.state.halted) {
      if (this.state.steps >= maxSteps) throw new StepLimitError(maxSteps);
      trace.push(this.step());
    }
    return trace;
  }

  step(): Core64Trace {
    const address = this.state.rip;
    if (this.state.halted) return { address, opcode: 0xf4, mnemonic: "HLT" };
    let opcode = this.fetch8();
    const rex = decodeRex(opcode);
    if (rex) opcode = this.fetch8();
    const mnemonic = this.execute(opcode, rex);
    this.state.steps += 1;
    return { address, opcode, mnemonic };
  }

  private execute(opcode: number, rex: ReturnType<typeof decodeRex>): string {
    if (opcode >= 0x50 && opcode <= 0x57) {
      const register = register64(opcode - 0x50, rex?.b ?? false);
      this.push64(this.getRegister(register));
      return `PUSH ${register.toUpperCase()}`;
    }
    if (opcode >= 0x58 && opcode <= 0x5f) {
      const register = register64(opcode - 0x58, rex?.b ?? false);
      this.setRegister(register, this.pop64());
      return `POP ${register.toUpperCase()}`;
    }
    if (opcode >= 0xb8 && opcode <= 0xbf) {
      const destination = register64(opcode - 0xb8, rex?.b ?? false);
      if (rex?.w) this.setRegister(destination, this.fetch64());
      else this.setRegister(destination, write32ZeroExtended(BigInt(this.fetch32())));
      return `MOV ${destination.toUpperCase()}, imm${rex?.w ? "64" : "32"}`;
    }
    switch (opcode) {
      case 0x90: return "NOP";
      case 0xf4:
        this.state.halted = true;
        return "HLT";
      case 0xcf:
        popLongModeIretFrame(this.memory, this.state);
        return "IRETQ";
      case 0xc3:
        this.state.rip = this.pop64();
        return "RET";
      case 0xe8:
        return this.executeCallRelative();
      case 0xe9:
        this.jumpRelative(signExtend32(this.fetch32()));
        return "JMP rel32";
      case 0xeb:
        this.jumpRelative(this.fetchSigned8());
        return "JMP rel8";
      case 0x74:
        return this.executeConditionalJump("JZ", this.flagIsSet(FLAG_ZERO));
      case 0x75:
        return this.executeConditionalJump("JNZ", !this.flagIsSet(FLAG_ZERO));
      case 0x05: {
        const immediate = this.fetch32();
        if (rex?.w) {
          const result = add64(this.state.rax, signExtend32(immediate));
          this.state.rax = result.result;
          this.applyAluFlags(result);
        } else this.state.rax = write32ZeroExtended(BigInt((Number(this.state.rax & 0xffff_ffffn) + immediate) >>> 0));
        return "ADD RAX, imm32";
      }
      case 0x2d: {
        const immediate = this.fetch32();
        if (rex?.w) {
          const result = sub64(this.state.rax, signExtend32(immediate));
          this.state.rax = result.result;
          this.applyAluFlags(result);
        } else this.state.rax = write32ZeroExtended(BigInt((Number(this.state.rax & 0xffff_ffffn) - immediate) >>> 0));
        return "SUB RAX, imm32";
      }
      case 0x89: return this.executeRegisterMove(rex, "rm-reg");
      case 0x8b: return this.executeRegisterMove(rex, "reg-rm");
      case 0x01: return this.executeRegisterAlu(rex, "add");
      case 0x29: return this.executeRegisterAlu(rex, "sub");
      case 0x39: return this.executeRegisterAlu(rex, "cmp");
      default:
        throw new UnsupportedOpcodeError(opcode, Number(this.state.rip - 1n));
    }
  }

  private fetch8(): number { const value = this.memory.read8(this.state.rip, "execute"); this.state.rip = u64(this.state.rip + 1n); return value; }
  private fetchSigned8(): bigint { const value = this.fetch8(); return BigInt(value & 0x80 ? value - 0x100 : value); }
  private fetch32(): number { let value = 0; for (let byte = 0; byte < 4; byte += 1) value |= this.fetch8() << (byte * 8); return value >>> 0; }
  private fetch64(): bigint { let value = 0n; for (let byte = 0; byte < 8; byte += 1) value |= BigInt(this.fetch8()) << BigInt(byte * 8); return value; }
  private setRegister(register: Register64Name, value: bigint): void { this.state[register] = u64(value); }
  private getRegister(register: Register64Name): bigint { return this.state[register]; }

  private writeOperand(register: Register64Name, value: bigint, width64: boolean): void {
    this.setRegister(register, width64 ? value : write32ZeroExtended(value));
  }

  private executeRegisterMove(rex: ReturnType<typeof decodeRex>, direction: "rm-reg" | "reg-rm"): string {
    const opcode = direction === "rm-reg" ? 0x89 : 0x8b;
    const modrm = this.fetch8();
    if (((modrm >>> 6) & 3) !== 3) {
      const operand = decodeModRmMemory64(modrm, rex, { read8: () => this.fetch8(), read32: () => this.fetch32(), rip: () => this.state.rip }, (register) => this.getRegister(register));
      const width64 = rex?.w ?? false;
      if (direction === "rm-reg") this.writeMemoryOperand(operand.address, this.getRegister(operand.reg), width64);
      else this.writeOperand(operand.reg, this.readMemoryOperand(operand.address, width64), width64);
      return direction === "rm-reg" ? `MOV [${operand.address.toString(16)}], ${operand.reg.toUpperCase()}` : `MOV ${operand.reg.toUpperCase()}, [${operand.address.toString(16)}]`;
    }
    const operand = decodeModRm64(modrm, rex, opcode);
    const destination = direction === "rm-reg" ? operand.rm : operand.reg;
    const source = direction === "rm-reg" ? operand.reg : operand.rm;
    this.writeOperand(destination, this.getRegister(source), rex?.w ?? false);
    return `MOV ${destination.toUpperCase()}, ${source.toUpperCase()}`;
  }

  private readMemoryOperand(address: bigint, width64: boolean): bigint {
    let value = 0n;
    const bytes = width64 ? 8 : 4;
    for (let offset = 0; offset < bytes; offset += 1) value |= BigInt(this.memory.read8(address + BigInt(offset), "read")) << BigInt(offset * 8);
    return value;
  }

  private writeMemoryOperand(address: bigint, value: bigint, width64: boolean): void {
    const bytes = width64 ? 8 : 4;
    for (let offset = 0; offset < bytes; offset += 1) this.memory.write8(address + BigInt(offset), Number((value >> BigInt(offset * 8)) & 0xffn));
  }

  private push64(value: bigint): void {
    this.state.rsp = u64(this.state.rsp - 8n);
    this.writeMemoryOperand(this.state.rsp, value, true);
  }

  private pop64(): bigint {
    const value = this.readMemoryOperand(this.state.rsp, true);
    this.state.rsp = u64(this.state.rsp + 8n);
    return value;
  }

  private jumpRelative(displacement: bigint): void {
    this.state.rip = u64(this.state.rip + displacement);
  }

  private executeCallRelative(): string {
    const displacement = signExtend32(this.fetch32());
    this.push64(this.state.rip);
    this.jumpRelative(displacement);
    return "CALL rel32";
  }

  private executeConditionalJump(mnemonic: "JZ" | "JNZ", condition: boolean): string {
    const displacement = this.fetchSigned8();
    if (condition) this.jumpRelative(displacement);
    return `${mnemonic} rel8`;
  }

  private executeRegisterAlu(rex: ReturnType<typeof decodeRex>, operation: "add" | "sub" | "cmp"): string {
    const opcode = operation === "add" ? 0x01 : operation === "sub" ? 0x29 : 0x39;
    const modrm = this.fetch8();
    const width64 = rex?.w ?? false;
    if (((modrm >>> 6) & 3) !== 3) {
      const operand = decodeModRmMemory64(modrm, rex, { read8: () => this.fetch8(), read32: () => this.fetch32(), rip: () => this.state.rip }, (register) => this.getRegister(register));
      const left = this.readMemoryOperand(operand.address, width64);
      const right = this.getRegister(operand.reg);
      const result = width64 ? (operation === "add" ? add64(left, right) : sub64(left, right)) : null;
      if (width64 && result) {
        this.applyAluFlags(result);
        if (operation !== "cmp") this.writeMemoryOperand(operand.address, result.result, true);
      } else {
        const value = operation === "add" ? (Number(left & 0xffff_ffffn) + Number(right & 0xffff_ffffn)) >>> 0 : (Number(left & 0xffff_ffffn) - Number(right & 0xffff_ffffn)) >>> 0;
        this.setFlag(FLAG_ZERO, value === 0); this.setFlag(FLAG_SIGN, (value & 0x8000_0000) !== 0);
        if (operation !== "cmp") this.writeMemoryOperand(operand.address, BigInt(value), false);
      }
      return `${operation.toUpperCase()} [${operand.address.toString(16)}], ${operand.reg.toUpperCase()}`;
    }
    const operand = decodeModRm64(modrm, rex, opcode);
    const left = this.getRegister(operand.rm);
    const right = this.getRegister(operand.reg);
    if (width64) {
      const result = operation === "add" ? add64(left, right) : sub64(left, right);
      this.applyAluFlags(result);
      if (operation !== "cmp") this.setRegister(operand.rm, result.result);
    } else {
      const left32 = Number(left & 0xffff_ffffn) >>> 0;
      const right32 = Number(right & 0xffff_ffffn) >>> 0;
      const result = operation === "add" ? (left32 + right32) >>> 0 : (left32 - right32) >>> 0;
      if (operation !== "cmp") this.writeOperand(operand.rm, BigInt(result), false);
      this.setFlag(FLAG_ZERO, result === 0);
      this.setFlag(FLAG_SIGN, (result & 0x8000_0000) !== 0);
    }
    return `${operation.toUpperCase()} ${operand.rm.toUpperCase()}, ${operand.reg.toUpperCase()}`;
  }

  private applyAluFlags(result: Alu64Result): void {
    this.setFlag(FLAG_CARRY, result.carry);
    this.setFlag(FLAG_ZERO, result.zero);
    this.setFlag(FLAG_SIGN, result.sign);
    this.setFlag(FLAG_OVERFLOW, result.overflow);
  }

  private setFlag(flag: bigint, enabled: boolean): void {
    this.state.rflags = enabled ? this.state.rflags | flag : this.state.rflags & ~flag;
  }

  private flagIsSet(flag: bigint): boolean {
    return (this.state.rflags & flag) !== 0n;
  }
}
