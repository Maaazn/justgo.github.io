import { describe, expect, it } from "vitest";
import { decodeRecoverySettings, encodeRecoverySettings } from "../src/engine/session-recovery";

const settings = { imageId: "custom", localFormat: "cdrom" as const, memoryMiB: 4096 as const, displayId: "uhd-4k" as const, virtualDiskGiB: 64 as const, acpiExperimental: true, retainLocalMedium: true };

describe("JustGo session recovery settings", () => {
  it("round-trips a recoverable local launch configuration", () => {
    expect(decodeRecoverySettings(encodeRecoverySettings(settings))).toEqual(settings);
  });

  it("rejects malformed persisted settings", () => {
    expect(decodeRecoverySettings('{"memoryMiB":4096}')).toBeUndefined();
  });
});
