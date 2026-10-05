/** Current account configuration only; this is not a PumpFun quote or factory. */
import {PublicKey} from '@solana/web3.js';
import {PUMPFUN_PROGRAM_ID,PUMPFUN_GLOBAL_ACCOUNT,PUMPFUN_FEE_PROGRAM,getPumpFunFeeSharingConfigPda,getCreatorVaultPda} from '../instruction/pumpfun_builder';
import type {AccountCacheSnapshot,CacheReadContext} from './subscription_cache';

export function decodePumpFunGlobalFeeRecipient(data: Uint8Array): PublicKey {
 const d=Buffer.from(data);
 if(d.length<73||!d.subarray(0,8).equals(Buffer.from([167,232,232,177,200,108,114,127])))throw Error('Invalid PumpFun Global discriminator or size');
 return new PublicKey(d.subarray(41,73));
}

export function decodePumpFunSharingCreatorVault(data: Uint8Array,mint: PublicKey): PublicKey | undefined {
 const d=Buffer.from(data);
 if(d.length<43||!d.subarray(0,8).equals(Buffer.from([216,74,9,0,56,140,93,75])))throw Error('Invalid PumpFun SharingConfig discriminator or size');
 if(!d.subarray(11,43).equals(mint.toBuffer()))throw Error('PumpFun SharingConfig mint mismatch');
 return d[10]===1?getCreatorVaultPda(getPumpFunFeeSharingConfigPda(mint)):undefined;
}

/** Missing SharingConfig is unresolved, never implicitly interpreted as inactive. */
export function cachedPumpFunConfiguration(snapshot: AccountCacheSnapshot,mint: PublicKey,context: CacheReadContext) {
 if(mint.equals(PublicKey.default))throw Error('Missing PumpFun mint');
 const global=snapshot.get(PUMPFUN_GLOBAL_ACCOUNT,context,PUMPFUN_PROGRAM_ID);
 const feeRecipient=decodePumpFunGlobalFeeRecipient(global.data);
 if(feeRecipient.equals(PublicKey.default))throw Error('Missing PumpFun Global fee recipient');
 const sharingConfig=getPumpFunFeeSharingConfigPda(mint);
 const sharing=snapshot.get(sharingConfig,context,PUMPFUN_FEE_PROGRAM);
 const feeSharingCreatorVaultIfActive=decodePumpFunSharingCreatorVault(sharing.data,mint);
 snapshot.assertUsable();
 return {feeRecipient,sharingConfig,feeSharingCreatorVaultIfActive};
}
