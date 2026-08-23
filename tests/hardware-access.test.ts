import { describe, expect, it, vi } from "vitest";
import { detectHardwareAccess, requestUserSelectedHardware } from "../src/engine/hardware-access";

describe("JustGo optional browser hardware access", () => {
  it("detects capability without requesting a device", () => {
    const hid = { requestDevice: vi.fn() };
    expect(detectHardwareAccess({ hid })).toEqual({ hid: true, usb: false });
    expect(hid.requestDevice).not.toHaveBeenCalled();
  });

  it("requests HID only after an explicit caller invocation", async () => {
    const requestDevice = vi.fn().mockResolvedValue(["mouse"]);
    await expect(requestUserSelectedHardware({ hid: { requestDevice } }, "hid")).resolves.toEqual(["mouse"]);
    expect(requestDevice).toHaveBeenCalledWith({ filters: [] });
  });

  it("rejects unavailable APIs without a fallback connection", async () => {
    await expect(requestUserSelectedHardware(undefined, "usb")).rejects.toThrow("WebUSB غير متاح");
  });
});
