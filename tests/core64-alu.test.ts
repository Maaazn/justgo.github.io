import { describe, expect, it } from "vitest";
import { add64, sub64 } from "../src/core64/alu";
import { decodeModRm64, UnsupportedCore64AddressingError } from "../src/core64/modrm";

describe("JustGo Core-64 ALU and ModR/M", () => {
  it("computes carry and signed overflow independently", () => {
    expect(add64(0xffff_ffff_ffff_ffffn, 1n)).toMatchObject({ result: 0n, carry: true, overflow: false });
    expect(add64(0x7fff_ffff_ffff_ffffn, 1n)).toMatchObject({ result: 0x8000_0000_0000_0000n, carry: false, overflow: true });
    expect(sub64(0n, 1n)).toMatchObject({ result: 0xffff_ffff_ffff_ffffn, carry: true });
  });

  it("maps REX extensions and rejects memory addressing until implemented", () => {
    expect(decodeModRm64(0xc1, { raw: 0x4d, w: true, r: true, x: false, b: true }, 0x89)).toMatchObject({ reg: "r8", rm: "r9" });
    expect(() => decodeModRm64(0x00, undefined, 0x89)).toThrow(UnsupportedCore64AddressingError);
  });
});
