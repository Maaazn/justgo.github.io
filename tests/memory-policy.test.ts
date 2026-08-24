import { describe, expect, it } from "vitest";
import { memoryLaunchMessage, memoryOptions } from "../src/engine/memory-policy";

describe("JustGo guest memory policy", () => {
  it("keeps 2GiB behind confirmation on a desktop-like environment", () => {
    const tier = memoryOptions({ isTouchFirst: false, deviceMemoryGiB: 8 }).find((option) => option.miB === 2048);
    expect(tier?.state).toBe("confirmation");
    expect(memoryLaunchMessage(tier!)).toContain("قد يرفض المتصفح");
  });

  it("blocks high memory tiers on touch-first environments", () => {
    const tiers = memoryOptions({ isTouchFirst: true, deviceMemoryGiB: 8 });
    expect(tiers.find((option) => option.miB === 512)?.state).toBe("available");
    expect(tiers.find((option) => option.miB === 1024)?.state).toBe("blocked");
  });
});
