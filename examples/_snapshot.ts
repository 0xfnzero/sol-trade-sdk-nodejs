/** Exact snapshot integers. Large JSON integers must be decimal strings. */
function integer(value: unknown, field: string, minimum: bigint, maximum: bigint): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`${field}: unsafe Number; use a decimal string`);
  }
  if (typeof value !== 'bigint' && typeof value !== 'number' &&
      !(typeof value === 'string' && /^-?\d+$/.test(value))) {
    throw new TypeError(`${field}: integer required`);
  }
  const result = BigInt(value);
  if (result < minimum || result > maximum) throw new RangeError(`${field}: integer out of range`);
  return result;
}
export function snapshotU64(value: unknown, field: string): bigint {
  return integer(value, field, 0n, (1n << 64n) - 1n);
}
export function snapshotI64(value: unknown, field: string): bigint {
  return integer(value, field, -(1n << 63n), (1n << 63n) - 1n);
}
