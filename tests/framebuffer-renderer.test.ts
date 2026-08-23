import { describe, expect, it } from "vitest";
import { detectFramebufferCapability, validateFramebuffer } from "../src/render/framebuffer-renderer";

describe("JustGo framebuffer renderer contracts", () => {
  it("prefers WebGPU only when it is explicitly available", () => {
    expect(detectFramebufferCapability(true, true)).toEqual({ preferred: "webgpu", webgpuAvailable: true });
    expect(detectFramebufferCapability(true, false)).toEqual({ preferred: "canvas2d", webgpuAvailable: false });
    expect(detectFramebufferCapability(false, false)).toEqual({ preferred: "unavailable", webgpuAvailable: false });
  });

  it("rejects malformed RGBA buffers before either renderer receives them", () => {
    expect(() => validateFramebuffer({ width: 2, height: 2, rgba: new Uint8Array(15) })).toThrow("RGBA");
    expect(() => validateFramebuffer({ width: 0, height: 2, rgba: new Uint8Array() })).toThrow("أبعاد");
  });
});
