import { describe, expect, it } from "vitest";
import { DualPic8259 } from "../src/core16/pic";

function sink() {
  const vectors: number[] = [];
  return { vectors, request(vector: number) { vectors.push(vector); } };
}

describe("JustGo dual 8259A PIC", () => {
  it("delivers the highest-priority unmasked master IRQ and requires EOI before a lower IRQ", () => {
    const pic = new DualPic8259();
    const interrupts = sink();
    pic.requestIrq(4);
    pic.requestIrq(1);
    expect(pic.dispatch(interrupts)).toBe(0x09);
    expect(pic.dispatch(interrupts)).toBeNull();
    pic.out8(0x20, 0x20);
    expect(pic.dispatch(interrupts)).toBe(0x0c);
    expect(interrupts.vectors).toEqual([0x09, 0x0c]);
  });

  it("honors IMR masks and exposes them through data ports", () => {
    const pic = new DualPic8259();
    const interrupts = sink();
    pic.out8(0x21, 1 << 0);
    pic.requestIrq(0);
    expect(pic.in8(0x21)).toBe(1);
    expect(pic.dispatch(interrupts)).toBeNull();
    pic.out8(0x21, 0);
    expect(pic.dispatch(interrupts)).toBe(0x08);
  });

  it("initializes remapped vectors and delivers a slave IRQ through cascade IRQ2", () => {
    const pic = new DualPic8259();
    const interrupts = sink();
    pic.out8(0x20, 0x11); pic.out8(0x21, 0x20); pic.out8(0x21, 0x04); pic.out8(0x21, 0x01);
    pic.out8(0xa0, 0x11); pic.out8(0xa1, 0x28); pic.out8(0xa1, 0x02); pic.out8(0xa1, 0x01);
    pic.requestIrq(14);
    expect(pic.dispatch(interrupts)).toBe(0x2e);
    expect(interrupts.vectors).toEqual([0x2e]);
    expect(pic.snapshot().master.isr).toBe(1 << 2);
    expect(pic.snapshot().slave.isr).toBe(1 << 6);
    pic.out8(0xa0, 0x20); pic.out8(0x20, 0x20);
    expect(pic.snapshot().master.isr).toBe(0);
    expect(pic.snapshot().slave.isr).toBe(0);
  });
});
