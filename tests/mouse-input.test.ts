import { describe, expect, it } from "vitest";
import { toPs2Buttons, translatePointerMotion } from "../src/engine/mouse-input";

describe("JustGo pointer-to-PS/2 mouse bridge", () => {
  it("maps browser buttons and reverses the browser Y axis", () => {
    expect(toPs2Buttons(5)).toBe(3);
    expect(translatePointerMotion({ movementX: 12.9, movementY: 5.8, buttons: 5, pointerType: "mouse" }, "pointer-events", true))
      .toEqual({ deltaX: 12, deltaY: -5, buttons: 3 });
  });

  it("does not send unfocused movement or touch to a pointer-lock-only surface", () => {
    const touch = { movementX: 4, movementY: 3, buttons: 0, pointerType: "touch" as const };
    expect(translatePointerMotion(touch, "pointer-events", false)).toBeUndefined();
    expect(translatePointerMotion(touch, "pointer-lock", true)).toBeUndefined();
  });
});
