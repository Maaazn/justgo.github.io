import { describe, expect, it } from "vitest";
import { JUSTGO_CAPABILITY_MANIFEST, capabilityById, publicationBlockers, validateCapabilityManifest } from "../src/lab/capability-manifest";

describe("JustGo capability manifest", () => {
  it("requires evidence, limits, modules and tests for every validated capability", () => {
    expect(() => validateCapabilityManifest()).not.toThrow();
    expect(JUSTGO_CAPABILITY_MANIFEST.filter((entry) => entry.maturity === "validated").every((entry) => entry.modules.length > 0 && entry.tests.length > 0 && entry.limits.length > 0)).toBe(true);
  });

  it("keeps general operating-system boot compatibility out of the validated set", () => {
    expect(capabilityById("os-boot-compatibility").maturity).toBe("planned");
    expect(publicationBlockers().map((entry) => entry.id)).toContain("os-boot-compatibility");
  });

  it("rejects duplicate identifiers and unevidenced validated entries", () => {
    const duplicate = JUSTGO_CAPABILITY_MANIFEST.map((entry) => ({ ...entry }));
    duplicate.push({ ...duplicate[0]!, modules: [], tests: [], evidence: "", limits: [] });
    expect(() => validateCapabilityManifest(duplicate)).toThrow(/مكرر/);
  });
});
