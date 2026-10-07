import {
  PublicKey,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
import type { PumpUpgradeAccounts } from "./pump_upgrade";
export interface PumpCreateV2Params {
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  mayhem?: boolean;
  creatorFeeBps?: bigint;
  holderReward?: boolean;
}
/** Remaining quote roles: mint, new curve quote ATA, token program, quote-control,
 * quote curve; add canonical pool and two vaults after migration. Requires mint/user signatures. */
export function buildPumpCreateV2Instruction(
  accounts: PumpUpgradeAccounts,
  p: PumpCreateV2Params,
  remaining: readonly AccountMeta[] = [],
): TransactionInstruction {
  if (
    ![0, 3, 4, 5, 8].includes(remaining.length) ||
    remaining.some((a, i) => a.isSigner || a.isWritable !== (i === 1))
  )
    throw new Error("Invalid quote creation accounts");
  if (remaining.length >= 5 && p.mayhem)
    throw new Error("Mayhem pump coin quote not allowed");
  const fee = p.creatorFeeBps ?? 0n;
  if (fee < 0n || fee > 10000n) throw new Error("Invalid creator fee");
  const strings = [p.name, p.symbol, p.uri].map((s) => {
    const b = Buffer.from(s, "utf8"),
      n = Buffer.alloc(4);
    n.writeUInt32LE(b.length);
    return Buffer.concat([n, b]);
  });
  const tail = Buffer.alloc(11);
  tail[0] = p.mayhem ? 1 : 0;
  tail[1] = 0;
  tail.writeBigUInt64LE(fee, 2);
  tail[10] = p.holderReward ? 1 : 0;
  const keys = [
    { name: "mint", writable: true, signer: true },
    { name: "mint_authority", writable: false, signer: false },
    { name: "bonding_curve", writable: true, signer: false },
    { name: "associated_bonding_curve", writable: true, signer: false },
    { name: "global", writable: false, signer: false },
    { name: "user", writable: true, signer: true },
    { name: "system_program", writable: false, signer: false },
    { name: "token_program", writable: false, signer: false },
    { name: "associated_token_program", writable: false, signer: false },
    { name: "mayhem_program_id", writable: true, signer: false },
    { name: "global_params", writable: false, signer: false },
    { name: "sol_vault", writable: true, signer: false },
    { name: "mayhem_state", writable: true, signer: false },
    { name: "mayhem_token_vault", writable: true, signer: false },
    { name: "event_authority", writable: false, signer: false },
    { name: "program", writable: false, signer: false },
  ].map((a) => {
    const key = accounts[a.name];
    if (!(key instanceof PublicKey))
      throw new Error("Missing account: " + a.name);
    return { pubkey: key, isWritable: a.writable, isSigner: a.signer };
  });
  return new TransactionInstruction({
    programId: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
    keys: [...keys, ...remaining],
    data: Buffer.concat([
      Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]),
      ...strings,
      p.creator.toBuffer(),
      tail,
    ]),
  });
}

export interface PumpQuoteControl {
  admin: PublicKey;
  reservesAdmin: PublicKey;
  mints: { mint: PublicKey; initialVirtualQuoteReserves: bigint }[];
}
/** Decodes the current QuoteControl header (admin, reserves_admin, reserved[32]). */
export function decodePumpQuoteControl(data: Uint8Array): PumpQuoteControl {
  const b = Buffer.from(data);
  if (
    b.length < 108 ||
    !b
      .subarray(0, 8)
      .equals(Buffer.from([56, 244, 35, 238, 193, 213, 162, 201]))
  )
    throw new Error("Invalid QuoteControl");
  const count = b.readUInt32LE(104);
  if (count > Math.floor((b.length - 108) / 40))
    throw new Error("Truncated QuoteControl");
  return {
    admin: new PublicKey(b.subarray(8, 40)),
    reservesAdmin: new PublicKey(b.subarray(40, 72)),
    mints: Array.from({ length: count }, (_, i) => ({
      mint: new PublicKey(b.subarray(108 + i * 40, 140 + i * 40)),
      initialVirtualQuoteReserves: b.readBigUInt64LE(140 + i * 40),
    })),
  };
}
