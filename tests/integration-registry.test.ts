import { describe, expect, it } from "vitest";
import { evaluateIntegration, getIntegration } from "../src/integration/registry";

describe("JustGo engine integration registry", () => {
  it("permits the v86 bridge only when its notice is registered", () => {
    const v86 = getIntegration("v86-bridge");
    expect(evaluateIntegration(v86, "runtime-bridge", false).allowed).toBe(false);
    expect(evaluateIntegration(v86, "runtime-bridge", true).allowed).toBe(true);
  });

  it("blocks a reference-only engine from becoming a runtime bridge", () => {
    const qemu = getIntegration("qemu-tcg-reference");
    expect(evaluateIntegration(qemu, "runtime-bridge", true).allowed).toBe(false);
  });
});
