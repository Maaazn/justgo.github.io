/**
 * Browser hardware access is optional. JustGo never opens a device on load;
 * callers must invoke a request method from a user gesture in a secure context.
 */
export type HardwareAccessKind = "hid" | "usb";

export interface UserSelectedHid {
  requestDevice(options: { filters: readonly unknown[] }): Promise<readonly unknown[]>;
}

export interface UserSelectedUsb {
  requestDevice(options: { filters: readonly unknown[] }): Promise<unknown>;
}

export interface HardwareAccessHost {
  hid?: UserSelectedHid;
  usb?: UserSelectedUsb;
}

export interface HardwareAccessCapabilities {
  readonly hid: boolean;
  readonly usb: boolean;
}

export function detectHardwareAccess(host: HardwareAccessHost | undefined): HardwareAccessCapabilities {
  return { hid: typeof host?.hid?.requestDevice === "function", usb: typeof host?.usb?.requestDevice === "function" };
}

export async function requestUserSelectedHardware(host: HardwareAccessHost | undefined, kind: HardwareAccessKind): Promise<readonly unknown[]> {
  const capabilities = detectHardwareAccess(host);
  if (kind === "hid") {
    if (!capabilities.hid || !host?.hid) throw new Error("WebHID غير متاح في هذا المتصفح.");
    return host.hid.requestDevice({ filters: [] });
  }
  if (!capabilities.usb || !host?.usb) throw new Error("WebUSB غير متاح في هذا المتصفح.");
  const device = await host.usb.requestDevice({ filters: [] });
  return [device];
}
