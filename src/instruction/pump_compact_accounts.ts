import { PublicKey } from "@solana/web3.js";
import type { PumpUpgradeAccounts } from "./pump_upgrade";
export const COMPACT_PUMP_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);
export const COMPACT_AMM_PROGRAM = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
);
const FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"),
  ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const normalizeQuote = (mint: PublicKey): PublicKey =>
  mint.equals(PublicKey.default) ||
  mint.equals(new PublicKey("So11111111111111111111111111111111111111111"))
    ? WSOL
    : mint;
const normalizeHop = <
  T extends { quoteMint: PublicKey; quoteTokenProgram: PublicKey },
>(
  hop: T,
): T => {
  const quoteMint = normalizeQuote(hop.quoteMint);
  return {
    ...hop,
    quoteMint,
    quoteTokenProgram: quoteMint.equals(WSOL)
      ? new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
      : hop.quoteTokenProgram,
  };
};
const pda = (program: PublicKey, seed: string, key?: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from(seed), ...(key ? [key.toBuffer()] : [])],
    program,
  )[0];
const ata = (owner: PublicKey, mint: PublicKey, token: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), token.toBuffer(), mint.toBuffer()],
    ATA,
  )[0];
export interface PumpCompactAccountParams {
  user: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  buybackRecipient: PublicKey;
  cashback?: boolean;
  complete?: boolean;
}
/** Derives the 17 Pump roles. Token accounts must exist before execution; SOL uses native lamports. */
export function derivePumpV3Accounts(
  p: PumpCompactAccountParams,
): PumpUpgradeAccounts {
  p = normalizeHop(p);
  if (p.cashback) throw new Error("Cashback coins require Pump v2");
  if (p.complete) throw new Error("BondingCurveComplete");
  const program = COMPACT_PUMP_PROGRAM,
    curve = pda(program, "bonding-curve", p.baseMint);
  return {
    global: pda(program, "global"),
    base_mint: p.baseMint,
    quote_mint: p.quoteMint,
    base_token_program: p.baseTokenProgram,
    quote_token_program: p.quoteTokenProgram,
    bonding_curve: curve,
    associated_base_bonding_curve: ata(curve, p.baseMint, p.baseTokenProgram),
    associated_quote_bonding_curve: ata(
      curve,
      p.quoteMint,
      p.quoteTokenProgram,
    ),
    user: p.user,
    associated_base_user: ata(p.user, p.baseMint, p.baseTokenProgram),
    associated_quote_user: ata(p.user, p.quoteMint, p.quoteTokenProgram),
    user_volume_accumulator: pda(program, "user_volume_accumulator", p.user),
    fee_config: pda(FEES, "fee_config", program),
    buyback_fee_recipient: p.quoteMint.equals(WSOL)
      ? p.buybackRecipient
      : ata(p.buybackRecipient, p.quoteMint, p.quoteTokenProgram),
    system_program: PublicKey.default,
    event_authority: pda(program, "__event_authority"),
    program,
  };
}
/** AMM vaults are taken from the decoded pool, including non-ATA vaults. */
export function derivePumpSwapV2Accounts(
  p: PumpCompactAccountParams & {
    pool: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
  },
): PumpUpgradeAccounts {
  p = normalizeHop(p);
  if (p.cashback) throw new Error("Cashback pools require PumpSwap v1");
  const program = COMPACT_AMM_PROGRAM;
  return {
    pool: p.pool,
    user: p.user,
    global_config: pda(program, "global_config"),
    base_mint: p.baseMint,
    quote_mint: p.quoteMint,
    user_base_token_account: ata(p.user, p.baseMint, p.baseTokenProgram),
    user_quote_token_account: ata(p.user, p.quoteMint, p.quoteTokenProgram),
    pool_base_token_account: p.baseVault,
    pool_quote_token_account: p.quoteVault,
    base_token_program: p.baseTokenProgram,
    quote_token_program: p.quoteTokenProgram,
    system_program: PublicKey.default,
    user_volume_accumulator: pda(program, "user_volume_accumulator", p.user),
    fee_config: pda(FEES, "fee_config", program),
    buyback_fee_recipient: ata(
      p.buybackRecipient,
      p.quoteMint,
      p.quoteTokenProgram,
    ),
    event_authority: pda(program, "__event_authority"),
    program,
  };
}

