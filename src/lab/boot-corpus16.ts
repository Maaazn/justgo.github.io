/** Executable real-mode boot workloads for the native Core-16 firmware path. */
export interface Core16BootCorpusCase {
  readonly id: string;
  readonly bootSector: Uint8Array;
  readonly expectedAx: number;
  readonly expectedText: string;
}

export const CORE16_BOOT_CORPUS: readonly Core16BootCorpusCase[] = [
  {
    id: "reset-rom-chs-load-teletype-handoff",
    bootSector: new Uint8Array([
      0xb4, 0x0e,
      0xb0, 0x4a,
      0xcd, 0x10,
      0xb8, 0xce, 0xfa,
      0xf4,
    ]),
    expectedAx: 0xface,
    expectedText: "J",
  },
];
