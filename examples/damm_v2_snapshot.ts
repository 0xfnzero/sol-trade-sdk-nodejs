/** npx tsx examples/damm_v2_snapshot.ts snapshot.json [--simulate].
 * Historical reconstruction: WSOL input uses the legacy SOL-funding helper.
 * Use cached_damm_v2.ts for explicit SOL/WSOL endpoints.
 * Frozen state -> caller's explicit swap2 threshold -> unsigned V1. No autoquote/send.
 */
import {readFileSync} from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {SubscriptionAccountCache,PoolTradeHint} from '../src/trading/subscription_cache';
import {buildMeteoraDammV2BuyInstructions} from '../src/instruction/meteora_damm_v2_builder';
import {compileV1Message} from '../src/serialization/v1';
export function build(v:any):Buffer {
 const cache=new SubscriptionAccountCache();
 for(const a of v.accounts)cache.update(new PublicKey(a.pubkey),{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),slot:BigInt(a.slot),writeVersion:BigInt(a.write_version)});
 if(v.legs.length!==1)throw Error('One independent DAMM v2 swap required');
 const leg=v.legs[0],hint=new PoolTradeHint(new PublicKey(leg.pool),new PublicKey(leg.input_mint),new PublicKey(leg.output_mint));
 const state=cache.snapshot().dammV2(hint,{slot:BigInt(v.read_slot),epoch:BigInt(v.epoch),maximumSlotAge:BigInt(v.maximum_slot_age)},BigInt(v.unix_timestamp));
 if(state.transferFees.some(f=>f.basisPoints!==0&&f.maximumFee!==0n))throw Error('Nonzero transfer-fee thresholds are not verified by this example');
 const minimum=BigInt(v.fixed_output_amount);if(minimum<=0n||minimum>=1n<<64n)throw Error('Explicit positive u64 minimum required');
 const p=state.pool,payer=new PublicKey(v.payer);
 const instructions=buildMeteoraDammV2BuyInstructions({payer,inputMint:hint.inputMint,outputMint:hint.outputMint,inputAmount:BigInt(v.amount),fixedOutputAmount:minimum,createInputMintAta:true,createOutputMintAta:true,protocolParams:{pool:hint.pool,tokenAMint:p.tokenAMint,tokenBMint:p.tokenBMint,tokenAVault:p.tokenAVault,tokenBVault:p.tokenBVault,tokenAProgram:state.tokenAProgram,tokenBProgram:state.tokenBProgram,swapMode:0,includeRateLimiterSysvar:p.poolFees.baseFee.feeSchedulerMode===2}});
 const message=compileV1Message(payer,instructions,v.recent_blockhash,{computeUnitLimit:300000,loadedAccountsDataSizeLimit:64*1024*1024});
 return Buffer.concat([message.message,Buffer.alloc(64*message.requiredSignatures)]);
}
async function main(){
 if(!process.argv[2])throw Error('Provide frozen snapshot JSON');
 const wire=build(JSON.parse(readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify({transaction:wire.toString('base64'),wire_bytes:wire.length}));
 if(process.argv.includes('--simulate')){
  const r=await fetch(process.env.RPC_URL??'https://api.mainnet-beta.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[wire.toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:true,innerInstructions:true,commitment:'confirmed'}]})});if(!r.ok)throw Error(`HTTP ${r.status}`);const response:any=await r.json();console.log(JSON.stringify(response));if(response.error||response.result.value.err!==null)throw Error('Simulation failed');
 }
}
if(import.meta.url.endsWith(process.argv[1]?.split('/').at(-1)??''))main().catch(e=>{console.error(e);process.exitCode=1});
