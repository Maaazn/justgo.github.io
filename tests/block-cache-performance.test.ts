import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { Core16BlockCache } from "../src/core16/block-cache";
import { Core16 } from "../src/core16/cpu";
import { VersionedMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";

const RUNS = 2_000;
const PROGRAM = Uint8Array.from([...Array<number>(63).fill(0x90), 0xf4]);

function createCore() {
  const memory = new VersionedMemory();
  const core = new Core16(memory, new TestPortBus());
  core.loadProgram(PROGRAM);
  return { core, memory };
}

describe("JustGo Core-16 block cache benchmark", () => {
  it("reports cached linear-block execution against the interpreter", () => {
    const interpreted = createCore();
    const interpreterStarted = performance.now();
    for (let run = 0; run < RUNS; run += 1) {
      interpreted.core.reset();
      while (!interpreted.core.state.halted) interpreted.core.step();
    }
    const interpreterMs = performance.now() - interpreterStarted;

    const translated = createCore();
    const cache = new Core16BlockCache(translated.memory);
    const cacheStarted = performance.now();
    for (let run = 0; run < RUNS; run += 1) {
      translated.core.reset();
      cache.run(translated.core, 100);
    }
    const cacheMs = performance.now() - cacheStarted;
    const speedRatio = interpreterMs / cacheMs;
    console.info(`JUSTGO_BLOCK_CACHE_BENCHMARK instructions=${RUNS * PROGRAM.length} interpreter_ms=${interpreterMs.toFixed(2)} cache_ms=${cacheMs.toFixed(2)} ratio=${speedRatio.toFixed(2)} cache_hits=${cache.metrics.hits}`);

    expect(translated.core.state.halted).toBe(true);
    expect(cache.metrics.hits).toBe(RUNS - 1);
    expect(translated.core.state.steps).toBe(PROGRAM.length);
  });
});
