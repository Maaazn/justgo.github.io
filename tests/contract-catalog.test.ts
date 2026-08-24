import { describe, expect, it } from "vitest";
import { ENGINE_CONTRACTS, contractById, contractsForMilestone, validateContractCatalog } from "../src/lab/contract-catalog";

describe("JustGo contract catalog", () => {
  it("keeps each growth item identifiable, testable and measurable", () => {
    expect(() => validateContractCatalog()).not.toThrow();
    expect(ENGINE_CONTRACTS.length).toBeGreaterThan(10);
    expect(contractById("ps2-queue")?.maturity).toBe("verified");
    expect(contractsForMilestone("60k").every((contract) => contract.maturity === "planned")).toBe(true);
  });

  it("rejects a duplicate or untestable growth item", () => {
    expect(() => validateContractCatalog([{ ...ENGINE_CONTRACTS[0], module: "docs/not-a-module.md" }, ENGINE_CONTRACTS[0]])).toThrow();
  });
});
