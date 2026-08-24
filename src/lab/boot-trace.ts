export type TraceSource = "cpu" | "pit" | "pic" | "ps2" | "video" | "memory" | "renderer" | "scheduler" | "device";

export interface BootTraceEvent {
  readonly tick: number;
  readonly sequence: number;
  readonly source: TraceSource;
  readonly kind: string;
  readonly data: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Append-only deterministic trace. It deliberately carries no wall-clock time:
 * host timing is not guest state and would make replay comparisons unstable.
 */
export class BootTrace {
  private readonly events: BootTraceEvent[] = [];
  private sequence = 0;

  record(tick: number, source: TraceSource, kind: string, data: Readonly<Record<string, string | number | boolean>> = {}): BootTraceEvent {
    if (!Number.isInteger(tick) || tick < 0) throw new Error("رقم tick في سجل الإقلاع غير صالح.");
    const event: BootTraceEvent = Object.freeze({ tick, sequence: this.sequence++, source, kind, data: Object.freeze({ ...data }) });
    this.events.push(event);
    return event;
  }

  snapshot(): readonly BootTraceEvent[] { return this.events.slice(); }
  toJson(): string { return JSON.stringify(this.events); }

  equals(other: BootTrace): boolean { return this.toJson() === other.toJson(); }
}
