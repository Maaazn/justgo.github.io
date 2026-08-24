import { describe, expect, it } from "vitest";
import { DISPLAY_PRESETS, displayPreset } from "../src/engine/display-presets";

describe("JustGo display presets", () => {
  it("offers HD through 4K host display targets", () => {
    expect(DISPLAY_PRESETS.map((preset) => preset.id)).toEqual(["xga", "hd", "full-hd", "qhd", "uhd-4k"]);
    expect(displayPreset("uhd-4k")).toMatchObject({ width: 3840, height: 2160 });
  });
});
