/** Official PumpSwap multi_hop_swap for Pump.fun curves and migrated pools.
 * Run with --help. RPC is example bootstrap only; SDK derivation/build is offline.
 */
import {parseArgs} from 'node:util';
import {writeFileSync} from 'node:fs';
import {Connection, PublicKey, SystemProgram} from '@solana/web3.js';
import {decodeBondingCurveAccount} from '../src/common/bonding_curve';
import {TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync as ata,
  createAssociatedTokenAccountIdempotentInstruction as createAta, createSyncNativeInstruction} from '../src/common/spl-token';
import {decodePoolAccount, PUMPSWAP_PROGRAM as AMM} from '../src/instruction/pumpswap';
import {type PumpMultiHop} from '../src/instruction/pump_compact_accounts';
import {selectPumpRoute, PumpRouteExecution} from '../src/instruction/pump_route';
import {compileV1Message} from '../src/serialization/v1';
import {validateSimulationResponse} from './_simulation';
const PUMP=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL=new PublicKey('So11111111111111111111111111111111111111112');
const pda=(program:PublicKey,...seeds:Buffer[])=>PublicKey.findProgramAddressSync(seeds,program)[0];
const curveAddress=(mint:PublicKey)=>pda(PUMP,Buffer.from('bonding-curve'),mint.toBuffer());
const poolAddress=(base:PublicKey,quote:PublicKey)=>pda(AMM,Buffer.from('pool'),Buffer.from([0,0]),pda(PUMP,Buffer.from('pool-authority'),base.toBuffer()).toBuffer(),base.toBuffer(),quote.toBuffer());
function requireValue(v:string|undefined,name:string):string {if(!v)throw Error(`Missing --${name}`);return v;}
async function main() {
 const {values:v}=parseArgs({options:{venue:{type:'string'},path:{type:'string'},side:{type:'string'},user:{type:'string'},amount:{type:'string'},'min-out':{type:'string'},simulate:{type:'boolean'},report:{type:'string'},help:{type:'boolean'}}});
 if(v.help||process.argv.length===2){console.log(`Official Pump multi_hop_swap (2 or 3 hops, one swap instruction).
npx tsx examples/pump_multi_hop.ts --venue pumpfun|pumpswap --path SOL,INTERMEDIATE,TARGET --side buy|sell --user PUBKEY --amount RAW --min-out RAW [--simulate] [--report NEW_FILE]
Path is always in buy order; sell reverses it. Venue selects the TARGET's current venue.
Positive raw integer amounts; provide a fresh minimum quote. Reads SOLANA_RPC_URL.
Build by default, optional unsigned simulation, funded user required. No signing or broadcast.
SOL wraps only for a pool currency hop. Pool sells leave WSOL; curve sells pay native SOL.`);return;}
 const path=requireValue(v.path,'path').split(',').map(s=>s==='SOL'||s==='WSOL'?WSOL:new PublicKey(s));
 if(path.length<3||path.length>4||new Set(path.map(String)).size!==path.length)throw Error('Provide 2 or 3 hops without repeated mints');
 if(!['pumpfun','pumpswap'].includes(requireValue(v.venue,'venue'))||!['buy','sell'].includes(requireValue(v.side,'side')))throw Error('Invalid venue or side');
 const integer=(value:string|undefined,name:string)=>{const text=requireValue(value,name);if(!/^[0-9]+$/.test(text))throw Error(`Invalid --${name}`);const n=BigInt(text);if(n<1n||n>=1n<<64n)throw Error(`${name} outside positive u64`);return n;};
 const amount=integer(v.amount,'amount'),minOut=integer(v['min-out'],'min-out'),user=new PublicKey(requireValue(v.user,'user'));
 const endpoint=process.env.SOLANA_RPC_URL??'https://api.mainnet-beta.solana.com',rpc=new Connection(endpoint,'confirmed');
 const global=pda(AMM,Buffer.from('global_config'));
 const keys=[...path,...path.slice(1).flatMap((base,i)=>[curveAddress(base),poolAddress(base,path[i]!)]),global];
 const batch=await rpc.getMultipleAccountsInfoAndContext(keys,{commitment:'confirmed'});
 const accounts=new Map(keys.map((k,i)=>[k.toBase58(),batch.value[i]!]));
 const get=(key:PublicKey)=>{const a=accounts.get(key.toBase58());if(!a)throw Error(`Missing account ${key}`);return a;};
 const programs=path.map(m=>{
  const a=get(m),d=a.data;
  if(![TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID].some(p=>p.equals(a.owner))||d.length<82||d[45]!==1||d.readUInt32LE(0)>1||d.readUInt32LE(46)>1)throw Error(`Invalid mint ${m}`);
  return a.owner;
 });
 const g=get(global);
 if(!g.owner.equals(AMM)||g.data.length<899||!g.data.subarray(0,8).equals(Buffer.from([149,8,156,202,160,252,176,217])))throw Error('Invalid GlobalConfig');
 const recipient=Array.from({length:8},(_,i)=>new PublicKey(g.data.subarray(643+i*32,675+i*32))).find(k=>!k.equals(PublicKey.default));
 if(!recipient)throw Error('No current buyback recipient');
 const hops:PumpMultiHop[]=path.slice(1).map((base,i)=>{
  const quote=path[i]!,address=curveAddress(base),a=accounts.get(address.toBase58());
  const curve=a?decodeBondingCurveAccount(a.data,address):null;
  if(a&&(!a.owner.equals(PUMP)||!curve))throw Error(`Invalid curve ${address}`);
  const common={baseMint:base,quoteMint:quote,baseTokenProgram:programs[i+1]!,quoteTokenProgram:programs[i]!};
  if(curve&&!curve.complete){
   if(!curve.effectiveQuoteMint().equals(quote))throw Error('Curve quote mismatch');
   return {...common,venue:'curve',address,baseVault:ata(base,address,true,programs[i+1]),quoteVault:ata(quote,address,true,programs[i]),mayhem:curve.isMayhemMode,cashback:curve.isCashbackCoin,complete:false};
  }
  const pool=poolAddress(base,quote),aPool=get(pool),p=decodePoolAccount(aPool.data);
  if(!aPool.owner.equals(AMM)||!p||!p.baseMint.equals(base)||!p.quoteMint.equals(quote))throw Error('Invalid canonical pool');
  return {...common,venue:'pool',address:pool,baseVault:p.poolBaseTokenAccount,quoteVault:p.poolQuoteTokenAccount,mayhem:p.isMayhemMode,cashback:p.isCashbackCoin,complete:true,index:p.index,creator:p.creator};
 });
 const currency=hops[0]!,target=hops[hops.length-1]!;
 if(target.venue!==(v.venue==='pumpfun'?'curve':'pool'))throw Error('Target venue changed; refresh path/venue');
 const sell=v.side==='sell',input=sell?target.baseMint:currency.quoteMint,output=sell?currency.quoteMint:target.baseMint;
 const inputProgram=sell?target.baseTokenProgram:currency.quoteTokenProgram,outputProgram=sell?currency.quoteTokenProgram:target.baseTokenProgram;
 const inputAta=ata(input,user,true,inputProgram);
 const instructions=[createAta(user,ata(input,user,true,inputProgram),user,input,inputProgram),createAta(user,ata(output,user,true,outputProgram),user,output,outputProgram),createAta(user,ata(currency.quoteMint,recipient,true,currency.quoteTokenProgram),recipient,currency.quoteMint,currency.quoteTokenProgram)];
 if(!sell&&input.equals(WSOL)&&currency.venue==='pool')instructions.push(SystemProgram.transfer({fromPubkey:user,toPubkey:inputAta,lamports:amount}),createSyncNativeInstruction(inputAta,TOKEN_PROGRAM_ID));
 instructions.push(selectPumpRoute({execution:PumpRouteExecution.Official,minimumOutputAmount:minOut,buybackRecipient:recipient},user,input,output,amount,sell?[...hops].reverse():hops)!);
 const block=await rpc.getLatestBlockhash('confirmed');
 const compiled=compileV1Message(user,instructions,block.blockhash,{computeUnitLimit:400000,loadedAccountsDataSizeLimit:64*1024*1024});
 const wire=Buffer.concat([Buffer.from(compiled.message),Buffer.alloc(64*compiled.requiredSignatures)]);
 if(wire.length>4096)throw Error('V1 transaction too large');
 const report:Record<string,unknown>={signed:false,broadcast:false,snapshot_slot:batch.context.slot,side:v.side,amount_in:amount.toString(),min_amount_out:minOut.toString(),message_version:1,route_in_buy_order:hops.map(h=>({venue:h.venue,address:String(h.address),base_mint:String(h.baseMint),quote_mint:String(h.quoteMint)})),wire:wire.toString('base64'),wire_bytes:wire.length};
 let simulationFailed=false;
 if(v.simulate){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[wire.toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:true,innerInstructions:true,commitment:'confirmed',minContextSlot:batch.context.slot}]})});
  if(!response.ok)throw Error(`Simulation HTTP ${response.status}`);
  const result:unknown=await response.json();report.response=result;
  simulationFailed=validateSimulationResponse(result)!==null;
 }
 if(v.report)writeFileSync(v.report,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(report));
 if(simulationFailed)throw Error('Simulation failed; inspect report logs');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
