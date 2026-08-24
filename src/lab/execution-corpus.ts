/**
 * Executable guest programs used by JustGo tests. These are not fixtures of
 * the host implementation: each byte sequence is loaded into guest memory and
 * interpreted by Core-64 through its normal page-translation path.
 */
export interface Core64CorpusCase {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly expected: { readonly register: "rax" | "rdx"; readonly value: bigint };
}

export interface Core64ExceptionCorpusCase {
  readonly id: string;
  readonly vector: number;
  readonly errorCode: number;
  readonly faultAddress: bigint;
  readonly expectedHandler: bigint;
  readonly expectedStackPointer: bigint;
}

export const CORE64_MEMORY_ALU_CORPUS: readonly Core64CorpusCase[] = [
  {
    id: "memory-mov-add-cmp",
    bytes: new Uint8Array([
      0x48, 0xb8, 0x80, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0xb9, 0x02, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0xba, 0x05, 0, 0, 0, 0, 0, 0, 0,
      0x48, 0x89, 0x10, 0x48, 0x01, 0x08, 0x48, 0x8b, 0x10, 0xf4,
    ]),
    expected: { register: "rdx", value: 7n },
  },
];

export const CORE64_EXCEPTION_CORPUS: readonly Core64ExceptionCorpusCase[] = [
  {
    id: "page-fault-error-frame-ring0",
    vector: 14,
    errorCode: 0x2,
    faultAddress: 0xdeadn,
    expectedHandler: 0x310n,
    expectedStackPointer: 0x8e0n,
  },
];
