/** Current-state CPMM exact-in quote and direct instruction. No RPC. */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
import { calculateTokenTransferFee, type TokenTransferFee } from "./stonkfun";
export const CACHED_CPMM_PROGRAM = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
);
export const CACHED_CPMM_AUTHORITY = new PublicKey(
  "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL",
);
export interface CachedCpmmState {
  pool: PublicKey;
  config: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  observation: PublicKey;
  baseReserve: bigint;
  quoteReserve: bigint;
  tradeFeeRate: bigint;
  protocolFeeRate: bigint;
  fundFeeRate: bigint;
  creatorFeeRate: bigint;
  creatorFeeOn: number;
  enableCreatorFee: boolean;
  baseTransferFee: TokenTransferFee;
  quoteTransferFee: TokenTransferFee;
  openTime: bigint;
}
export interface CpmmQuote {
  amountIn: bigint;
  amountOut: bigint;
  minimumAmountOut: bigint;
  tradeFee: bigint;
  creatorFee: bigint;
}
function unsigned(n: bigint) {
  if (typeof n !== "bigint" || n < 0n || n >= 1n << 64n)
    throw new Error("Value outside u64");
  return n;
}
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
export function quoteCachedCpmmExactIn(
  p: CachedCpmmState,
  amount: bigint,
  baseIn: boolean,
  slippageBps = 0,
): CpmmQuote {
  unsigned(amount);
  if (!amount || typeof baseIn !== "boolean")
    throw new Error("Positive amount and boolean direction required");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 9999)
    throw new Error("Slippage must be 0..9999");
  if (typeof p.enableCreatorFee !== "boolean")
    throw new Error("Invalid CPMM fee configuration");
  const rawCreatorRate = unsigned(p.creatorFeeRate),
    creatorRate = p.enableCreatorFee ? rawCreatorRate : 0n,
    tradeRate = unsigned(p.tradeFeeRate);
  if (
    tradeRate + creatorRate >= 1000000n ||
    unsigned(p.protocolFeeRate) + unsigned(p.fundFeeRate) > 1000000n ||
    ![0, 1, 2].includes(p.creatorFeeOn)
  )
    throw new Error("Invalid CPMM fee configuration");
  const [i, o, inputFee, outputFee] = baseIn
    ? [p.baseReserve, p.quoteReserve, p.baseTransferFee, p.quoteTransferFee]
    : [p.quoteReserve, p.baseReserve, p.quoteTransferFee, p.baseTransferFee];
  if (!unsigned(i) || !unsigned(o)) throw new Error("Empty CPMM reserves");
  const net = amount - calculateTokenTransferFee(amount, inputFee),
    onInput =
      p.creatorFeeOn === 0 ||
      (p.creatorFeeOn === 1 && baseIn) ||
      (p.creatorFeeOn === 2 && !baseIn);
  const totalRate = tradeRate + (onInput ? creatorRate : 0n),
    fee = ceil(net * totalRate, 1000000n);
  let creator = onInput && totalRate ? (fee * creatorRate) / totalRate : 0n;
  const trade = fee - creator,
    swapped = (o * (net - fee)) / (i + net - fee);
  if (!onInput) creator = ceil(swapped * creatorRate, 1000000n);
  const gross = swapped - (onInput ? 0n : creator),
    received = gross - calculateTokenTransferFee(gross, outputFee);
  return {
    amountIn: amount,
    amountOut: unsigned(received),
    minimumAmountOut: (received * BigInt(10000 - slippageBps)) / 10000n,
    tradeFee: trade,
    creatorFee: creator,
  };
}
export function buildCachedCpmmExactIn(
  p: CachedCpmmState,
  payer: PublicKey,
  amount: bigint,
  minimumAmountOut: bigint,
  baseIn: boolean,
): TransactionInstruction {
  unsigned(amount);
  unsigned(minimumAmountOut);
  if (!amount || typeof baseIn !== "boolean")
    throw new Error("Positive amount and boolean direction required");
  const [im, om, iv, ov, ip, op] = baseIn
    ? [
        p.baseMint,
        p.quoteMint,
        p.baseVault,
        p.quoteVault,
        p.baseTokenProgram,
        p.quoteTokenProgram,
      ]
    : [
        p.quoteMint,
        p.baseMint,
        p.quoteVault,
        p.baseVault,
        p.quoteTokenProgram,
        p.baseTokenProgram,
      ];
  const keys = [
    payer,
    CACHED_CPMM_AUTHORITY,
    p.config,
    p.pool,
    getAssociatedTokenAddressSync(im, payer, true, ip),
    getAssociatedTokenAddressSync(om, payer, true, op),
    iv,
    ov,
    ip,
    op,
    im,
    om,
    p.observation,
  ];
  const data = Buffer.alloc(24);
  Buffer.from([143, 190, 90, 218, 196, 30, 51, 222]).copy(data);
  data.writeBigUInt64LE(amount, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);
  return new TransactionInstruction({
    programId: CACHED_CPMM_PROGRAM,
    data,
    keys: keys.map((pubkey, i) => ({
      pubkey,
      isSigner: i === 0,
      isWritable: [0, 3, 4, 5, 6, 7, 12].includes(i),
    })),
  });
}
