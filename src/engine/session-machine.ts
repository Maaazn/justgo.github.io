import type { LocalSessionSnapshot, SessionState } from "./contracts";

/**
 * JustGo Local Engine design: deterministic state transitions make boot
 * progress observable and prohibit accidental parallel launches.
 */
const TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  idle: ["validating"],
  validating: ["loading-runtime", "failed"],
  "loading-runtime": ["preparing-storage", "failed"],
  "preparing-storage": ["booting", "failed"],
  booting: ["running", "failed", "stopping"],
  running: ["stopping", "failed"],
  stopping: ["stopped", "failed"],
  stopped: ["validating"],
  failed: ["stopped", "validating"],
};

function createSessionId(): string {
  return `jgo_${crypto.randomUUID()}`;
}

export class LocalSessionMachine {
  private snapshotValue: LocalSessionSnapshot = {
    id: createSessionId(),
    state: "idle",
    message: "جاهز لإنشاء بيئة محلية على جهازك.",
  };

  get snapshot(): LocalSessionSnapshot {
    return { ...this.snapshotValue };
  }

  transition(next: SessionState, message: string, imageId?: string): LocalSessionSnapshot {
    const allowed = TRANSITIONS[this.snapshotValue.state];
    if (!allowed.includes(next)) {
      throw new Error(`انتقال جلسة غير مسموح: ${this.snapshotValue.state} ←/→ ${next}`);
    }
    this.snapshotValue = {
      ...this.snapshotValue,
      state: next,
      message,
      imageId: imageId ?? this.snapshotValue.imageId,
      startedAt: next === "booting" ? new Date().toISOString() : this.snapshotValue.startedAt,
    };
    return this.snapshot;
  }

  reset(message = "انتهت الجلسة المحلية ونُظّفت واجهة العرض."): LocalSessionSnapshot {
    this.snapshotValue = { id: createSessionId(), state: "stopped", message };
    return this.snapshot;
  }
}
