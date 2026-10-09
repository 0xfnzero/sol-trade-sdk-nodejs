import {afterEach,expect,it,vi} from 'vitest';
import {AddressLookupTableAccount,Keypair,PublicKey,SystemProgram,VersionedTransaction} from '@solana/web3.js';
import nacl from 'tweetnacl';
import {TradingClient,TradeConfigBuilder,TradeType} from '../index';

afterEach(()=>vi.restoreAllMocks());
it.each([false,true])('signed V0 resolves ALT recipient and nonce roles with nonce=%s without reads',async nonce=>{
 const payer=Keypair.generate(),recipient=Keypair.generate().publicKey,nonceAccount=Keypair.generate().publicKey;
 const hash=Keypair.generate().publicKey.toBase58();
 const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:BigInt('18446744073709551615'),lastExtendedSlot:1,lastExtendedSlotStartIndex:0,authority:undefined,addresses:[recipient,nonceAccount,payer.publicKey]}});
 const client=new TradingClient(payer,TradeConfigBuilder.create('http://localhost:1').build()) as any;
 const reads=vi.spyOn(client.connection,'getLatestBlockhash').mockImplementation(()=>{throw Error('read RPC forbidden');});
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('network forbidden');});
 const captured:Uint8Array[]=[];
 client.getSwqosClient=()=>({sendTransaction:async (_trade:any,raw:any,wait:boolean)=>{expect(wait).toBe(false);captured.push(new Uint8Array(raw));return 'captured';},getTipAccount:()=>'',minTipSol:()=>0});
 const ix=SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:recipient,lamports:7});
 const context={tradeType:TradeType.Buy,withTip:false,durableNonce:nonce?{nonceAccount,authority:payer.publicKey,nonceHash:hash,recentBlockhash:hash}:undefined};
 const result=await client.executeTransaction([ix],hash,table,false,false,context);
 expect(result.success, result.error?.message).toBe(true);expect(captured).toHaveLength(1);
 const tx=VersionedTransaction.deserialize(captured[0]!);expect(tx.version).toBe(0);
 const message=tx.message as any;expect(message.addressTableLookups).toHaveLength(1);
 expect(message.staticAccountKeys[0].equals(payer.publicKey)).toBe(true);
 const keys=message.getAccountKeys({addressLookupTableAccounts:[table]});
 expect(nacl.sign.detached.verify(message.serialize(),tx.signatures[0]!,payer.publicKey.toBytes())).toBe(true);
 const transfer=message.compiledInstructions.at(-1);expect(keys.get(transfer.accountKeyIndexes[1]).equals(recipient)).toBe(true);
 expect(Buffer.from(transfer.data).readBigUInt64LE(4)).toBe(7n);
 if(nonce){const advance=message.compiledInstructions[0];expect(Buffer.from(advance.data)).toEqual(Buffer.from([4,0,0,0]));expect(keys.get(advance.programIdIndex).equals(SystemProgram.programId)).toBe(true);expect(keys.get(advance.accountKeyIndexes[0]).equals(nonceAccount)).toBe(true);expect(keys.get(advance.accountKeyIndexes[2]).equals(payer.publicKey)).toBe(true);}
 const damaged=message.serialize().slice();damaged[damaged.length-1]^=1;expect(nacl.sign.detached.verify(damaged,tx.signatures[0]!,payer.publicKey.toBytes())).toBe(false);
 const additional=SystemProgram.transfer({fromPubkey:Keypair.generate().publicKey,toPubkey:recipient,lamports:1});
 const failed=await client.executeTransaction([additional],hash,table,false,false,context);expect(failed.success).toBe(false);expect(captured).toHaveLength(1);
 const invalidNonce=await client.executeTransaction([ix],hash,table,false,false,{...context,durableNonce:{nonceAccount,authority:Keypair.generate().publicKey,nonceHash:hash,recentBlockhash:hash}});expect(invalidNonce.success).toBe(false);expect(captured).toHaveLength(1);
 const missing=await client.executeTransaction([ix],undefined,table,false,false,{tradeType:TradeType.Buy,withTip:false});expect(missing.success).toBe(false);expect(captured).toHaveLength(1);
 expect(reads).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
});
