import { describe, expect, it } from "vitest";
import { resolveInputProfile } from "../src/engine/input-control";

describe("JustGo adaptive input policy", () => {
  it("uses direct pointer events when Pointer Lock is unavailable", () => {
    expect(resolveInputProfile({ pointerEvents: true, pointerLock: false }).mode).toBe("pointer-events");
  });

  it("uses pointer lock only when the browser exposes it", () => {
    expect(resolveInputProfile({ pointerEvents: true, pointerLock: true }).mode).toBe("pointer-lock");
  });

  it("falls back to direct touch when neither browser capability is available", () => {
    expect(resolveInputProfile({ pointerEvents: false, pointerLock: false }).mode).toBe("touch-direct");
  });
});
