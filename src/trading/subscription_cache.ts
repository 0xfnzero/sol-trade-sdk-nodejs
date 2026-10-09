import {cachedDammV2} from "./cached_damm_v2";
import {cachedPumpSwap,prepareCachedPumpSwap} from "./cached_pumpswap";
import type { SubscriptionReadiness } from "./subscription_readiness";
import { cachedAmmV4, prepareCachedAmmV4 } from "./cached_amm_v4";
import {
  CACHED_CPMM_PROGRAM,
  CACHED_CPMM_AUTHORITY,
  type CachedCpmmState,
  quoteCachedCpmmExactIn,
  buildCachedCpmmExactIn,
} from "../instruction/cached_cpmm";
/** Ordered subscription state. No RPC; use one cache per selected fork. */
import { PublicKey } from "@solana/web3.js";
import {
  STONKFUN_PROGRAM,
  decodeStonkFunCurve,
  decodeLaunchLabCurve,
  quoteLaunchLabExactIn,
  buildStonkFunCurveExactIn,
} from "../instruction/stonkfun";
import { tokenTransferFeeForEpoch } from "../instruction/token_mint_state";
import { prepareCachedClmm } from "./cached_clmm";
import { prepareCachedRoute } from "./cached_route";
import { prepareCachedWhirlpool } from "./cached_whirlpool";
import { prepareCachedDlmm } from "./cached_dlmm";
export interface CachedAccount {
  owner: PublicKey;
  data: Uint8Array;
  slot: bigint;
  writeVersion: bigint;
}
export interface CacheReadContext {
  slot: bigint;
  epoch: bigint;
  maximumSlotAge: bigint;
}
const protocols: Record<string, string> = {
  PumpFun: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  MeteoraDammV2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  PumpSwap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  LaunchLab: STONKFUN_PROGRAM.toBase58(),
  RaydiumCpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  RaydiumClmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  OrcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  MeteoraDlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  RaydiumAmmV4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
};
function u64(n: bigint) {
  if (typeof n !== "bigint" || n < 0n || n >= 1n << 64n)
    throw new Error("Value outside u64");
}
export interface ParserRouteIdentity {
  protocol: string;
  program: string;
  pool: string;
  input_mint: string | null;
  output_mint: string | null;
}
export class PoolTradeHint {
  constructor(
    readonly pool: PublicKey,
    readonly inputMint: PublicKey,
    readonly outputMint: PublicKey,
  ) {
    if (
      [pool, inputMint, outputMint].some((k) => k.equals(PublicKey.default)) ||
      inputMint.equals(outputMint)
    )
      throw new Error("Missing or identical pool/mint identity");
  }
  static fromRouteLeg(leg: ParserRouteIdentity): PoolTradeHint {
    if (protocols[leg.protocol] !== leg.program)
      throw new Error("Unsupported or mismatched route protocol");
    if (!leg.input_mint || !leg.output_mint)
      throw new Error("Route mints are unresolved");
    return new PoolTradeHint(
      new PublicKey(leg.pool),
      new PublicKey(leg.input_mint),
      new PublicKey(leg.output_mint),
    );
  }
  matches(base: PublicKey, quote: PublicKey) {
    if (
      base.equals(quote) ||
      !(
        (this.inputMint.equals(base) && this.outputMint.equals(quote)) ||
        (this.inputMint.equals(quote) && this.outputMint.equals(base))
      )
    )
      throw new Error("Route mint identity mismatch");
  }
}
const owned = (a: CachedAccount): CachedAccount => ({
  ...a,
  data: Buffer.from(a.data),
});
/** Frozen membership and owned bytes; get returns a copy to protect subsequent reads. */
export class AccountCacheSnapshot {
  dammV2(hint:PoolTradeHint,ctx:CacheReadContext,unixTimestamp:bigint){return cachedDammV2(this,hint,ctx,unixTimestamp)}
  preparePumpSwap(hint: PoolTradeHint, ctx: CacheReadContext, payer: PublicKey, amount: bigint, slippageBps=0) { return prepareCachedPumpSwap(this,hint,ctx,payer,amount,slippageBps); }
  pumpSwap(hint: PoolTradeHint, ctx: CacheReadContext) { return cachedPumpSwap(this,hint,ctx); }
  prepareDlmm(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    unixTimestamp: bigint,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 0,
    maximumArrays = 8,
  ) {
    return prepareCachedDlmm(
      this,
      hint,
      ctx,
      unixTimestamp,
      payer,
      amount,
      slippageBps,
      maximumArrays,
    );
  }
  prepareWhirlpool(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    unixTimestamp: bigint,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 0,
    maximumArrays = 6,
  ) {
    return prepareCachedWhirlpool(
      this,
      hint,
      ctx,
      unixTimestamp,
      payer,
      amount,
      slippageBps,
      maximumArrays,
    );
  }
  ammV4(hint: PoolTradeHint, ctx: CacheReadContext, unixTimestamp: bigint) {
    return cachedAmmV4(this, hint, ctx, unixTimestamp);
  }
  prepareAmmV4(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    unixTimestamp: bigint,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 0,
  ) {
    return prepareCachedAmmV4(
      this,
      hint,
      ctx,
      unixTimestamp,
      payer,
      amount,
      slippageBps,
    );
  }
  prepareRoute(
    hints: readonly PoolTradeHint[],
    ctx: CacheReadContext,
    unixTimestamp: bigint,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 100,
    maximumArrays = 8,
    allowPumpFunNativeSettlement = false,
  ) {
    return prepareCachedRoute(
      this,
      hints,
      ctx,
      unixTimestamp,
      payer,
      amount,
      slippageBps,
      maximumArrays,
      allowPumpFunNativeSettlement,
    );
  }
  prepareClmm(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    unixTimestamp: bigint,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 0,
    maximumArrays = 8,
  ) {
    return prepareCachedClmm(
      this,
      hint,
      ctx,
      unixTimestamp,
      payer,
      amount,
      slippageBps,
      maximumArrays,
    );
  }
  #accounts: Map<string, CachedAccount>;
  constructor(accounts: ReadonlyMap<string, CachedAccount>, private readonly continuityGuard?: () => void) {
    this.#accounts = new Map(
      [...accounts].map(([k, a]) => {
        u64(a.slot);
        u64(a.writeVersion);
        return [k, owned(a)];
      }),
    );
  }
  assertUsable(): void { this.continuityGuard?.(); }
  /** Observed zero-lamport tombstone is absent; an unobserved key still throws. */
  /** Includes explicit closed-account observations; unobserved keys still error. */
  getObservation(key: PublicKey, ctx: CacheReadContext): CachedAccount {
    this.assertUsable();
    for (const n of [ctx.slot, ctx.epoch, ctx.maximumSlotAge]) u64(n);
    const a = this.#accounts.get(key.toBase58());
    if (!a) throw Error('Missing cached account: ' + key.toBase58());
    if (a.slot > ctx.slot || ctx.slot - a.slot > ctx.maximumSlotAge) throw Error('Cached account is future or stale');
    return owned(a);
  }
  getOptional(key:PublicKey,ctx:CacheReadContext,expectedOwner?:PublicKey):CachedAccount|null {
    this.assertUsable();for(const n of [ctx.slot,ctx.epoch,ctx.maximumSlotAge])u64(n);
    const a=this.#accounts.get(key.toBase58());
    if(!a)throw Error('Missing cached account: '+key.toBase58());
    if(a.slot>ctx.slot||ctx.slot-a.slot>ctx.maximumSlotAge)throw Error('Cached account is future or stale');
    if(!a.data.length)return null;
    if(expectedOwner&&!a.owner.equals(expectedOwner))throw Error('Cached account owner mismatch');
    return owned(a);
  }
  get(
    key: PublicKey,
    ctx: CacheReadContext,
    expectedOwner?: PublicKey,
  ): CachedAccount {
    this.assertUsable();
    for (const n of [ctx.slot, ctx.epoch, ctx.maximumSlotAge]) u64(n);
    const a = this.#accounts.get(key.toBase58());
    if (!a) throw new Error("Missing cached account: " + key.toBase58());
    if (expectedOwner && !a.owner.equals(expectedOwner))
      throw new Error("Cached account owner mismatch");
    if (a.slot > ctx.slot || ctx.slot - a.slot > ctx.maximumSlotAge)
      throw new Error("Cached account is future or stale");
    if (!a.data.length) throw new Error("Cached account is closed");
    return owned(a);
  }
  stonkfunCurve(hint: PoolTradeHint, ctx: CacheReadContext) {
    return this.launchlabState(hint, ctx, true);
  }
  launchlabCurve(hint: PoolTradeHint, ctx: CacheReadContext) {
    return this.launchlabState(hint, ctx, false);
  }
  private launchlabState(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    strict: boolean,
  ) {
    const pool = this.get(hint.pool, ctx, STONKFUN_PROGRAM),
      d = Buffer.from(pool.data);
    if (
      d.length < 429 ||
      d.subarray(0, 8).toString("hex") !== "f7ede3f5d7c3de46"
    )
      throw new Error("Invalid cached LaunchLab pool");
    const key = (o: number) => new PublicKey(d.subarray(o, o + 32));
    hint.matches(key(205), key(237));
    const gk = key(141),
      pk = key(173),
      global = this.get(gk, ctx, STONKFUN_PROGRAM),
      platform = this.get(pk, ctx, STONKFUN_PROGRAM),
      base = this.get(key(205), ctx),
      quote = this.get(key(237), ctx);
    const result = (strict ? decodeStonkFunCurve : decodeLaunchLabCurve)(
      { pubkey: hint.pool, ...pool },
      { pubkey: gk, ...global },
      { pubkey: pk, ...platform },
      base.owner,
      quote.owner,
      tokenTransferFeeForEpoch(base.data, base.owner, ctx.epoch),
      tokenTransferFeeForEpoch(quote.data, quote.owner, ctx.epoch),
    );
    const s = result.state;
    if (
      s.curveType !== 0 ||
      s.tradeFeeRate + s.platformFeeRate + s.creatorFeeRate >= 1000000n
    )
      throw new Error("Invalid cached LaunchLab curve or fee configuration");
    return result;
  }
  cpmm(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    unixTimestamp: bigint,
  ): CachedCpmmState {
    u64(unixTimestamp);
    const pool = this.get(hint.pool, ctx, CACHED_CPMM_PROGRAM),
      d = Buffer.from(pool.data);
    if (
      d.length < 637 ||
      d.subarray(0, 8).toString("hex") !== "f7ede3f5d7c3de46" ||
      d[329]! & 4 ||
      ![0, 1].includes(d[390]!)
    )
      throw new Error("Invalid or disabled cached CPMM pool");
    const key = (o: number) => new PublicKey(d.subarray(o, o + 32)),
      number = (b: Buffer, o: number) => b.readBigUInt64LE(o);
    hint.matches(key(168), key(200));
    const openTime = number(d, 373);
    if (unixTimestamp < openTime) throw new Error("CPMM pool is not open");
    const f = Buffer.from(this.get(key(8), ctx, CACHED_CPMM_PROGRAM).data);
    if (
      f.length < 236 ||
      f.subarray(0, 8).toString("hex") !== "daf42168cbcb2b6f"
    )
      throw new Error("Invalid cached CPMM config");
    const tradeFeeRate = number(f, 12),
      protocolFeeRate = number(f, 20),
      fundFeeRate = number(f, 28),
      creatorFeeRate = number(f, 108),
      enableCreatorFee = d[390] === 1;
    if (
      tradeFeeRate + (enableCreatorFee ? creatorFeeRate : 0n) >= 1000000n ||
      protocolFeeRate + fundFeeRate > 1000000n ||
      d[389]! > 2
    )
      throw new Error("Invalid CPMM fee configuration");
    const reserve = (
      vault: PublicKey,
      mint: PublicKey,
      program: PublicKey,
      offsets: number[],
    ) => {
      const v = Buffer.from(this.get(vault, ctx, program).data);
      if (
        v.length < 165 ||
        !v.subarray(0, 32).equals(mint.toBuffer()) ||
        !v.subarray(32, 64).equals(CACHED_CPMM_AUTHORITY.toBuffer()) ||
        v[108] !== 1
      )
        throw new Error("Invalid cached CPMM vault");
      const n =
        number(v, 64) - offsets.reduce((sum, o) => sum + number(d, o), 0n);
      u64(n);
      return n;
    };
    const base = this.get(key(168), ctx, key(232)),
      quote = this.get(key(200), ctx, key(264));
    return {
      pool: hint.pool,
      config: key(8),
      baseMint: key(168),
      quoteMint: key(200),
      baseVault: key(72),
      quoteVault: key(104),
      baseTokenProgram: key(232),
      quoteTokenProgram: key(264),
      observation: key(296),
      baseReserve: reserve(key(72), key(168), key(232), [341, 357, 397]),
      quoteReserve: reserve(key(104), key(200), key(264), [349, 365, 405]),
      tradeFeeRate,
      protocolFeeRate,
      fundFeeRate,
      creatorFeeRate,
      creatorFeeOn: d[389]!,
      enableCreatorFee,
      baseTransferFee: tokenTransferFeeForEpoch(
        base.data,
        base.owner,
        ctx.epoch,
      ),
      quoteTransferFee: tokenTransferFeeForEpoch(
        quote.data,
        quote.owner,
        ctx.epoch,
      ),
      openTime,
    };
  }
  prepareCpmm(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    unixTimestamp: bigint,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 0,
  ) {
    const state = this.cpmm(hint, ctx, unixTimestamp),
      baseIn = hint.inputMint.equals(state.baseMint),
      quote = quoteCachedCpmmExactIn(state, amount, baseIn, slippageBps);
    if (!quote.minimumAmountOut)
      throw Error("CPMM quote has zero protected output");
    return {
      state,
      quote,
      instruction: buildCachedCpmmExactIn(
        state,
        payer,
        quote.amountIn,
        quote.minimumAmountOut,
        baseIn,
      ),
    };
  }
  prepareStonkFunCurve(
    hint: PoolTradeHint,
    ctx: CacheReadContext,
    payer: PublicKey,
    amount: bigint,
    slippageBps = 0,
  ) {
    const { accounts, state } = this.stonkfunCurve(hint, ctx),
      buy = hint.inputMint.equals(accounts.quoteMint),
      quote = quoteLaunchLabExactIn(state, amount, buy, slippageBps);
    return {
      accounts,
      quote,
      instruction: buildStonkFunCurveExactIn(
        accounts,
        payer,
        quote.amountIn,
        quote.minimumAmountOut,
        buy,
      ),
    };
  }
}
export interface ParserRawSnapshot {
  metadata: { slot: bigint | number };
  account: {
    pubkey: string;
    owner: string;
    data: Uint8Array;
    lamports: bigint;
  };
  write_version: bigint;
}
export class SubscriptionAccountCache {
  #accounts = new Map<string, CachedAccount>();
  #conflicted = false;
  private assertNoConflict() {
    if (this.#conflicted) throw Error("Conflicting cached account version; create a new cache for the explicitly selected fork");
  }
  update(key: PublicKey, a: CachedAccount): boolean {
    return this.updateMany([[key, a]]) > 0;
  }
  /** Atomic across the batch, including conflicts between two updates in it. */
  updateMany(updates: Iterable<readonly [PublicKey, CachedAccount]>): number {
    this.assertNoConflict();
    // Stage only this batch; copying the whole subscribed map makes each
    // account notification proportional to all watched accounts.
    const pending = new Map<string, CachedAccount>();
    let changed = 0;
    for (const [key, a] of updates) {
      u64(a.slot);
      u64(a.writeVersion);
      const name = key.toBase58(),
        old = pending.get(name) ?? this.#accounts.get(name);
      if (old) {
        if (
          a.slot < old.slot ||
          (a.slot === old.slot && a.writeVersion < old.writeVersion)
        )
          continue;
        if (a.slot === old.slot && a.writeVersion === old.writeVersion) {
          if (
            !a.owner.equals(old.owner) ||
            !Buffer.from(a.data).equals(Buffer.from(old.data))
          ) {
            this.#conflicted = true;
            throw new Error(
              "Conflicting cached account version; select a fork explicitly",
            );
          }
          continue;
        }
      }
      pending.set(name, owned(a));
      changed++;
    }
    for (const [key, account] of pending) this.#accounts.set(key, account);
    return changed;
  }
  updateFromParser(e: ParserRawSnapshot): boolean {
    if (
      typeof e.metadata.slot === "number" &&
      !Number.isSafeInteger(e.metadata.slot)
    )
      throw new Error("Unsafe parser slot");
    return this.update(new PublicKey(e.account.pubkey), {
      owner: new PublicKey(e.account.owner),
      data: e.account.lamports === 0n ? new Uint8Array() : e.account.data,
      slot: BigInt(e.metadata.slot),
      writeVersion: e.write_version,
    });
  }
  /** Materialize dynamic key iterables before reading any account version. */
  private snapshotAccounts(keys?: Iterable<PublicKey>): ReadonlyMap<string, CachedAccount> {
    if (keys === undefined) return this.#accounts;
    const names = new Set(Array.from(keys, key => key.toBase58()));
    this.assertNoConflict();
    const selected = new Map<string, CachedAccount>();
    for (const name of names) {
      const account = this.#accounts.get(name);
      if (!account) throw Error("Missing cached account: " + name);
      selected.set(name, account);
    }
    return selected;
  }
  /** Freeze only pre-discovered dependencies when keys are provided; no RPC. */
  readySnapshot(readiness: SubscriptionReadiness, keys?: Iterable<PublicKey>): AccountCacheSnapshot {
    const accounts = this.snapshotAccounts(keys);
    this.assertNoConflict();
    const ready = readiness.guard();
    return new AccountCacheSnapshot(accounts, () => { this.assertNoConflict(); ready(); });
  }
  /** O(selected account bytes), or O(all account bytes) when keys are omitted. */
  snapshot(keys?: Iterable<PublicKey>): AccountCacheSnapshot {
    return new AccountCacheSnapshot(this.snapshotAccounts(keys), () => this.assertNoConflict());
  }
}
