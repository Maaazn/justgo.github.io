import type { StepTrace } from "../core16/types";
import { BootTrace } from "./boot-trace";

export interface ScheduledCpu {
  readonly state: { readonly halted: boolean; readonly steps: number };
  step(): StepTrace;
}

export interface ClockedDevice {
  advanceOscillatorTicks(ticks: number): number;
}

export interface ScheduledInput {
  deliver(): readonly { readonly kind: string; readonly [key: string]: unknown }[];
}

export interface DirtyFramebuffer {
  takeDirty(): { readonly dirty: boolean; readonly revision: number };
}

export interface DeterministicSchedulerOptions {
  readonly instructionsPerTick: number;
  readonly oscillatorTicksPerInstruction: number;
}

export interface TickResult {
  readonly tick: number;
  readonly executedInstructions: number;
  readonly generatedInterrupts: number;
  readonly halted: boolean;
}

/**
 * Guest state progresses only through this fixed order:
 * CPU quota → device clock → visible-frame marker. Rendering is intentionally
 * outside the transition and cannot mutate the trace or guest state.
 */
export class DeterministicScheduler {
  private tick = 0;

  constructor(
    private readonly cpu: ScheduledCpu,
    private readonly pit: ClockedDevice,
    readonly trace: BootTrace,
    private readonly options: DeterministicSchedulerOptions,
    private readonly peripherals: { readonly input?: ScheduledInput; readonly framebuffer?: DirtyFramebuffer } = {},
  ) {
    if (!Number.isInteger(options.instructionsPerTick) || options.instructionsPerTick <= 0) throw new Error("حصة تعليمات tick يجب أن تكون موجبة.");
    if (!Number.isInteger(options.oscillatorTicksPerInstruction) || options.oscillatorTicksPerInstruction < 0) throw new Error("نبضات PIT لكل تعليمة غير صالحة.");
  }

  runTick(): TickResult {
    const currentTick = this.tick++;
    this.trace.record(currentTick, "scheduler", "tick.begin", { instructionBudget: this.options.instructionsPerTick });
    for (const event of this.peripherals.input?.deliver() ?? []) {
      this.trace.record(currentTick, "ps2", "input", { kind: event.kind });
    }
    let executed = 0;
    while (executed < this.options.instructionsPerTick && !this.cpu.state.halted) {
      const step = this.cpu.step();
      executed += 1;
      this.trace.record(currentTick, "cpu", "instruction", { address: step.address, opcode: step.opcode, mnemonic: step.mnemonic });
    }
    const oscillatorTicks = executed * this.options.oscillatorTicksPerInstruction;
    const generatedInterrupts = this.pit.advanceOscillatorTicks(oscillatorTicks);
    this.trace.record(currentTick, "pit", "advance", { oscillatorTicks, generatedInterrupts });
    const frame = this.peripherals.framebuffer?.takeDirty();
    this.trace.record(currentTick, "video", "frame.ready", { guestSteps: this.cpu.state.steps, dirty: frame?.dirty ?? false, revision: frame?.revision ?? 0 });
    this.trace.record(currentTick, "scheduler", "tick.end", { executed, halted: this.cpu.state.halted });
    return { tick: currentTick, executedInstructions: executed, generatedInterrupts, halted: this.cpu.state.halted };
  }
}
