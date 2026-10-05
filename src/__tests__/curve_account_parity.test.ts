import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {BondingCurveAccount,decodeBondingCurveAccount} from '../common/bonding_curve';
import {BondingCurveAccount as PublicBondingCurveAccount} from '../index';
import {decodePumpFunBondingCurveData,PumpFunParams} from '../params';
import {USDC_TOKEN_ACCOUNT,WSOL_TOKEN_ACCOUNT,SOL_TOKEN_ACCOUNT} from '../constants';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/curve_account_rust_5_0_6.json',import.meta.url),'utf8'));
describe('pinned Rust curve account methods',()=>{
 it('exports the exact native constructor from the package root',()=>{expect(PublicBondingCurveAccount).toBe(BondingCurveAccount)});
 for(const c of fixture.cases)it(c.name,()=>{
  const curve=new BondingCurveAccount({virtualTokenReserves:BigInt(c.virtual_token_reserves),virtualSolReserves:BigInt(c.virtual_sol_reserves),realTokenReserves:BigInt(c.real_token_reserves),realSolReserves:BigInt(c.real_sol_reserves),tokenTotalSupply:BigInt(c.token_total_supply)});
  const amount=BigInt(c.amount),fee=BigInt(c.fee_basis_points);
  expect(curve.getBuyPrice(amount)).toBe(BigInt(c.buy));
  expect(curve.getSellPrice(amount,fee)).toBe(BigInt(c.sell));
  expect(curve.getMarketCapSol()).toBe(BigInt(c.market_cap));
  expect(curve.getBuyOutPrice(amount,fee)).toBe(BigInt(c.buyout));
  expect(curve.getFinalMarketCapSol(fee)).toBe(BigInt(c.final_market_cap));
 });
 it('decodes u64/V2 layout and both Borsh body lengths without shifting fields',()=>{
  const account=Buffer.from(fixture.layout.account_hex,'hex');
  for(const data of [account,Buffer.concat([account,Buffer.alloc(36)]),account.subarray(8)]){
   const curve=decodeBondingCurveAccount(data)!;
   expect(curve.virtualTokenReserves.toString()).toBe(fixture.layout.reserves[0]);
   expect(curve.virtualSolReserves.toString()).toBe(fixture.layout.reserves[1]);
   expect(curve.realTokenReserves.toString()).toBe(fixture.layout.reserves[2]);
   expect(curve.realSolReserves.toString()).toBe(fixture.layout.reserves[3]);
   expect(curve.tokenTotalSupply.toString()).toBe(fixture.layout.reserves[4]);
   expect(curve.quoteMint.toBuffer().toString('hex')).toBe(fixture.layout.quote_hex);
   expect(curve.creator.toBuffer().toString('hex')).toBe(fixture.layout.creator_hex);
   expect(curve.isCashbackCoin).toBe(true);
  }
  for(const data of [account.subarray(0,83),account.subarray(8,83)]) expect(decodeBondingCurveAccount(data)?.realSolReserves).toBe(456n);
  expect(decodePumpFunBondingCurveData(account,PublicKey.default).virtualTokenReserves).toBe((1n<<64n)-1n);
 });
 it('rejects malformed booleans, discriminator and partial quote fields',()=>{
  const account=Buffer.from(fixture.layout.account_hex,'hex');
  for(const index of [0,48,81,82]){const bad=Buffer.from(account);bad[index]=255;expect(decodeBondingCurveAccount(bad)).toBeNull();}
  for(const length of [0,74,82,84,106,108,114]) expect(decodeBondingCurveAccount(account.subarray(0,length))).toBeNull();
 });
 it('updates both quote selectors and only reconstructed initial reserves',()=>{
  const curve=new BondingCurveAccount({virtualSolReserves:30_000_000_123n,realSolReserves:123n});
  const p=new PumpFunParams(curve,PublicKey.default,PublicKey.default,PublicKey.default);
  p.withQuoteMint(USDC_TOKEN_ACCOUNT);
  expect(p.bondingCurve.virtualSolReserves).toBe(4_292_000_123n);
  expect(p.bondingCurve.quoteMint).toEqual(USDC_TOKEN_ACCOUNT);
  p.withQuoteMint(SOL_TOKEN_ACCOUNT);
  expect(p.quoteMint).toEqual(PublicKey.default);
  expect(p.bondingCurve.quoteMint).toEqual(WSOL_TOKEN_ACCOUNT);
  expect(p.bondingCurve.virtualSolReserves).toBe(30_000_000_123n);
  curve.virtualSolReserves=45n;p.withQuoteMint(USDC_TOKEN_ACCOUNT);expect(curve.virtualSolReserves).toBe(45n);
 });
 it('uses the pinned Rust zero default and explicit reconstruction supply',()=>{
  const curve=new BondingCurveAccount();
  expect([curve.virtualTokenReserves,curve.virtualSolReserves,curve.realTokenReserves,curve.realSolReserves,curve.tokenTotalSupply]).toEqual([0n,0n,0n,0n,0n]);
  expect(curve.quoteMint).toEqual(PublicKey.default);
  expect(()=>curve.getBuyPrice(1n)).toThrow();
  expect(BondingCurveAccount.fromTrade(PublicKey.default,PublicKey.unique(),PublicKey.default,1n,2n,3n,4n).tokenTotalSupply).toBe(1_000_000_000_000_000n);
 });
 it('rejects reserves mutated after construction',()=>{
  const curve=new BondingCurveAccount();
  curve.virtualTokenReserves=-1n;
  for(const run of [()=>curve.getBuyPrice(1n),()=>curve.getSellPrice(1n),()=>curve.getMarketCapSol(),()=>curve.getBuyOutPrice(1n),()=>curve.getFinalMarketCapSol()]) expect(run).toThrow('u64');
 });
 it('preserves completed-curve errors and rejects unsafe numeric construction',()=>{
  const curve=new BondingCurveAccount({complete:true});
  expect(()=>curve.getBuyPrice(0n)).toThrow('Curve is complete');
  expect(()=>curve.getSellPrice(0n)).toThrow('Curve is complete');
  expect(()=>new BondingCurveAccount({virtualSolReserves: 1 as unknown as bigint})).toThrow('u64');
 });
});

