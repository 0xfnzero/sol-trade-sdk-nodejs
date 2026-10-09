import { it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import fixture from './fixtures/cached_mint_tlv_20261009.json';
import { tokenTransferFeeForEpoch } from '../src/instruction/token_mint_state';
const token = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
it.each(fixture.cases)('$name matches official cached mint semantics', c => {
  const decode = () => tokenTransferFeeForEpoch(Buffer.from(c.mint_data, 'base64'), token, BigInt(c.epoch));
  if (!c.eligible) expect(decode).toThrow();
  else expect(decode()).toEqual({ basisPoints: c.basis_points, maximumFee: BigInt(c.maximum_fee) });
});
