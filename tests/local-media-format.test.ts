import { describe, expect, it } from "vitest";
import { inferLocalMediaFormat, localMediaFormatMessage } from "../src/engine/local-media-format";

describe("JustGo local media format inference", () => {
  it("attaches ISO files as CD-ROM regardless of letter case", () => {
    expect(inferLocalMediaFormat("Tiny7.ISO")).toBe("cdrom");
    expect(localMediaFormatMessage("Tiny7.iso", "cdrom")).toContain("CD-ROM");
  });

  it("keeps disk-like files on the hard-disk path", () => {
    expect(inferLocalMediaFormat("guest.img")).toBe("hard-disk");
  });
});