describe('explicit cold PumpFun loader validates identity',()=>{
 it('preserves decoded quote and actual mint owner',async()=>{
  const account=Buffer.from(fixture.layout.account_hex,'hex'),mint=PublicKey.unique();
  const mintData=Buffer.alloc(82);mintData[45]=1;
  const {PUMPFUN_PROGRAM,TOKEN_PROGRAM}=await import('../constants');
  const {PUMPFUN_GLOBAL_ACCOUNT,getPumpFunFeeSharingConfigPda}=await import('../instruction/pumpfun_builder');
  const global=Buffer.alloc(73);Buffer.from([167,232,232,177,200,108,114,127]).copy(global);mint.toBuffer().copy(global,41);
  const connection={getAccountInfo:async(key:PublicKey)=>key.equals(getPumpFunFeeSharingConfigPda(mint))?null:key.equals(PUMPFUN_GLOBAL_ACCOUNT)?{owner:PUMPFUN_PROGRAM,data:global}:key.equals(mint)?{owner:TOKEN_PROGRAM,data:mintData}:{owner:PUMPFUN_PROGRAM,data:account}};
  const p=await PumpFunParams.fromMintByRpc(connection as any,mint);
  expect(p.quoteMint?.toBuffer().toString('hex')).toBe(fixture.layout.quote_hex);
  expect(p.bondingCurve.virtualTokenReserves).toBe((1n<<64n)-1n);
  expect(p.tokenProgram).toEqual(TOKEN_PROGRAM);
  expect(p.feeRecipient).toEqual(mint);
 });
 it.each(['curve-owner','missing-mint','mint-owner','uninitialized-mint'])('rejects %s rather than defaulting token program',async failure=>{
  const account=Buffer.from(fixture.layout.account_hex,'hex'),mint=PublicKey.unique();
  const mintData=Buffer.alloc(82);mintData[45]=failure==='uninitialized-mint'?0:1;
  const {PUMPFUN_PROGRAM,TOKEN_PROGRAM}=await import('../constants');
  const connection={getAccountInfo:async(key:PublicKey)=>key.equals(mint)?failure==='missing-mint'?null:{owner:failure==='mint-owner'?PublicKey.default:TOKEN_PROGRAM,data:mintData}:{owner:failure==='curve-owner'?PublicKey.default:PUMPFUN_PROGRAM,data:account}};
  await expect(PumpFunParams.fromMintByRpc(connection as any,mint)).rejects.toThrow();
 });
 it('uses active sharing vault and Global recipient in the cold loader',async()=>{
  const account=Buffer.from(fixture.layout.account_hex,'hex'),mint=PublicKey.unique();
  const mintData=Buffer.alloc(82);mintData[45]=1;
  const {PUMPFUN_PROGRAM,TOKEN_PROGRAM}=await import('../constants');
  const {PUMPFUN_GLOBAL_ACCOUNT,PUMPFUN_FEE_PROGRAM,getPumpFunFeeSharingConfigPda,getCreatorVaultPda}=await import('../instruction/pumpfun_builder');
  const global=Buffer.alloc(73);Buffer.from([167,232,232,177,200,108,114,127]).copy(global);mint.toBuffer().copy(global,41);
  const sharing=Buffer.alloc(43);Buffer.from([216,74,9,0,56,140,93,75]).copy(sharing);sharing[10]=1;mint.toBuffer().copy(sharing,11);
  const config=getPumpFunFeeSharingConfigPda(mint);
  const connection={getAccountInfo:async(key:PublicKey)=>key.equals(config)?{owner:PUMPFUN_FEE_PROGRAM,data:sharing}:key.equals(PUMPFUN_GLOBAL_ACCOUNT)?{owner:PUMPFUN_PROGRAM,data:global}:key.equals(mint)?{owner:TOKEN_PROGRAM,data:mintData}:{owner:PUMPFUN_PROGRAM,data:account}};
  const p=await PumpFunParams.fromMintByRpc(connection as any,mint);
  expect(p.feeRecipient).toEqual(mint);
  expect(p.creatorVault).toEqual(getCreatorVaultPda(config));
  expect(p.feeSharingCreatorVaultIfActive).toEqual(p.creatorVault);
  expect(p.observedTradeCreator).toBeUndefined();
 });
 it.each(['missing','owner','discriminator','short'])('rejects invalid Global %s',async failure=>{
  const account=Buffer.from(fixture.layout.account_hex,'hex'),mint=PublicKey.unique();
  const mintData=Buffer.alloc(82);mintData[45]=1;
  const {PUMPFUN_PROGRAM,TOKEN_PROGRAM}=await import('../constants');
  const {PUMPFUN_GLOBAL_ACCOUNT,getPumpFunFeeSharingConfigPda}=await import('../instruction/pumpfun_builder');
  const global=Buffer.alloc(failure==='short'?72:73);Buffer.from([167,232,232,177,200,108,114,127]).copy(global);
  if(failure==='discriminator')global[0]^=1;
  const connection={getAccountInfo:async(key:PublicKey)=>key.equals(getPumpFunFeeSharingConfigPda(mint))?null:key.equals(PUMPFUN_GLOBAL_ACCOUNT)?failure==='missing'?null:{owner:failure==='owner'?PublicKey.default:PUMPFUN_PROGRAM,data:global}:key.equals(mint)?{owner:TOKEN_PROGRAM,data:mintData}:{owner:PUMPFUN_PROGRAM,data:account}};
  await expect(PumpFunParams.fromMintByRpc(connection as any,mint)).rejects.toThrow();
 });
});
