import { u64, U64_MASK } from "./registers";

export interface Alu64Result {
  readonly result: bigint;
  readonly carry: boolean;
  readonly overflow: boolean;
  readonly zero: boolean;
  readonly sign: boolean;
}

const SIGN = 1n << 63n;

export function add64(left: bigint, right: bigint): Alu64Result {
  const lhs = u64(left);
  const rhs = u64(right);
  const raw = lhs + rhs;
  const result = u64(raw);
  return {
    result,
    carry: raw > U64_MASK,
    overflow: ((~(lhs ^ rhs) & (lhs ^ result)) & SIGN) !== 0n,
    zero: result === 0n,
    sign: (result & SIGN) !== 0n,
  };
}

export function sub64(left: bigint, right: bigint): Alu64Result {
  const lhs = u64(left);
  const rhs = u64(right);
  const result = u64(lhs - rhs);
  return {
    result,
    carry: lhs < rhs,
    overflow: (((lhs ^ rhs) & (lhs ^ result)) & SIGN) !== 0n,
    zero: result === 0n,
    sign: (result & SIGN) !== 0n,
  };
}
