import { describe, expect, it } from "vitest";
import { Core16 } from "../src/core16/cpu";
import { PcBiosServices, PC_BIOS_SEGMENT, PC_RESET_OFFSET, installPcBiosBootRom, type BiosBlockDevice } from "../src/core16/firmware";
import { LinearMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";
import { CORE16_BOOT_CORPUS } from "../src/lab/boot-corpus16";

function bootDisk(bootSector: Uint8Array): BiosBlockDevice {
  const sector = new Uint8Array(512);
  sector.set(bootSector);
  return { sectorSize: 512, sectorCount: 1, readSector: (lba) => lba === 0 ? sector.slice() : undefined };
}

describe("Core-16 boot corpus", () => {
  for (const corpusCase of CORE16_BOOT_CORPUS) {
    it(`executes ${corpusCase.id} through reset ROM and the guest boot sector`, () => {
      const memory = new LinearMemory();
      const output: number[] = [];
      installPcBiosBootRom(memory);
      const core = new Core16(memory, new TestPortBus(), undefined, {}, new PcBiosServices({ bootDevice: bootDisk(corpusCase.bootSector), textSink: (character) => output.push(character) }));
      core.reset({ cs: PC_BIOS_SEGMENT, ip: PC_RESET_OFFSET, ds: 0, es: 0, ss: 0, sp: 0xfffe });
      const trace = core.run();
      expect(trace.map((entry) => entry.mnemonic)).toEqual([
        "JMP ptr16:16", "MOV AX, imm16", "MOV CX, imm16", "MOV DX, imm16", "MOV BX, imm16", "INT imm8", "JMP ptr16:16",
        "MOV AH, imm8", "MOV AL, imm8", "INT imm8", "MOV AX, imm16", "HLT",
      ]);
      expect(core.state.ax).toBe(corpusCase.expectedAx);
      expect(String.fromCharCode(...output)).toBe(corpusCase.expectedText);
    });
  }
});
