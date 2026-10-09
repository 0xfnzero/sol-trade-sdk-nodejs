import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateTokenTransferFee } from '../instruction/stonkfun';

interface Sample { basisPoints: number; maximumFee: string; amount: string; fee: string; inverseFee: string | null; }
const oracle: { oracle: string; samples: Sample[] } = JSON.parse(readFileSync(
  new URL('./fixtures/token2022_inverse_spl_20261009.json', import.meta.url), 'utf8'));

it('net-output fee recovery matches 140 official SPL ceiling/cap/u64 boundary cases', () => {
  expect(oracle.oracle).toContain('spl_token_2022_interface');
  expect(oracle.samples).toHaveLength(140);
  const u64Max = (1n << 64n) - 1n;
  for (const sample of oracle.samples) {
    const amount = BigInt(sample.amount);
    const fee = { basisPoints: sample.basisPoints, maximumFee: BigInt(sample.maximumFee) };
    expect(calculateTokenTransferFee(amount, fee)).toBe(BigInt(sample.fee));
    const inverse = calculateTokenTransferFee(amount, fee, true);
    const gross = amount + inverse;
    const reachable = gross <= u64Max ? inverse.toString() : null;
    expect(reachable, JSON.stringify(sample)).toBe(sample.inverseFee);
    if (gross <= u64Max) expect(gross - calculateTokenTransferFee(gross, fee)).toBe(amount);
  }
});
