import { it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { tokenTransferFeeForEpoch } from '../instruction/token_mint_state';
import { calculateTokenTransferFee } from '../instruction/stonkfun';
import fixture from './fixtures/token2022_bank_fee_20261008.json';

it.each(fixture.cases)('decodes bank mint fee $name ($scope)', (row) => {
  const fee = tokenTransferFeeForEpoch(Buffer.from(row.data, 'base64'), new PublicKey(row.owner), BigInt(row.epoch));
  expect(fee).toEqual({basisPoints: row.basis_points, maximumFee: BigInt(row.maximum_fee)});
  for (const sample of row.samples) {
    expect(calculateTokenTransferFee(BigInt(sample.amount), fee)).toBe(BigInt(sample.fee));
  }
});
