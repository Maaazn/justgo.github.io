import { describe, expect, it } from "vitest";
import { CmosRtc } from "../src/core16/cmos";

describe("JustGo deterministic CMOS/RTC", () => {
  it("exposes BCD clock fields via ports 70h/71h and raises IRQ8 on whole seconds", () => {
    const vectors: number[] = [];
    const rtc = new CmosRtc({ request: (vector) => vectors.push(vector) });
    rtc.out8(0x70, 0x00);
    expect(rtc.in8(0x71)).toBe(0);
    expect(rtc.advanceMilliseconds(999)).toBe(0);
    expect(rtc.advanceMilliseconds(1)).toBe(1);
    rtc.out8(0x70, 0x00);
    expect(rtc.in8(0x71)).toBe(0x01);
    expect(vectors).toEqual([0x70]);
  });

  it("keeps NMI selection bit separate from the selected CMOS register", () => {
    const rtc = new CmosRtc({ request: () => undefined });
    rtc.out8(0x70, 0x8b);
    expect(rtc.in8(0x70)).toBe(0x8b);
    expect(rtc.snapshot().nmiDisabled).toBe(true);
    expect(rtc.in8(0x71)).toBe(0x02);
  });
});
