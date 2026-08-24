import { describe, expect, it } from "vitest";
import { memoryLaunchMessage, memoryOptions } from "../src/engine/memory-policy";

describe("JustGo guest memory policy", () => {
  it("offers 4GiB directly on a desktop-like environment", () => {
    const tier = memoryOptions({ isTouchFirst: false, deviceMemoryGiB: 8 }).find((option) => option.miB === 2048);
    const maxTier = memoryOptions({ isTouchFirst: false, deviceMemoryGiB: 8 }).find((option) => option.miB === 4096);
    expect(tier?.state).toBe("available");
    expect(maxTier?.state).toBe("available");
    expect(memoryLaunchMessage(maxTier!)).toBeUndefined();
  });

  it("keeps 4GiB available on touch-first environments", () => {
    const tiers = memoryOptions({ isTouchFirst: true, deviceMemoryGiB: 8 });
    expect(tiers.find((option) => option.miB === 1024)?.state).toBe("available");
    expect(tiers.find((option) => option.miB === 4096)?.state).toBe("available");
  });
});
