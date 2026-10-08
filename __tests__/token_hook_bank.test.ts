import {it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {tokenTransferFeeForEpoch} from '../src/instruction/token_mint_state';
import fixture from './fixtures/token_hook_bank_20261008.json';
for(const c of fixture.cases) it(`bank Hook mint ${c.name}`,()=>{
 const invoke=()=>tokenTransferFeeForEpoch(Buffer.from(c.data,'base64'),new PublicKey(c.owner),0n);
 if(c.reject_hook)expect(invoke).toThrow(/hook/i);
 else expect(invoke()).toEqual({basisPoints:0,maximumFee:0n});
});
