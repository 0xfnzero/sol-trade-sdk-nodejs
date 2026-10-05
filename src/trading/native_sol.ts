/** Explicit SOL endpoint settlement through a fresh temporary WSOL account.
 * Rent comes from cold initialization; use a unique seed per transaction.
 * Existing WSOL ATAs are never funded or closed; plain WSOL routes skip this helper.
 */
import { createHash } from "node:crypto";
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import type { PreparedCachedRoute } from "./cached_route";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  WSOL_MINT,
} from "../common/spl-token";
export interface NativeSolRoute {
  instructions: readonly TransactionInstruction[];
  temporaryWsolAccount: PublicKey;
  requiredLamports: bigint;
  minimumNetAmountOut: bigint;
}
export function settleCachedRouteWithNativeSol(
  route: PreparedCachedRoute,
  payer: PublicKey,
  seed: string,
  rentLamports: bigint,
  nativeInput = false,
  nativeOutput = false,
): NativeSolRoute {
  if (
    typeof nativeInput !== "boolean" ||
    typeof nativeOutput !== "boolean" ||
    nativeInput === nativeOutput
  )
    throw Error("Choose exactly one native SOL endpoint");
  if (route.legs.length < 1 || route.legs.length > 5 || route.swapInstructions.length !== route.legs.length)
    throw Error("Invalid native SOL route instructions");
  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i]!, ix = route.swapInstructions[i]!, quoted = leg.instruction;
    if (!ix.programId.equals(quoted.programId) || !Buffer.from(ix.data).equals(Buffer.from(quoted.data)) ||
        ix.keys.length !== quoted.keys.length || ix.keys.some((a,j) => {
          const b = quoted.keys[j]!;
          return !a.pubkey.equals(b.pubkey) || a.isSigner !== b.isSigner || a.isWritable !== b.isWritable;
        })) throw Error("Native SOL instruction differs from quoted leg");
    for (const amount of [leg.amountIn, leg.minimumNetAmountOut])
      if (typeof amount !== "bigint" || amount <= 0n || amount >= 1n << 64n)
        throw Error("Invalid native SOL amount or protection");
    if (i > 0 && (!route.legs[i-1]!.hint.outputMint.equals(leg.hint.inputMint) ||
        leg.amountIn > route.legs[i-1]!.minimumNetAmountOut))
      throw Error("Native SOL route exceeds protected intermediate credit");
  }
  if (route.minimumNetAmountOut !== route.legs[route.legs.length-1]!.minimumNetAmountOut)
    throw Error("Native SOL protection differs from quoted leg");
  const mint = nativeInput
    ? route.legs[0]!.hint.inputMint
    : route.legs[route.legs.length - 1]!.hint.outputMint;
  if (!mint.equals(WSOL_MINT))
    throw Error("Native SOL endpoint must quote through WSOL");
  if (
    typeof seed !== "string" ||
    Buffer.from(seed, "utf8").toString("utf8") !== seed ||
    Buffer.byteLength(seed, "utf8") < 1 ||
    Buffer.byteLength(seed, "utf8") > 32
  )
    throw Error("Temporary WSOL seed must contain 1..32 UTF-8 bytes");
  if (
    typeof rentLamports !== "bigint" ||
    rentLamports <= 0n ||
    rentLamports >= 1n << 64n
  )
    throw Error("Supply current token-account rent from cold initialization");
  const funding = nativeInput ? route.legs[0]!.amountIn : 0n,
    required = rentLamports + funding;
  if (required >= 1n << 64n) throw Error("Native SOL lamports overflow");
  const encodedSeed = Buffer.from(seed),
    temporary = new PublicKey(
      createHash("sha256")
        .update(
          Buffer.concat([
            payer.toBuffer(),
            encodedSeed,
            TOKEN_PROGRAM_ID.toBuffer(),
          ]),
        )
        .digest(),
    ),
    old = getAssociatedTokenAddressSync(
      WSOL_MINT,
      payer,
      true,
      TOKEN_PROGRAM_ID,
    );
  if (temporary.equals(old))
    throw Error("Temporary account collides with existing WSOL ATA");
  const d = Buffer.alloc(4 + 32 + 8 + encodedSeed.length + 8 + 8 + 32);
  d.writeUInt32LE(3);
  payer.toBuffer().copy(d, 4);
  d.writeBigUInt64LE(BigInt(encodedSeed.length), 36);
  encodedSeed.copy(d, 44);
  let o = 44 + encodedSeed.length;
  d.writeBigUInt64LE(required, o);
  o += 8;
  d.writeBigUInt64LE(165n, o);
  o += 8;
  TOKEN_PROGRAM_ID.toBuffer().copy(d, o);
  const create = new TransactionInstruction({
      programId: SystemProgram.programId,
      data: d,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: temporary, isSigner: false, isWritable: true },
      ],
    }),
    initialize = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      data: Buffer.concat([Buffer.from([18]), payer.toBuffer()]),
      keys: [
        { pubkey: temporary, isSigner: false, isWritable: true },
        { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
      ],
    }),
    sync = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      data: Buffer.from([17]),
      keys: [{ pubkey: temporary, isSigner: false, isWritable: true }],
    });
  const setup = route.setupInstructions.filter(
    (ix) =>
      !(
        ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) &&
        ix.keys[1]?.pubkey.equals(old)
      ),
  );
  let replaced = false;
  const swaps = route.swapInstructions.map((ix) => {
    if (!ix.keys.some((a) => a.pubkey.equals(payer) && a.isSigner))
      throw Error("Native SOL route belongs to a different wallet");
    const keys = ix.keys.map((a) => {
      if (!a.pubkey.equals(old)) return { ...a };
      replaced = true;
      return { ...a, pubkey: temporary };
    });
    return new TransactionInstruction({
      programId: ix.programId,
      data: Buffer.from(ix.data),
      keys,
    });
  });
  if (!replaced)
    throw Error("Native SOL route does not use the wallet WSOL account");
  const close = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    data: Buffer.from([9]),
    keys: [
      { pubkey: temporary, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
    ],
  });
  return {
    instructions: [create, initialize, sync, ...setup, ...swaps, close],
    temporaryWsolAccount: temporary,
    requiredLamports: required,
    minimumNetAmountOut: route.minimumNetAmountOut,
  };
}
