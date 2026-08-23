/** Core-64 architectural exceptions are modeled before IDT delivery is wired. */
export type LongModeExceptionKind = "divide-error" | "invalid-opcode" | "general-protection" | "page-fault" | "double-fault";

const VECTORS: Readonly<Record<LongModeExceptionKind, number>> = {
  "divide-error": 0,
  "invalid-opcode": 6,
  "double-fault": 8,
  "general-protection": 13,
  "page-fault": 14,
};

export interface LongModeExceptionFrame {
  readonly kind: LongModeExceptionKind;
  readonly vector: number;
  readonly errorCode?: number;
  readonly faultAddress?: bigint;
  readonly rip: bigint;
}

export function exceptionVector(kind: LongModeExceptionKind): number { return VECTORS[kind]; }

export function createExceptionFrame(
  kind: LongModeExceptionKind,
  rip: bigint,
  options: Pick<LongModeExceptionFrame, "errorCode" | "faultAddress"> = {},
): LongModeExceptionFrame {
  return { kind, vector: exceptionVector(kind), rip: rip & 0xffff_ffff_ffff_ffffn, ...options };
}

export class LongModeCpuException extends Error {
  constructor(readonly frame: LongModeExceptionFrame) {
    super(`استثناء Core-64 ${frame.kind} (vector=${frame.vector}) عند RIP=0x${frame.rip.toString(16)}.`);
    this.name = "LongModeCpuException";
  }
}
