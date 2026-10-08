/** Offline literal and SPL PDA-seed resolution. Missing context fails closed.
 * Refresh the mint and TLV list per transfer; cached routes remain unchanged. */
import { AccountMeta, PublicKey } from '@solana/web3.js';
const TOKEN22 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const EXECUTE = Buffer.from([105, 37, 101, 197, 75, 251, 102, 26]);
export function resolveHookAccounts(
  hook: PublicKey, mint: PublicKey, mintOwner: PublicKey, mintData: Buffer,
  meta: PublicKey, metaOwner: PublicKey, metaData: Buffer, executeAccounts: readonly PublicKey[],
  context: {executeData?: Buffer; accountData?: ReadonlyMap<string, Buffer>} = {},
): AccountMeta[] {
  const fail = (message: string): never => { throw new Error(message); };
  if (!mintOwner.equals(TOKEN22) || mintData.length < 166 || mintData[165] !== 1 || mintData[45] !== 1) fail('Invalid Token-2022 mint');
  if (context.executeData && (context.executeData.length !== 16 || !context.executeData.subarray(0,8).equals(EXECUTE))) fail('Invalid Execute instruction data');
  let active: PublicKey | undefined;
  for (let offset = 166; offset + 4 <= mintData.length;) {
    const kind = mintData.readUInt16LE(offset);
    // SPL treats Uninitialized as the end of used TLV data.
    if (kind === 0) break;
    const length = mintData.readUInt16LE(offset + 2), end = offset + 4 + length;
    if (end > mintData.length) fail('Truncated mint extension');
    if (kind === 14) {
      if (active || length !== 64) fail('Invalid Hook extension');
      active = new PublicKey(mintData.subarray(offset + 36, end));
    }
    offset = end;
  }
  if (!active?.equals(hook) || hook.equals(PublicKey.default)) fail('Active Hook program mismatch');
  const expected = PublicKey.findProgramAddressSync([Buffer.from('extra-account-metas'), mint.toBuffer()], hook)[0];
  if (!meta.equals(expected) || !metaOwner.equals(hook)) fail('Invalid Hook validation account');
  if (executeAccounts.length !== 5 || !executeAccounts[1]!.equals(mint) || !executeAccounts[4]!.equals(meta)) fail('Invalid Execute account order');
  if (metaData.length < 16 || !metaData.subarray(0, 8).equals(EXECUTE)) fail('Invalid Execute TLV');
  const count = metaData.readUInt32LE(12);
  if (metaData.readUInt32LE(8) !== 4 + 35 * count || metaData.length !== 16 + 35 * count) fail('Invalid Execute TLV length');
  const resolved: AccountMeta[] = [], keys = [...executeAccounts];
  for (let i = 0; i < count; i++) {
    const item = metaData.subarray(16 + 35 * i, 51 + 35 * i), config = item.subarray(1, 33);
    if (item[33] !== 0 || item[34]! > 1) fail('Unsupported signer or invalid flags');
    let pubkey: PublicKey;
    if (item[0] === 0) pubkey = new PublicKey(config);
    else if (item[0] === 2) {
      if (config[0] === 1) {
        const start=config[1]!, data=context.executeData;
        if (config.subarray(2).some(x=>x!==0) || !data || start+32>data.length) fail('Invalid instruction PubkeyData');
        pubkey=new PublicKey(data!.subarray(start,start+32));
      } else if (config[0] === 2) {
        const index=config[1]!,start=config[2]!;
        if(config.subarray(3).some(x=>x!==0) || index>=keys.length) fail('Invalid account PubkeyData');
        const data=context.accountData?.get(keys[index]!.toBase58());
        if(!data || start+32>data.length) fail('Missing or invalid PubkeyData snapshot');
        pubkey=new PublicKey(data!.subarray(start,start+32));
      } else return fail('Invalid PubkeyData configuration');
    }
    else if (item[0] === 1 || item[0]! >= 128) {
      let program = hook;
      if (item[0]! >= 128) {const index = item[0]! - 128; if (index >= keys.length) fail('Invalid external Hook PDA program index'); program=keys[index]!;}
      const seeds: Buffer[] = []; let offset = 0;
      while (offset < 32 && config[offset]) {
        const kind=config[offset];
        if (kind===1) {if(offset+1>=32 || config[offset+1]!>32 || offset+2+config[offset+1]!>32) fail('Invalid literal Hook PDA seed');const length=config[offset+1]!;seeds.push(config.subarray(offset+2,offset+2+length));offset+=2+length;}
        else if (kind===2) {if(offset+2>=32) fail('Truncated instruction Hook PDA seed');const start=config[offset+1]!,length=config[offset+2]!,data=context.executeData;if(length>32 || !data || start+length>data.length) fail('Missing or invalid Execute seed data');seeds.push(data!.subarray(start,start+length));offset+=3;}
        else if (kind===3) {if(offset+1>=32 || config[offset+1]!>=keys.length) fail('Invalid account-key Hook PDA seed');seeds.push(keys[config[offset+1]!]!.toBuffer());offset+=2;}
        else if (kind===4) {if(offset+3>=32 || config[offset+1]!>=keys.length) fail('Invalid account-data Hook PDA seed');const start=config[offset+2]!,length=config[offset+3]!,data=context.accountData?.get(keys[config[offset+1]!]!.toBase58());if(length>32 || !data || start+length>data.length) fail('Missing or invalid account seed data');seeds.push(data!.subarray(start,start+length));offset+=4;}
        else fail('Unsupported Hook PDA seed');
      }
      if (config.subarray(offset).some(x => x !== 0) || seeds.length > 15) fail('Invalid Hook PDA seed padding/count');
      pubkey = PublicKey.findProgramAddressSync(seeds, program)[0];
    } else return fail('Unsupported Hook account configuration');
    const duplicate = resolved.filter(m => m.pubkey.equals(pubkey));
    const isWritable = !!item[34] && !executeAccounts.some(k => k.equals(pubkey)) && (!duplicate.length || duplicate.some(m => m.isWritable));
    resolved.push({pubkey, isSigner: false, isWritable}); keys.push(pubkey);
  }
  return [...resolved, {pubkey: hook, isSigner: false, isWritable: false}, {pubkey: meta, isSigner: false, isWritable: false}];
}
