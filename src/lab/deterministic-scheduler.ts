import type { StepTrace } from "../core16/types";
import type { Ps2MouseMotion } from "../core16/ps2";
import { BootTrace } from "./boot-trace";

export interface ScheduledCpu {
  readonly state: { readonly halted: boolean; readonly steps: number };
  step(): StepTrace;
}

export interface ClockedDevice {
  advanceOscillatorTicks(ticks: number): number;
}

export interface ClockedRtc {
  advanceMilliseconds(milliseconds: number): number;
}

export interface ScheduledInput {
  deliver(): readonly ScheduledInputEvent[];
}

export type ScheduledInputEvent =
  | { readonly kind: "keyboard"; readonly scanCode: number }
  | { readonly kind: "mouse"; readonly motion: Ps2MouseMotion };

export interface DirtyFramebuffer {
  takeDirty(): { readonly dirty: boolean; readonly revision: number };
}

export interface DeterministicInterruptDispatcher {
  dispatch(): number | null;
}

export interface DeterministicStoragePump {
  pump(): readonly DeterministicStorageEvent[];
}

export interface DeterministicStorageEvent {
  readonly kind: string;
  readonly lba?: number;
}

export interface ScheduledDeviceEvent {
  readonly tick: number;
  readonly source: "device" | "pic";
  readonly kind: string;
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

export interface ScheduledDeviceObserver {
  observe(event: ScheduledDeviceEvent): void;
}

export interface DeterministicSchedulerOptions {
  readonly instructionsPerTick: number;
  readonly oscillatorTicksPerInstruction: number;
  readonly millisecondsPerTick?: number;
}

export interface TickResult {
  readonly tick: number;
  readonly executedInstructions: number;
  readonly generatedInterrupts: number;
  readonly deliveredInterrupt: number | null;
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
    private readonly peripherals: { readonly input?: ScheduledInput; readonly rtc?: ClockedRtc; readonly storage?: DeterministicStoragePump; readonly interrupts?: DeterministicInterruptDispatcher; readonly framebuffer?: DirtyFramebuffer; readonly deviceObserver?: ScheduledDeviceObserver } = {},
  ) {
    if (!Number.isInteger(options.instructionsPerTick) || options.instructionsPerTick <= 0) throw new Error("حصة تعليمات tick يجب أن تكون موجبة.");
    if (!Number.isInteger(options.oscillatorTicksPerInstruction) || options.oscillatorTicksPerInstruction < 0) throw new Error("نبضات PIT لكل تعليمة غير صالحة.");
    if (options.millisecondsPerTick !== undefined && (!Number.isInteger(options.millisecondsPerTick) || options.millisecondsPerTick < 0)) throw new Error("زمن RTC لكل tick غير صالح.");
  }

  runTick(): TickResult {
    const currentTick = this.tick++;
    this.trace.record(currentTick, "scheduler", "tick.begin", { instructionBudget: this.options.instructionsPerTick });
    for (const event of this.peripherals.input?.deliver() ?? []) {
      if (event.kind === "keyboard") this.trace.record(currentTick, "ps2", "input", { kind: event.kind, scanCode: event.scanCode });
      else this.trace.record(currentTick, "ps2", "input", { kind: event.kind, deltaX: event.motion.deltaX, deltaY: event.motion.deltaY, buttons: event.motion.buttons });
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
    const rtcMilliseconds = this.options.millisecondsPerTick ?? 0;
    const rtcInterrupts = this.peripherals.rtc?.advanceMilliseconds(rtcMilliseconds) ?? 0;
    if (this.peripherals.rtc) {
      const event = { tick: currentTick, source: "device" as const, kind: "rtc", data: { milliseconds: rtcMilliseconds, generatedInterrupts: rtcInterrupts } };
      this.trace.record(event.tick, event.source, event.kind, event.data); this.peripherals.deviceObserver?.observe(event);
    }
    for (const event of this.peripherals.storage?.pump() ?? []) {
      if (event.lba === undefined) {
        const traceEvent = { tick: currentTick, source: "device" as const, kind: "storage", data: { kind: event.kind } };
        this.trace.record(traceEvent.tick, traceEvent.source, traceEvent.kind, traceEvent.data); this.peripherals.deviceObserver?.observe(traceEvent);
      } else {
        const traceEvent = { tick: currentTick, source: "device" as const, kind: "storage", data: { kind: event.kind, lba: event.lba } };
        this.trace.record(traceEvent.tick, traceEvent.source, traceEvent.kind, traceEvent.data); this.peripherals.deviceObserver?.observe(traceEvent);
      }
    }
    const deliveredInterrupt = this.peripherals.interrupts?.dispatch() ?? null;
    if (deliveredInterrupt !== null) {
      const event = { tick: currentTick, source: "pic" as const, kind: "dispatch", data: { vector: deliveredInterrupt } };
      this.trace.record(event.tick, event.source, event.kind, event.data); this.peripherals.deviceObserver?.observe(event);
    }
    const frame = this.peripherals.framebuffer?.takeDirty();
    this.trace.record(currentTick, "video", "frame.ready", { guestSteps: this.cpu.state.steps, dirty: frame?.dirty ?? false, revision: frame?.revision ?? 0 });
    this.trace.record(currentTick, "scheduler", "tick.end", { executed, halted: this.cpu.state.halted });
    return { tick: currentTick, executedInstructions: executed, generatedInterrupts, deliveredInterrupt, halted: this.cpu.state.halted };
  }
}
