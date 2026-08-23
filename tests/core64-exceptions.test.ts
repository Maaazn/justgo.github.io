import { describe, expect, it } from "vitest";
import { createExceptionFrame, exceptionVector, LongModeCpuException } from "../src/core64/exceptions";

describe("JustGo Core-64 exceptions", () => {
  it("maps architectural exception kinds to stable vectors", () => {
    expect(exceptionVector("invalid-opcode")).toBe(6);
    expect(exceptionVector("general-protection")).toBe(13);
    expect(exceptionVector("page-fault")).toBe(14);
  });

  it("keeps page-fault context and wraps RIP at 64-bit width", () => {
    const frame = createExceptionFrame("page-fault", -1n, { errorCode: 0b10, faultAddress: 0xffff_8000_0000_1000n });
    expect(frame).toMatchObject({ vector: 14, rip: 0xffff_ffff_ffff_ffffn, errorCode: 2, faultAddress: 0xffff_8000_0000_1000n });
    expect(new LongModeCpuException(frame).message).toContain("page-fault");
  });
});
