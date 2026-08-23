/**
 * JustGo integration policy: an engine is never loaded by name alone.
 * Every external component must declare provenance, license and boundaries.
 */
export type IntegrationStatus = "active" | "reference-only" | "blocked";

export interface EngineIntegration {
  id: string;
  label: string;
  status: IntegrationStatus;
  origin: "justgo" | "third-party";
  sourceUrl: string;
  license: string;
  noticeRequired: boolean;
  supportedArchitectures: readonly string[];
  allowedRoles: readonly ("runtime-bridge" | "design-reference" | "test-oracle")[];
  restrictions: readonly string[];
}

export interface IntegrationDecision {
  allowed: boolean;
  reasons: readonly string[];
}
