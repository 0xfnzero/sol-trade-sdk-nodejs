/** AMM v4 V2 current-state exact-in preparation from a frozen cache. No RPC. */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type {
  AccountCacheSnapshot,
  PoolTradeHint,
  CacheReadContext,
} from "./subscription_cache";
import { TOKEN_PROGRAM } from "../constants";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
import { tokenTransferFeeForEpoch } from "../instruction/token_mint_state";
export const CACHED_AMM_V4_PROGRAM = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
);
export const CACHED_AMM_V4_AUTHORITY = new PublicKey(
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
);
export interface CachedAmmV4State {
  pool: PublicKey;
  coinMint: PublicKey;
  pcMint: PublicKey;
  coinVault: PublicKey;
  pcVault: PublicKey;
  coinReserve: bigint;
  pcReserve: bigint;
  swapFeeNumerator: bigint;
  swapFeeDenominator: bigint;
}
export interface AmmV4Quote {
  amountIn: bigint;
  amountOut: bigint;
  minimumAmountOut: bigint;
  swapFee: bigint;
}
function unsigned(n: bigint) {
  if (typeof n !== "bigint" || n < 0n || n >= 1n << 64n)
    throw Error("AMM v4 value must be u64");
  return n;
}
export function cachedAmmV4(
  snapshot: AccountCacheSnapshot,
  hint: PoolTradeHint,
  ctx: CacheReadContext,
  unixTimestamp: bigint,
): CachedAmmV4State {
  unsigned(unixTimestamp);
  const d = Buffer.from(
    snapshot.get(hint.pool, ctx, CACHED_AMM_V4_PROGRAM).data,
  );
  if (d.length !== 752) throw Error("Invalid AMM v4 pool length");
  const num = (o: number) => d.readBigUInt64LE(o),
    key = (o: number) => new PublicKey(d.subarray(o, o + 32)),
    status = num(0),
    nonce = num(8);
  if (
    ![1n, 6n, 7n].includes(status) ||
    (status === 7n && unixTimestamp < num(224))
  )
    throw Error("AMM v4 swap is disabled or not open");
  if (
    nonce > 255n ||
    !PublicKey.createProgramAddressSync(
      [Buffer.from("amm authority"), Buffer.from([Number(nonce)])],
      CACHED_AMM_V4_PROGRAM,
    ).equals(CACHED_AMM_V4_AUTHORITY)
  )
    throw Error("AMM v4 authority nonce mismatch");
  hint.matches(key(400), key(432));
  if (key(336).equals(key(368))) throw Error("AMM v4 vaults collide");
  const numerator = num(176),
    denominator = num(184);
  if (!denominator || numerator >= denominator)
    throw Error("Invalid AMM v4 swap fee");
  const reserves: bigint[] = [];
  for (const [vo, mo, po, deco] of [
    [336, 400, 192, 32],
    [368, 432, 200, 40],
  ]) {
    const mint = snapshot.get(key(mo!), ctx, TOKEN_PROGRAM);
    tokenTransferFeeForEpoch(Buffer.from(mint.data), mint.owner, ctx.epoch);
    if (BigInt(mint.data[44]!) !== num(deco!))
      throw Error("AMM v4 mint decimals mismatch");
    const v = Buffer.from(snapshot.get(key(vo!), ctx, TOKEN_PROGRAM).data);
    if (
      v.length !== 165 ||
      !v.subarray(0, 32).equals(key(mo!).toBuffer()) ||
      !v.subarray(32, 64).equals(CACHED_AMM_V4_AUTHORITY.toBuffer()) ||
      v[108] !== 1
    )
      throw Error("Invalid AMM v4 vault identity or state");
    const amount = v.readBigUInt64LE(64);
    if (num(po!) >= amount) throw Error("AMM v4 PnL exhausts vault balance");
    reserves.push(amount - num(po!));
  }
  return {
    pool: hint.pool,
    coinMint: key(400),
    pcMint: key(432),
    coinVault: key(336),
    pcVault: key(368),
    coinReserve: reserves[0]!,
    pcReserve: reserves[1]!,
    swapFeeNumerator: numerator,
    swapFeeDenominator: denominator,
  };
}
export function quoteCachedAmmV4ExactIn(
  p: CachedAmmV4State,
  amount: bigint,
  coinIn: boolean,
  slippageBps = 0,
): AmmV4Quote {
  unsigned(amount);
  if (
    !amount ||
    typeof coinIn !== "boolean" ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000
  )
    throw Error("Invalid AMM v4 quote request");
  const [i, o] = coinIn
    ? [p.coinReserve, p.pcReserve]
    : [p.pcReserve, p.coinReserve];
  if (
    !unsigned(i) ||
    !unsigned(o) ||
    !unsigned(p.swapFeeDenominator) ||
    unsigned(p.swapFeeNumerator) >= p.swapFeeDenominator
  )
    throw Error("Invalid AMM v4 reserves or fee");
  const fee =
      (amount * p.swapFeeNumerator + p.swapFeeDenominator - 1n) /
      p.swapFeeDenominator,
    net = amount - fee,
    out = (o * net) / (i + net);
  return {
    amountIn: amount,
    amountOut: out,
    minimumAmountOut: (out * BigInt(10000 - slippageBps)) / 10000n,
    swapFee: fee,
  };
}
export function prepareCachedAmmV4(
  snapshot: AccountCacheSnapshot,
  hint: PoolTradeHint,
  ctx: CacheReadContext,
  unixTimestamp: bigint,
  payer: PublicKey,
  amount: bigint,
  slippageBps = 0,
) {
  const state = cachedAmmV4(snapshot, hint, ctx, unixTimestamp),
    quote = quoteCachedAmmV4ExactIn(
      state,
      amount,
      hint.inputMint.equals(state.coinMint),
      slippageBps,
    );
  if (!quote.minimumAmountOut)
    throw Error("AMM v4 quote has zero protected output");
  const keys = [
      TOKEN_PROGRAM,
      state.pool,
      CACHED_AMM_V4_AUTHORITY,
      state.coinVault,
      state.pcVault,
      getAssociatedTokenAddressSync(hint.inputMint, payer, true, TOKEN_PROGRAM),
      getAssociatedTokenAddressSync(
        hint.outputMint,
        payer,
        true,
        TOKEN_PROGRAM,
      ),
      payer,
    ],
    data = Buffer.alloc(17);
  data[0] = 16;
  data.writeBigUInt64LE(quote.amountIn, 1);
  data.writeBigUInt64LE(quote.minimumAmountOut, 9);
  return {
    state,
    quote,
    instruction: new TransactionInstruction({
      programId: CACHED_AMM_V4_PROGRAM,
      data,
      keys: keys.map((pubkey, i) => ({
        pubkey,
        isSigner: i === 7,
        isWritable: [1, 3, 4, 5, 6].includes(i),
      })),
    }),
  };
}
