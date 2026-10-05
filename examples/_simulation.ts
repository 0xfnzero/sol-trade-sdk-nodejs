/** Explicit simulation only. Preserve original V1 wire for the parser adapter. */
import {writeFileSync} from 'node:fs';
export function validateSimulationResponse(response: unknown): unknown {
 if(!response||typeof response!=='object')throw Error('Simulation response missing execution result');
 const r=response as {error?:unknown,result?:{value?:{err?:unknown}}};
 if(r.error!==undefined&&r.error!==null)throw Error('Simulation RPC error');
 const value=r.result?.value;
 if(!value||typeof value!=='object'||!Object.hasOwn(value,'err'))throw Error('Simulation response missing execution result');
 return value.err;
}
export async function simulate(wire:Buffer,slot:bigint,output?:string):Promise<void>{
 // JSON-RPC minContextSlot is a JSON number; reject lossy conversion.
 if(slot<0n||slot>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Simulation slot cannot be represented exactly');
 const response=await fetch(process.env.RPC_URL??'https://api.mainnet-beta.solana.com',{
  method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[wire.toString('base64'),{
   encoding:'base64',sigVerify:false,replaceRecentBlockhash:true,innerInstructions:true,commitment:'confirmed',minContextSlot:Number(slot)}]})});
 if(!response.ok)throw Error(`Simulation HTTP ${response.status}`);
 const result:unknown=await response.json(),error=validateSimulationResponse(result);
 if(output)writeFileSync(output,JSON.stringify({wire:wire.toString('base64'),response:result},null,2)+'\n');
 console.log(JSON.stringify(result));
 if(error!==null)throw Error('Simulation failed; inspect saved logs');
}
export function simulationOutput(args:string[]):string|undefined{
 const i=args.indexOf('--simulation-out');
 if(i<0)return undefined;
 if(!args.includes('--simulate')||!args[i+1]||args[i+1]!.startsWith('--'))throw Error('--simulation-out requires --simulate and a path');
 return args[i+1];
}
