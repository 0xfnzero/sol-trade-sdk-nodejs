/** Native stock-quoted LaunchLab instructions and current constant-product quotes. */
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
export const STONKFUN_PROGRAM = new PublicKey(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
);
const AUTHORITY = new PublicKey("WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh");
const EVENT_AUTHORITY = new PublicKey(
  "2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr",
);
const CONFIGS = new Set([
  "4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7",
  "6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt",
]);
const U64 = (1n << 64n) - 1n,
  U128 = (1n << 128n) - 1n;
function unsigned(value: bigint, max = U64) {
  if (typeof value !== "bigint" || value < 0n || value > max)
    throw new Error("Amount outside unsigned integer range");
  return value;
}
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
export interface TokenTransferFee {
  basisPoints: number;
  maximumFee: bigint;
}
export function calculateTokenTransferFee(
  amount: bigint,
  fee: TokenTransferFee,
  inverse = false,
): bigint {
  unsigned(amount);
  unsigned(fee.maximumFee);
  if (typeof inverse !== "boolean")
    throw new Error("Boolean transfer fee direction required");
  if (
    !Number.isInteger(fee.basisPoints) ||
    fee.basisPoints < 0 ||
    fee.basisPoints > 10000
  )
    throw new Error("Invalid token fee basis points");
  if (!fee.basisPoints || !amount) return 0n;
  const rate = BigInt(fee.basisPoints);
  const value = inverse
    ? rate === 10000n
      ? fee.maximumFee
      : ceil(amount * rate, 10000n - rate)
    : ceil(amount * rate, 10000n);
  return value < fee.maximumFee ? value : fee.maximumFee;
}
export interface LaunchLabQuoteState {
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  totalBaseSell: bigint;
  curveType: number;
  tradeFeeRate: bigint;
  platformFeeRate: bigint;
  creatorFeeRate: bigint;
  baseTransferFee: TokenTransferFee;
  quoteTransferFee: TokenTransferFee;
}
export interface LaunchLabQuote {
  amountIn: bigint;
  minimumAmountOut: bigint;
}
function reserves(p: LaunchLabQuoteState, share: bigint, bps: number) {
  if (p.curveType !== 0) throw new Error("Unsupported LaunchLab curve type");
  for (const n of [
    p.virtualBase,
    p.virtualQuote,
    p.realBase,
    p.realQuote,
    p.totalBaseSell,
  ])
    unsigned(n, U128);
  if (p.realBase > p.virtualBase)
    throw new Error("LaunchLab reserve underflow");
  const base = p.virtualBase - p.realBase,
    quote = unsigned(p.virtualQuote + p.realQuote, U128);
  const rate =
    unsigned(p.tradeFeeRate) +
    unsigned(p.platformFeeRate) +
    unsigned(p.creatorFeeRate) +
    unsigned(share);
  if (rate > 1000000n) throw new Error("LaunchLab fee exceeds denominator");
  if (!Number.isInteger(bps) || bps < 0 || bps > 9999)
    throw new Error("Slippage must be 0..9999");
  return { base, quote, rate, bps: BigInt(bps) };
}
export function quoteLaunchLabExactIn(
  p: LaunchLabQuoteState,
  amount: bigint,
  buy: boolean,
  slippageBps = 0,
  shareFeeRate = 0n,
): LaunchLabQuote {
  unsigned(amount);
  if (!amount) throw new Error("Amount cannot be zero");
  if (typeof buy !== "boolean")
    throw new Error("Boolean trade direction required");
  const { base, quote, rate, bps } = reserves(p, shareFeeRate, slippageBps);
  let actual = amount,
    received: bigint;
  if (buy) {
    const vault =
        amount - calculateTokenTransferFee(amount, p.quoteTransferFee),
      net = vault - ceil(vault * rate, 1000000n);
    const denominator = unsigned(quote + net, U128);
    if (!denominator) throw new Error("Empty curve reserves");
    let out = unsigned(net * base, U128) / denominator;
    if (p.totalBaseSell) {
      if (p.realBase > p.totalBaseSell)
        throw new Error("LaunchLab sold amount exceeds cap");
      const remaining = p.totalBaseSell - p.realBase;
      if (out > remaining) {
        const after = base - remaining;
        if (after <= 0n || rate === 1000000n)
          throw new Error("LaunchLab graduation exhausts reserves");
        const required = ceil(unsigned(quote * remaining, U128), after),
          requiredVault = unsigned(
            ceil(unsigned(required * 1000000n, U128), 1000000n - rate),
          );
        actual = unsigned(
          requiredVault +
            calculateTokenTransferFee(requiredVault, p.quoteTransferFee, true),
        );
        if (actual > amount) actual = amount;
        out = remaining;
      }
    }
    unsigned(out);
    received = out - calculateTokenTransferFee(out, p.baseTransferFee);
  } else {
    const net = amount - calculateTokenTransferFee(amount, p.baseTransferFee),
      denominator = unsigned(base + net, U128);
    if (!denominator) throw new Error("Empty curve reserves");
    const gross = unsigned(net * quote, U128) / denominator,
      vault = unsigned(gross - ceil(gross * rate, 1000000n));
    received = vault - calculateTokenTransferFee(vault, p.quoteTransferFee);
  }
  return {
    amountIn: actual,
    minimumAmountOut: unsigned(received - (received * bps) / 10000n),
  };
}
export interface StonkFunCurveAccounts {
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  platformAssociatedAccount: PublicKey;
  creatorAssociatedAccount: PublicKey;
}
/** One swap only. Funding/ATA creation and SOL wrapping are explicit caller operations. */
export function buildStonkFunCurveExactIn(
  p: StonkFunCurveAccounts,
  payer: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  buy: boolean,
  shareFeeRate = 0n,
): TransactionInstruction {
  if (!CONFIGS.has(p.platformConfig.toBase58()))
    throw new Error("Unverified StonkFun platform config");
  return buildLaunchLabCurveExactIn(
    p,
    payer,
    amountIn,
    minimumAmountOut,
    buy,
    shareFeeRate,
  );
}
/** Generic LaunchLab instruction; StonkFun callers use the strict wrapper above. */
export function buildLaunchLabCurveExactIn(
  p: StonkFunCurveAccounts,
  payer: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint,
  buy: boolean,
  shareFeeRate = 0n,
): TransactionInstruction {
  unsigned(amountIn);
  unsigned(minimumAmountOut);
  unsigned(shareFeeRate);
  if (!amountIn) throw new Error("Amount cannot be zero");
  if (typeof buy !== "boolean")
    throw new Error("Boolean trade direction required");
  if (p.baseMint.equals(p.quoteMint))
    throw new Error("Identical base and quote");
  for (const key of Object.values(p))
    if (key.equals(PublicKey.default))
      throw new Error("Missing StonkFun account");
  const userBase = getAssociatedTokenAddressSync(
      p.baseMint,
      payer,
      true,
      p.baseTokenProgram,
    ),
    userQuote = getAssociatedTokenAddressSync(
      p.quoteMint,
      payer,
      true,
      p.quoteTokenProgram,
    );
  const keys = [
    payer,
    AUTHORITY,
    p.globalConfig,
    p.platformConfig,
    p.pool,
    userBase,
    userQuote,
    p.baseVault,
    p.quoteVault,
    p.baseMint,
    p.quoteMint,
    p.baseTokenProgram,
    p.quoteTokenProgram,
    EVENT_AUTHORITY,
    STONKFUN_PROGRAM,
    SystemProgram.programId,
    p.platformAssociatedAccount,
    p.creatorAssociatedAccount,
  ];
  const data = Buffer.alloc(32);
  Buffer.from(
    buy
      ? [250, 234, 13, 123, 213, 156, 19, 236]
      : [149, 39, 222, 155, 211, 124, 152, 26],
  ).copy(data);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  data.writeBigUInt64LE(shareFeeRate, 24);
  return new TransactionInstruction({
    programId: STONKFUN_PROGRAM,
    data,
    keys: keys.map((pubkey, i) => ({
      pubkey,
      isSigner: i === 0,
      isWritable: [0, 4, 5, 6, 7, 8, 16, 17].includes(i),
    })),
  });
}
export interface LaunchLabAccountBytes {
  pubkey: PublicKey;
  owner: PublicKey;
  data: Uint8Array;
}
/** Identity and current fees from subscription bytes; mint fees are caller epoch state. */
export function decodeStonkFunCurve(
  pool: LaunchLabAccountBytes,
  global: LaunchLabAccountBytes,
  platform: LaunchLabAccountBytes,
  baseTokenProgram: PublicKey,
  quoteTokenProgram: PublicKey,
  baseTransferFee: TokenTransferFee,
  quoteTransferFee: TokenTransferFee,
): { accounts: StonkFunCurveAccounts; state: LaunchLabQuoteState } {
  if (!CONFIGS.has(platform.pubkey.toBase58()))
    throw new Error("LaunchLab config identity mismatch");
  return decodeLaunchLabCurve(
    pool,
    global,
    platform,
    baseTokenProgram,
    quoteTokenProgram,
    baseTransferFee,
    quoteTransferFee,
  );
}
/** Generic LaunchLab state, validated against the pool's actual config accounts. */
export function decodeLaunchLabCurve(
  pool: LaunchLabAccountBytes,
  global: LaunchLabAccountBytes,
  platform: LaunchLabAccountBytes,
  baseTokenProgram: PublicKey,
  quoteTokenProgram: PublicKey,
  baseTransferFee: TokenTransferFee,
  quoteTransferFee: TokenTransferFee,
): { accounts: StonkFunCurveAccounts; state: LaunchLabQuoteState } {
  for (const a of [pool, global, platform])
    if (!a.owner.equals(STONKFUN_PROGRAM))
      throw new Error("Unexpected LaunchLab account owner");
  const d = Buffer.from(pool.data),
    g = Buffer.from(global.data),
    p = Buffer.from(platform.data);
  if (
    d.length < 429 ||
    d.subarray(0, 8).toString("hex") !== "f7ede3f5d7c3de46" ||
    g.length < 35 ||
    g.subarray(0, 8).toString("hex") !== "95089ccaa0fcb0d9" ||
    p.length < 728 ||
    p.subarray(0, 8).toString("hex") !== "a04e8000f853e6a0"
  )
    throw new Error("Invalid LaunchLab state bytes");
  const key = (o: number) => new PublicKey(d.subarray(o, o + 32));
  if (!key(141).equals(global.pubkey) || !key(173).equals(platform.pubkey))
    throw new Error("LaunchLab config identity mismatch");
  if (d[17] !== 0) throw new Error("LaunchLab curve is not trading");
  const quote = key(237),
    creator = key(333),
    associated = (k: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [k.toBuffer(), quote.toBuffer()],
        STONKFUN_PROGRAM,
      )[0];
  return {
    accounts: {
      pool: pool.pubkey,
      baseMint: key(205),
      quoteMint: quote,
      baseVault: key(269),
      quoteVault: key(301),
      globalConfig: global.pubkey,
      platformConfig: platform.pubkey,
      baseTokenProgram,
      quoteTokenProgram,
      platformAssociatedAccount: associated(platform.pubkey),
      creatorAssociatedAccount: associated(creator),
    },
    state: {
      virtualBase: d.readBigUInt64LE(37),
      virtualQuote: d.readBigUInt64LE(45),
      realBase: d.readBigUInt64LE(53),
      realQuote: d.readBigUInt64LE(61),
      totalBaseSell: d.readBigUInt64LE(29),
      curveType: g[16]!,
      tradeFeeRate: g.readBigUInt64LE(27),
      platformFeeRate: p.readBigUInt64LE(104),
      creatorFeeRate: p.readBigUInt64LE(720),
      baseTransferFee,
      quoteTransferFee,
    },
  };
}
