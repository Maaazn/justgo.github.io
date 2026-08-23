/**
 * JustGo Core-16 design: lightweight dynamic block translation. It turns a
 * verified run of linear, side-effect-safe instructions into a cached plan.
 * It is deliberately not native-code generation and never bypasses CPU logic.
 */
import { Core16, StepLimitError } from "./cpu";
import { CORE16_PAGE_SIZE, type VersionedMemory } from "./memory";
import { physicalAddress, u16 } from "./types";

type ExitReason = "halt" | "barrier" | "budget" | "state-change" | "interrupt-boundary";

interface PrefetchedOperation {
  readonly ip: number;
  readonly opcode: number;
}

export interface CompiledBlock {
  readonly key: string;
  readonly startPhysical: number;
  readonly startIp: number;
  readonly cs: number;
  readonly pageEpoch: number;
  readonly operations: readonly PrefetchedOperation[];
  readonly terminal: "halt" | "barrier";
}

export interface BlockRunResult {
  readonly executed: number;
  readonly exit: ExitReason;
  readonly cache: "hit" | "miss" | "invalid";
}

export interface BlockCacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  translatedInstructions: number;
}

const MAX_OPERATIONS_PER_BLOCK = 64;

function instructionLength(opcode: number): number | undefined {
  if (opcode >= 0xb8 && opcode <= 0xbf) return 3;
  if ((opcode >= 0x40 && opcode <= 0x4f) || opcode === 0x90 || opcode === 0xf4) return 1;
  if ([0x04, 0x2c, 0x3c].includes(opcode)) return 2;
  if ([0x05, 0x2d, 0x3d].includes(opcode)) return 3;
  return undefined;
}

export class Core16BlockCache {
  readonly metrics: BlockCacheMetrics = { hits: 0, misses: 0, invalidations: 0, translatedInstructions: 0 };
  private readonly blocks = new Map<string, CompiledBlock>();

  constructor(private readonly memory: VersionedMemory) {}

  run(core: Core16, maxSteps: number): BlockRunResult {
    if (!core.canUseTranslatedBlock()) {
      return { executed: 0, exit: "interrupt-boundary", cache: "miss" };
    }

    const key = this.keyFor(core);
    const existing = this.blocks.get(key);
    let cache: BlockRunResult["cache"] = "hit";
    let block = existing;
    if (!block || !this.isCurrent(block)) {
      if (block) this.metrics.invalidations += 1;
      block = this.translate(core);
      this.blocks.set(key, block);
      this.metrics.misses += 1;
      cache = existing ? "invalid" : "miss";
    } else {
      this.metrics.hits += 1;
    }

    if (block.operations.length === 0) return { executed: 0, exit: "barrier", cache };

    let executed = 0;
    for (const operation of block.operations) {
      if (!core.canUseTranslatedBlock()) return { executed, exit: "interrupt-boundary", cache };
      if (core.state.cs !== block.cs || core.state.ip !== operation.ip) return { executed, exit: "state-change", cache };
      if (core.state.steps >= maxSteps) throw new StepLimitError(maxSteps);
      core.state.ip = u16(operation.ip + 1);
      core.executePrefetchedOpcode(operation.opcode);
      core.noteTranslatedInstruction();
      executed += 1;
      if (core.state.halted) return { executed, exit: "halt", cache };
    }
    return { executed, exit: block.terminal === "halt" ? "halt" : "barrier", cache };
  }

  clear(): void {
    this.blocks.clear();
    this.metrics.hits = 0;
    this.metrics.misses = 0;
    this.metrics.invalidations = 0;
    this.metrics.translatedInstructions = 0;
  }

  private translate(core: Core16): CompiledBlock {
    const startPhysical = physicalAddress(core.state.cs, core.state.ip);
    const pageBase = Math.floor(startPhysical / CORE16_PAGE_SIZE) * CORE16_PAGE_SIZE;
    const pageEpoch = this.memory.pageEpoch(startPhysical);
    const operations: PrefetchedOperation[] = [];
    let ip = core.state.ip;
    let terminal: CompiledBlock["terminal"] = "barrier";

    while (operations.length < MAX_OPERATIONS_PER_BLOCK) {
      const address = physicalAddress(core.state.cs, ip);
      if (address < pageBase || address >= pageBase + CORE16_PAGE_SIZE) break;
      const opcode = this.memory.read8(address);
      const length = instructionLength(opcode);
      if (!length || address + length > pageBase + CORE16_PAGE_SIZE) break;
      operations.push({ ip, opcode });
      ip = u16(ip + length);
      if (opcode === 0xf4) {
        terminal = "halt";
        break;
      }
    }

    this.metrics.translatedInstructions += operations.length;
    return {
      key: this.keyFor(core),
      startPhysical,
      startIp: core.state.ip,
      cs: core.state.cs,
      pageEpoch,
      operations,
      terminal,
    };
  }

  private isCurrent(block: CompiledBlock): boolean {
    return this.memory.pageEpoch(block.startPhysical) === block.pageEpoch;
  }

  private keyFor(core: Core16): string {
    return `${physicalAddress(core.state.cs, core.state.ip).toString(16)}:${core.state.cs.toString(16)}`;
  }
}
