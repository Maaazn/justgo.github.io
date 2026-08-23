import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { Core16BlockCache } from "../src/core16/block-cache";
import { VersionedMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";

function createCachedCore(program: number[]) {
  const memory = new VersionedMemory();
  const core = new Core16(memory, new TestPortBus());
  core.loadProgram(Uint8Array.from(program));
  return { core, memory, cache: new Core16BlockCache(memory) };
}

describe("JustGo Core-16 block cache", () => {
  it("matches the interpreter for a linear arithmetic block", () => {
    const interpreter = createCachedCore([0xb8, 0x02, 0x00, 0x05, 0x03, 0x00, 0x48, 0xf4]);
    interpreter.core.run();

    const cached = createCachedCore([0xb8, 0x02, 0x00, 0x05, 0x03, 0x00, 0x48, 0xf4]);
    const result = cached.cache.run(cached.core, 100);
    expect(result.exit).toBe("halt");
    expect(cached.core.state.ax).toBe(interpreter.core.state.ax);
    expect(cached.core.state.flags).toBe(interpreter.core.state.flags);
    expect(cached.core.state.steps).toBe(interpreter.core.state.steps);
  });

  it("hits the cache after resetting the same CPU entry point", () => {
    const { core, cache } = createCachedCore([0x90, 0xf4]);
    expect(cache.run(core, 10).cache).toBe("miss");
    core.reset();
    expect(cache.run(core, 10).cache).toBe("hit");
    expect(cache.metrics.hits).toBe(1);
  });

  it("invalidates a translated page after code changes", () => {
    const { core, memory, cache } = createCachedCore([0x90, 0xf4]);
    cache.run(core, 10);
    core.reset();
    memory.write8(0, 0xb8);
    memory.write8(1, 0x34);
    memory.write8(2, 0x12);
    memory.write8(3, 0xf4);
    const result = cache.run(core, 10);
    expect(result.cache).toBe("invalid");
    expect(core.state.ax).toBe(0x1234);
    expect(cache.metrics.invalidations).toBe(1);
  });

  it("returns to the interpreter at an unsupported control-flow barrier", () => {
    const { core, cache } = createCachedCore([0xeb, 0x00, 0xf4]);
    const result = cache.run(core, 10);
    expect(result.executed).toBe(0);
    expect(result.exit).toBe("barrier");
    core.step();
    expect(core.state.ip).toBe(2);
  });
});
