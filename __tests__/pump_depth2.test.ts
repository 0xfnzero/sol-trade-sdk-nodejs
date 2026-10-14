import {describe,it,expect} from 'vitest';
import {PublicKey,VersionedTransaction,TransactionMessage,Keypair,AddressLookupTableAccount} from '@solana/web3.js';
import {createPublicKey,verify} from 'node:crypto';
import fixture from '../tests/fixtures/pump_upgrade/create_depth2.json';
import {derivePumpCoinQuoteCreateAccounts,PumpMultiHop} from '../src/instruction/pump_compact_accounts';
import {buildPumpCreateV2Instruction} from '../src/instruction/pump_create_v2';
const decode=(h:typeof fixture.cases[number]['quote'])=>Object.fromEntries(Object.entries(h).map(([k,v])=>[k,typeof v==='string' && k!=='venue'?new PublicKey(v):v])) as unknown as PumpMultiHop;
describe('official depth-2 create_v2',()=>{
 for(const c of fixture.cases) it(c.name,()=>{
  const quote=decode(c.quote),chain=c.chain.map(decode),mint=new PublicKey(c.accounts.mint!);
  const listed=c.listedQuoteMints.map(k=>new PublicKey(k));
  const remaining=derivePumpCoinQuoteCreateAccounts(mint,quote,c.depth,c.maxDepth,listed,chain);
  // Whitelisting an ancestor later does not rewrite Q's stored depth.
  expect(derivePumpCoinQuoteCreateAccounts(mint,quote,c.depth,c.maxDepth,[...listed,chain[0]!.baseMint],chain)).toEqual(remaining);
  expect(remaining.map(m=>({pubkey:m.pubkey.toBase58(),signer:m.isSigner,writable:m.isWritable}))).toEqual(c.keys.slice(16));
  const accounts=Object.fromEntries(Object.entries(c.accounts).map(([k,v])=>[k,new PublicKey(v)]));
  const ix=buildPumpCreateV2Instruction(accounts,{...c.params,creator:new PublicKey(c.params.creator),creatorFeeBps:BigInt(c.params.creatorFeeBps)},remaining);
  expect(ix.data.toString('hex')).toBe(c.data);
  const lookup=new AddressLookupTableAccount({key:new PublicKey(c.lookup.key),state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:c.lookup.addresses.map(k=>new PublicKey(k))}});
  const expected=VersionedTransaction.deserialize(Buffer.from(c.transaction,'base64'));
  const tx=new VersionedTransaction(new TransactionMessage({payerKey:accounts.user!,recentBlockhash:expected.message.recentBlockhash,instructions:[ix]}).compileToV0Message([lookup]));
  tx.sign([Keypair.fromSeed(Buffer.alloc(32,101)),Keypair.fromSeed(Buffer.alloc(32,102))]);
  expect(Buffer.from(tx.serialize()).toString('base64')).toBe(c.transaction);
  tx.signatures.forEach((s,i)=>expect(verify(null,tx.message.serialize(),createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),tx.message.staticAccountKeys[i]!.toBuffer()]),format:'der',type:'spki'}),s)).toBe(true));
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,quote,1,2,[])).toThrow('QuoteChainAccountsRequired');
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,quote,1,1,[],chain)).toThrow('CurveDepthExceeded');
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,quote,1,2,listed,[{...chain[0]!,baseMint:mint}])).toThrow("Invalid quote chain");
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,quote,1,2,listed,[{...chain[0]!,baseMint:accounts.user!}])).toThrow("Discontinuous quote chain");
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,quote,1,2,listed,[{...chain[0]!,baseTokenProgram:accounts.program!}])).toThrow("Discontinuous quote chain");
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,quote,5,255,listed,chain)).toThrow("CurveDepthExceeded");
  expect(()=>buildPumpCreateV2Instruction(accounts,{...c.params,creator:accounts.user!,creatorFeeBps:25n},remaining.map((m,i)=>i===2?{...m,isWritable:true}:m))).toThrow("Invalid quote creation accounts");
  expect(()=>buildPumpCreateV2Instruction(accounts,{...c.params,creator:accounts.user!,creatorFeeBps:25n},remaining.map((m,i)=>i===4?{...m,isSigner:true}:m))).toThrow("Invalid quote creation accounts");
  expect(()=>derivePumpCoinQuoteCreateAccounts(mint,{...quote,mayhem:true},1,2,c.listedQuoteMints.map(k=>new PublicKey(k)),chain)).toThrow();
  expect(derivePumpCoinQuoteCreateAccounts(mint,quote,1,2,c.listedQuoteMints.map(k=>new PublicKey(k)),[{...chain[0]!,mayhem:true}])).toEqual(remaining);
  expect(()=>buildPumpCreateV2Instruction(accounts,{name:'x',symbol:'x',uri:'x',creator:accounts.user!,mayhem:true},remaining)).toThrow();
 });
});
