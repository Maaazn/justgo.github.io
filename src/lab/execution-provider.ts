import { Core16, StepLimitError } from "../core16/cpu";
import { Core16BlockCache } from "../core16/block-cache";
import type { VersionedMemory } from "../core16/memory";
import type { StepTrace } from "../core16/types";

export type ExecutionMode = "interpreter" | "block-cache";

export interface ExecutionSlice {
  readonly mode: ExecutionMode;
  readonly executed: number;
  readonly traces: readonly StepTrace[];
  readonly translatedBlocks: number;
}

export interface ExecutionProvider {
  readonly mode: ExecutionMode;
  execute(core: Core16, instructionBudget: number): ExecutionSlice;
}

export class InterpreterProvider implements ExecutionProvider {
  readonly mode = "interpreter" as const;

  execute(core: Core16, instructionBudget: number): ExecutionSlice {
    if (!Number.isInteger(instructionBudget) || instructionBudget <= 0) throw new Error("ميزانية تنفيذ المفسر غير صالحة.");
    const traces: StepTrace[] = [];
    while (!core.state.halted && traces.length < instructionBudget) traces.push(core.step());
    return { mode: this.mode, executed: traces.length, traces, translatedBlocks: 0 };
  }
}

/**
 * This is a dispatch layer, not native code generation. It preserves the same
 * Core16 execution helpers as the interpreter and falls back at every barrier.
 */
export class BlockCacheProvider implements ExecutionProvider {
  readonly mode = "block-cache" as const;
  private readonly cache: Core16BlockCache;

  constructor(memory: VersionedMemory) { this.cache = new Core16BlockCache(memory); }

  execute(core: Core16, instructionBudget: number): ExecutionSlice {
    if (!Number.isInteger(instructionBudget) || instructionBudget <= 0) throw new Error("ميزانية تنفيذ cache غير صالحة.");
    const traces: StepTrace[] = [];
    let translatedBlocks = 0;
    const stopAt = core.state.steps + instructionBudget;
    while (!core.state.halted && core.state.steps < stopAt) {
      const before = core.state.steps;
      const result = this.cache.run(core, stopAt);
      if (result.executed > 0) {
        translatedBlocks += 1;
        continue;
      }
      if (core.state.steps >= stopAt) throw new StepLimitError(stopAt);
      traces.push(core.step());
      if (core.state.steps === before) throw new Error("مزود cache لم يحقق تقدماً في التنفيذ.");
    }
    return { mode: this.mode, executed: core.state.steps - (stopAt - instructionBudget), traces, translatedBlocks };
  }
}

export function createExecutionProvider(mode: ExecutionMode, memory?: VersionedMemory): ExecutionProvider {
  if (mode === "interpreter") return new InterpreterProvider();
  if (!memory) throw new Error("مسار cache يحتاج VersionedMemory لإبطال كتل الشيفرة.");
  return new BlockCacheProvider(memory);
}
