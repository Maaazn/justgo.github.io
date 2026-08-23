import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { LinearMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";

describe("JustGo Core-16 benchmark", () => {
  it("executes a deterministic 65,535-iteration LOOP workload", () => {
    const core = new Core16(new LinearMemory(), new TestPortBus());
    // MOV CX, FFFF; LOOP -2; HLT
    core.loadProgram(Uint8Array.from([0xb9, 0xff, 0xff, 0xe2, 0xfe, 0xf4]));
    const started = performance.now();
    core.run(70_000);
    const elapsedMs = performance.now() - started;
    console.info(`JUSTGO_CORE16_BENCHMARK steps=${core.state.steps} elapsed_ms=${elapsedMs.toFixed(2)}`);
    expect(core.state.steps).toBe(65_537);
    expect(core.state.halted).toBe(true);
  });
});
