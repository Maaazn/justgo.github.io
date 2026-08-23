import { StepLimitError, UnsupportedOpcodeError } from "../core16/cpu";
import { LongModeAddressSpace } from "./address-space";
import { decodeRex, register64, signExtend32 } from "./decoder";
import { createCpu64State, type Cpu64State, type Register64Name, u64, write32ZeroExtended } from "./registers";

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

  constructor(private readonly memory: LongModeAddressSpace, state: Partial<Cpu64State> = {}) {
    this.state = createCpu64State(state);
  }

  loadProgram(bytes: Uint8Array, virtualAddress = 0n): void {
    bytes.forEach((byte, index) => this.memory.write8(virtualAddress + BigInt(index), byte));
    this.state.rip = virtualAddress;
    this.state.halted = false;
    this.state.steps = 0;
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
      case 0x05: {
        const immediate = this.fetch32();
        this.state.rax = rex?.w ? u64(this.state.rax + signExtend32(immediate)) : write32ZeroExtended(BigInt((Number(this.state.rax & 0xffff_ffffn) + immediate) >>> 0));
        return `ADD RAX, imm${rex?.w ? "32" : "32"}`;
      }
      case 0x2d: {
        const immediate = this.fetch32();
        this.state.rax = rex?.w ? u64(this.state.rax - signExtend32(immediate)) : write32ZeroExtended(BigInt((Number(this.state.rax & 0xffff_ffffn) - immediate) >>> 0));
        return `SUB RAX, imm${rex?.w ? "32" : "32"}`;
      }
      default:
        throw new UnsupportedOpcodeError(opcode, Number(this.state.rip - 1n));
    }
  }

  private fetch8(): number { const value = this.memory.read8(this.state.rip, "execute"); this.state.rip = u64(this.state.rip + 1n); return value; }
  private fetch32(): number { let value = 0; for (let byte = 0; byte < 4; byte += 1) value |= this.fetch8() << (byte * 8); return value >>> 0; }
  private fetch64(): bigint { let value = 0n; for (let byte = 0; byte < 8; byte += 1) value |= BigInt(this.fetch8()) << BigInt(byte * 8); return value; }
  private setRegister(register: Register64Name, value: bigint): void { this.state[register] = u64(value); }
}
