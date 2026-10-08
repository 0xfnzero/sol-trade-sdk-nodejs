/** Offline literal / AccountKey-seed resolution. Other encodings fail closed.
 * Refresh the mint and TLV list per transfer; cached routes remain unchanged. */
import { AccountMeta, PublicKey } from '@solana/web3.js';
const TOKEN22 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const EXECUTE = Buffer.from([105, 37, 101, 197, 75, 251, 102, 26]);
export function resolveHookAccounts(
  hook: PublicKey, mint: PublicKey, mintOwner: PublicKey, mintData: Buffer,
  meta: PublicKey, metaOwner: PublicKey, metaData: Buffer, executeAccounts: readonly PublicKey[],
): AccountMeta[] {
  const fail = (message: string): never => { throw new Error(message); };
  if (!mintOwner.equals(TOKEN22) || mintData.length < 166 || mintData[165] !== 1 || mintData[45] !== 1) fail('Invalid Token-2022 mint');
  let active: PublicKey | undefined;
  for (let offset = 166; offset + 4 <= mintData.length;) {
    const kind = mintData.readUInt16LE(offset), length = mintData.readUInt16LE(offset + 2), end = offset + 4 + length;
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
    else if (item[0] === 1) {
      const seeds: Buffer[] = []; let offset = 0;
      while (offset < 32 && config[offset]) {
        if (config[offset] !== 3 || offset + 1 >= 32 || config[offset + 1]! >= keys.length) fail('Unsupported or invalid Hook PDA seed');
        seeds.push(keys[config[offset + 1]!]!.toBuffer()); offset += 2;
      }
      if (config.subarray(offset).some(x => x !== 0) || seeds.length > 15) fail('Invalid Hook PDA seed padding/count');
      pubkey = PublicKey.findProgramAddressSync(seeds, hook)[0];
    } else return fail('Unsupported Hook account configuration');
    const duplicate = resolved.filter(m => m.pubkey.equals(pubkey));
    const isWritable = !!item[34] && !executeAccounts.some(k => k.equals(pubkey)) && (!duplicate.length || duplicate.some(m => m.isWritable));
    resolved.push({pubkey, isSigner: false, isWritable}); keys.push(pubkey);
  }
  return [...resolved, {pubkey: hook, isSigner: false, isWritable: false}, {pubkey: meta, isSigner: false, isWritable: false}];
}