export interface PumpMultiHop {
  venue: "curve" | "pool";
  baseMint: PublicKey;
  quoteMint: PublicKey;
  address: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  mayhem: boolean;
  cashback: boolean;
  complete?: boolean;
  index?: number;
  creator?: PublicKey;
}
/** Validates decoded state and derives bare route accounts. Four hops require v0 + ALT. */
export function derivePumpMultiHopAccounts(
  user: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  buybackRecipient: PublicKey,
  hops: readonly PumpMultiHop[],
  useV0WithAlt = false,
): {
  accounts: PumpUpgradeAccounts;
  remaining: import("@solana/web3.js").AccountMeta[];
} {
  if (!hops.length || (hops.length >= 4 && !useV0WithAlt))
    throw new Error(
      "Route requires hops and v0 with ALT for four or more hops",
    );
  inputMint = normalizeQuote(inputMint);
  outputMint = normalizeQuote(outputMint);
  hops = hops.map(normalizeHop);
  let current = inputMint,
    side: boolean | undefined;
  const remaining: import("@solana/web3.js").AccountMeta[] = [];
  hops.forEach((h, i) => {
    if (h.mayhem || h.baseMint.equals(h.quoteMint))
      throw new Error("Invalid multi-hop venue");
    const buy = current.equals(h.quoteMint);
    if (!buy && !current.equals(h.baseMint))
      throw new Error("Discontinuous route");
    if (side !== undefined && side !== buy)
      throw new Error("Mixed route direction");
    side = buy;
    if (h.cashback && i !== (buy ? 0 : hops.length - 1))
      throw new Error("Cashback must be at currency endpoint");
    if (h.venue === "curve") {
      const curve = pda(COMPACT_PUMP_PROGRAM, "bonding-curve", h.baseMint);
      if (
        h.complete ||
        !curve.equals(h.address) ||
        !ata(curve, h.baseMint, h.baseTokenProgram).equals(h.baseVault) ||
        !ata(curve, h.quoteMint, h.quoteTokenProgram).equals(h.quoteVault)
      )
        throw new Error("Invalid curve accounts");
    } else {
      const authority = pda(COMPACT_PUMP_PROGRAM, "pool-authority", h.baseMint);
      const pool = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pool"),
          Buffer.from([0, 0]),
          authority.toBuffer(),
          h.baseMint.toBuffer(),
          h.quoteMint.toBuffer(),
        ],
        COMPACT_AMM_PROGRAM,
      )[0];
      if (
        h.index !== 0 ||
        !h.creator?.equals(authority) ||
        !pool.equals(h.address)
      )
        throw new Error("Noncanonical Pump pool");
    }
    [h.baseMint, h.quoteMint, h.address, h.baseVault, h.quoteVault].forEach(
      (pubkey, j) =>
        remaining.push({ pubkey, isWritable: j >= 2, isSigner: false }),
    );
    current = buy ? h.baseMint : h.quoteMint;
  });
  if (!current.equals(outputMint)) throw new Error("Wrong output mint");
  const first = hops[0]!,
    last = hops[hops.length - 1]!,
    currency = side ? first : last;
  const inputToken = side ? first.quoteTokenProgram : first.baseTokenProgram,
    outputToken = side ? last.baseTokenProgram : last.quoteTokenProgram;
  const program = COMPACT_AMM_PROGRAM;
  return {
    accounts: {
      user,
      user_in_token_account: ata(user, inputMint, inputToken),
      user_out_token_account: ata(user, outputMint, outputToken),
      global_config: pda(program, "global_config"),
      fee_config: pda(FEES, "fee_config", program),
      user_volume_accumulator: pda(program, "user_volume_accumulator", user),
      buyback_fee_recipient: ata(
        buybackRecipient,
        currency.quoteMint,
        currency.quoteTokenProgram,
      ),
      token_program: new PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      ),
      token_2022_program: new PublicKey(
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      ),
      system_program: PublicKey.default,
      event_authority: pda(program, "__event_authority"),
      program,
      pump_program: COMPACT_PUMP_PROGRAM,
      pump_global: pda(COMPACT_PUMP_PROGRAM, "global"),
      pump_fee_config: pda(FEES, "fee_config", COMPACT_PUMP_PROGRAM),
      pump_event_authority: pda(COMPACT_PUMP_PROGRAM, "__event_authority"),
    },
    remaining,
  };
}

/** Additional create_v2 roles for an unlisted Pump coin quote; state is fetched by caller. */
export function derivePumpCoinQuoteCreateAccounts(
  newMint: PublicKey,
  quote: PumpMultiHop,
  depth: number,
  maxDepth: number,
  listedQuoteMints: readonly PublicKey[],
): import("@solana/web3.js").AccountMeta[] {
  quote = normalizeHop(quote);
  if (
    !Number.isInteger(depth) ||
    !Number.isInteger(maxDepth) ||
    depth < 0 ||
    depth >= maxDepth
  )
    throw new Error("CurveDepthExceeded");
  const supported = [
    WSOL,
    new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    ...listedQuoteMints,
  ];
  if (depth === 0 && !supported.some((m) => m.equals(quote.quoteMint)))
    throw new Error("QuoteBondingCurveNotEligible");
  derivePumpMultiHopAccounts(
    newMint,
    quote.quoteMint,
    quote.baseMint,
    newMint,
    [quote],
  );
  const curve = pda(COMPACT_PUMP_PROGRAM, "bonding-curve", newMint);
  const keys = [
    quote.baseMint,
    ata(curve, quote.baseMint, quote.baseTokenProgram),
    quote.baseTokenProgram,
    pda(COMPACT_PUMP_PROGRAM, "quote-control"),
    pda(COMPACT_PUMP_PROGRAM, "bonding-curve", quote.baseMint),
  ];
  if (quote.venue === "pool")
    keys.push(quote.address, quote.baseVault, quote.quoteVault);
  return keys.map((pubkey, i) => ({
    pubkey,
    isSigner: false,
    isWritable: i === 1,
  }));
}
