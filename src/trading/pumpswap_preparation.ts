/** Frozen cache-only PumpSwap preparation, bounded best-output search and offline signing. */
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  type Signer,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import { PUMPSWAP_PROGRAM, decodePoolPayload } from "../instruction/pumpswap";
import { WSOL_TOKEN_ACCOUNT } from "../constants";
import {
  PoolTradeHint,
  type AccountCacheSnapshot,
  type CacheReadContext,
} from "./subscription_cache";
import { prepareCachedRoute, type PreparedCachedRoute, type BridgeLimits } from "./cached_route";
import { settleCachedRouteWithNativeSol } from "./native_sol";
import {
  compileV1Message,
  signV1Transaction,
  type V1Config,
} from "../serialization/v1";
import { CacheNotReadyError } from "./subscription_readiness";
import nacl from "tweetnacl";
import type { MiddlewareManager } from "../middleware/traits";
const canonical = (k: PublicKey) =>
  k.toBase58() === "So11111111111111111111111111111111111111111"
    ? WSOL_TOKEN_ACCOUNT
    : new PublicKey(k.toBytes());
const copyIx = (ix: TransactionInstruction) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId.toBytes()),
    data: Buffer.from(ix.data),
    keys: ix.keys.map((k) => ({
      ...k,
      pubkey: new PublicKey(k.pubkey.toBytes()),
    })),
  });
const copyHint = (h: PoolTradeHint) =>
  new PoolTradeHint(
    new PublicKey(h.pool.toBytes()),
    canonical(h.inputMint),
    canonical(h.outputMint),
    h.pumpfunVersion,
  );
function copyRoute(r: PreparedCachedRoute): PreparedCachedRoute {
  return {
    ...r,
    legs: r.legs.map((l) => ({
      ...l,
      hint: copyHint(l.hint),
      instruction: copyIx(l.instruction),
    })),
    setupInstructions: r.setupInstructions.map(copyIx),
    swapInstructions: r.swapInstructions.map(copyIx),
    estimatedIntermediateResiduals: r.estimatedIntermediateResiduals.map(
      (x) => ({ ...x, mint: new PublicKey(x.mint.toBytes()) }),
    ),
  };
}
export interface PumpSwapPreparationRequest {
  snapshot: AccountCacheSnapshot;
  context: CacheReadContext;
  unixTimestamp: bigint;
  payer: PublicKey;
  amount: bigint;
  tradeType: "Buy" | "Sell";
  slippageBps?: number;
  maximumArrays?: number;
}
export interface PumpSwapBuildOptions {
  context: CacheReadContext;
  recentBlockhash: string;
  signers: readonly Signer[];
  version?: 0 | 1;
  lookupTables?: readonly AddressLookupTableAccount[];
  v1Config?: V1Config;
  computeUnitLimit?: number;
  computeUnitPrice?: bigint;
  durableNonce?: { account: PublicKey; authority: PublicKey; hash: string };
  nativeInput?: boolean;
  nativeOutput?: boolean;
  temporaryWsolSeed?: string;
  rentLamports?: bigint;
  tipAccount?: PublicKey;
  tipLamports?: bigint;
  middlewareManager?: MiddlewareManager;
}
/** The quote and instruction bytes are privately owned; preview returns a defensive copy. */
export class PreparedPumpSwapTrade {
  #route: PreparedCachedRoute;
  #context: CacheReadContext;
  #payer: PublicKey;
  #snapshot: AccountCacheSnapshot;
  readonly tradeType: "Buy" | "Sell";
  constructor(request: PumpSwapPreparationRequest, route: PreparedCachedRoute) {
    this.#route = copyRoute(route);
    this.#context = { ...request.context };
    this.#payer = new PublicKey(request.payer.toBytes());
    this.#snapshot = request.snapshot;
    this.tradeType = request.tradeType;
    Object.freeze(this);
  }
  get minimumNetAmountOut(): bigint {
    return this.#route.minimumNetAmountOut;
  }
  get preview(): PreparedCachedRoute {
    return copyRoute(this.#route);
  }
  validateFreshness(current: CacheReadContext): void {
    this.#snapshot.assertUsable();
    const old = this.#context;
    if (
      current.epoch !== old.epoch ||
      current.slot < old.slot ||
      current.maximumSlotAge < 0n ||
      current.slot - old.slot >
        (current.maximumSlotAge < old.maximumSlotAge
          ? current.maximumSlotAge
          : old.maximumSlotAge)
    )
      throw Error("Prepared PumpSwap quote is stale or epoch changed");
  }
  /** No RPC, simulation, confirmation or broadcast. Supply blockhash/rent/ALTs from the cold path. */
  buildSigned(options: PumpSwapBuildOptions): {
    wire: Uint8Array;
    instructions: readonly TransactionInstruction[];
    requiredNativeLamports: bigint;
  } {
    this.validateFreshness(options.context);
    const r = copyRoute(this.#route),
      payer = this.#payer;
    let business = [...r.setupInstructions, ...r.swapInstructions],
      requiredNativeLamports = 0n;
    if (options.nativeInput || options.nativeOutput) {
      const n = settleCachedRouteWithNativeSol(
        r,
        payer,
        options.temporaryWsolSeed!,
        options.rentLamports!,
        options.nativeInput ?? false,
        options.nativeOutput ?? false,
      );
      business = [...n.instructions];
      requiredNativeLamports = n.requiredLamports;
    }
    const manager = options.middlewareManager,
      isBuy = this.tradeType === "Buy";
    if (manager)
      business = manager.applyMiddlewaresProcessProtocolInstructions(
        business,
        "PumpSwap",
        isBuy,
      );
    const nonce = options.durableNonce,
      tip = options.tipLamports ?? 0n;
    if (typeof tip !== "bigint" || tip < 0n || tip >= 1n << 64n)
      throw Error("Tip must be u64");
    if (options.tipAccount !== undefined || tip > 0n)
      if (
        !tip ||
        !options.tipAccount ||
        options.tipAccount.equals(PublicKey.default) ||
        options.tipAccount.equals(payer)
      )
        throw Error("Provide a positive tip and distinct recipient");
    requiredNativeLamports += tip;
    if (requiredNativeLamports >= 1n << 64n)
      throw Error("Native funding exceeds u64");
    const unitLimit =
        options.computeUnitLimit ??
        options.v1Config?.computeUnitLimit ??
        300000,
      unitPrice = options.computeUnitPrice ?? 0n;
    if (
      !Number.isInteger(unitLimit) ||
      unitLimit < 1 ||
      unitLimit > 1400000 ||
      typeof unitPrice !== "bigint" ||
      unitPrice < 0n ||
      unitPrice >= 1n << 64n
    )
      throw Error("Invalid compute budget");
    const version = options.version ?? 0;
    if (version !== 0 && version !== 1)
      throw Error("Unsupported transaction version");
    if (version === 1 && options.lookupTables?.length)
      throw Error("V1 does not use lookup tables");
    let instructions = [
      ...(nonce
        ? [
            SystemProgram.nonceAdvance({
              noncePubkey: nonce.account,
              authorizedPubkey: nonce.authority,
            }),
          ]
        : []),
      ...(tip
        ? [
            SystemProgram.transfer({
              fromPubkey: payer,
              toPubkey: options.tipAccount!,
              lamports: tip,
            }),
          ]
        : []),
      ...(version === 0
        ? [
            ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit }),
            ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: unitPrice,
            }),
          ]
        : []),
      ...business,
    ];
    if (manager)
      instructions = manager.applyMiddlewaresProcessFullInstructions(
        instructions,
        "PumpSwap",
        isBuy,
      );
    if (nonce) {
      const expected = SystemProgram.nonceAdvance({
          noncePubkey: nonce.account,
          authorizedPubkey: nonce.authority,
        }),
        first = instructions[0];
      if (
        !first ||
        !first.programId.equals(expected.programId) ||
        !first.data.equals(expected.data) ||
        first.keys.length !== expected.keys.length ||
        !first.keys.every((k, i) => {
          const e = expected.keys[i]!;
          return (
            k.pubkey.equals(e.pubkey) &&
            k.isSigner === e.isSigner &&
            k.isWritable === e.isWritable
          );
        })
      )
        throw Error("Middleware must preserve nonce advance first");
    }
    const hash = nonce?.hash ?? options.recentBlockhash;
    let wire: Uint8Array;
    if (version === 1) {
      wire = signV1Transaction(
        compileV1Message(payer, instructions, hash, {
          ...options.v1Config,
          computeUnitLimit: unitLimit,
          priorityFee:
            options.v1Config?.priorityFee ??
            (BigInt(unitLimit) * unitPrice + 999999n) / 1000000n,
        }),
        options.signers,
      );
    } else {
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer,
          recentBlockhash: hash,
          instructions,
        }).compileToV0Message(
          options.lookupTables ? [...options.lookupTables] : [],
        ),
      );
      const required = tx.message.staticAccountKeys.slice(
        0,
        tx.message.header.numRequiredSignatures,
      );
      if (
        required.some(
          (k) => !options.signers.some((s) => s.publicKey.equals(k)),
        )
      )
        throw Error("Missing required transaction signer");
      tx.sign([...options.signers]);
      if (
        tx.signatures.some(
          (sig, i) =>
            !nacl.sign.detached.verify(
              tx.message.serialize(),
              sig,
              required[i]!.toBytes(),
            ),
        )
      )
        throw Error("Transaction signer key mismatch");
      wire = tx.serialize();
      if (wire.length > 1232)
        throw Error(
          "Signed transaction exceeds 1232 bytes; supply lookup tables",
        );
    }
    this.validateFreshness(options.context);
    return {
      wire,
      instructions: instructions.map(copyIx),
      requiredNativeLamports,
    };
  }
}
export function preparePumpSwapTrade(
  request: PumpSwapPreparationRequest,
  hints: readonly PoolTradeHint[],
  bridgeLimits?: BridgeLimits,
): PreparedPumpSwapTrade {
  if (request.tradeType !== "Buy" && request.tradeType !== "Sell")
    throw Error("Invalid independent trade direction");
  request.snapshot.assertUsable();
  const ordered = hints.map(copyHint);
  const anchor = ordered[request.tradeType === "Buy" ? ordered.length - 1 : 0];
  if (
    !anchor ||
    !request.snapshot
      .get(anchor.pool, request.context)
      .owner.equals(PUMPSWAP_PROGRAM)
  )
    throw Error("PumpSwap must anchor the final buy leg or first sell leg");
  const route = prepareCachedRoute(
    request.snapshot,
    ordered,
    request.context,
    request.unixTimestamp,
    request.payer,
    request.amount,
    request.slippageBps ?? 100,
    request.maximumArrays ?? 8,
    false, bridgeLimits,
  );
  request.snapshot.assertUsable();
  return new PreparedPumpSwapTrade(request, route);
}
export interface PumpSwapRouteSearch {
  pool: PublicKey;
  tokenMint: PublicKey;
  assetMint: PublicKey;
  conversionPools: readonly PoolTradeHint[];
  maximumConversionHops?: number;
  maximumSearchNodes?: number;
  bridgeSlippageBps?: number;
  maximumBridgePriceImpactBps?: number;
}
export interface PumpSwapRouteSearchResult {
  trade: PreparedPumpSwapTrade;
  routesEvaluated: number;
  rejectedRoutes: readonly { pools: readonly PublicKey[]; reason: string }[];
}
/** Enumerate all bounded, noncyclic conversion paths, then rank their final protected output. */
export function searchPumpSwapTrade(request: PumpSwapPreparationRequest, search: PumpSwapRouteSearch): PumpSwapRouteSearchResult {
  return searchPumpSwapTradeWithTopology(request, search);
}
/** @internal Instance configuration supplies a validated identity graph. */
export function searchPumpSwapTradeWithTopology(
  request: PumpSwapPreparationRequest,
  search: PumpSwapRouteSearch,
  topology?: ReturnType<typeof buildPumpSwapTopology>,
): PumpSwapRouteSearchResult {
  if ([search.bridgeSlippageBps ?? 100, search.maximumBridgePriceImpactBps ?? 100]
    .some(v => !Number.isInteger(v) || v < 0 || v >= 10000)) throw Error("Invalid bridge limits");
  const maxHops = search.maximumConversionHops ?? 2,
    budget = search.maximumSearchNodes ?? 512;
  if (
    search.conversionPools.length > 128 ||
    !Number.isInteger(maxHops) ||
    maxHops < 0 ||
    maxHops > 3 ||
    !Number.isInteger(budget) ||
    budget < 1 ||
    budget > 4096
  )
    throw Error("Invalid PumpSwap search bounds");
  const token = canonical(search.tokenMint),
    asset = canonical(search.assetMint);
  if (token.equals(asset)) throw Error("Identical search endpoints");
  const account = request.snapshot.get(
      search.pool,
      request.context,
      PUMPSWAP_PROGRAM,
    ),
    pool = decodePoolPayload(Buffer.from(account.data).subarray(8));
  if (!pool || (!pool.baseMint.equals(token) && !pool.quoteMint.equals(token)))
    throw Error("PumpSwap anchor token mismatch");
  const quote = pool.baseMint.equals(token) ? pool.quoteMint : pool.baseMint;
  const anchor = new PoolTradeHint(
    search.pool,
    request.tradeType === "Buy" ? quote : token,
    request.tradeType === "Buy" ? token : quote,
  );
  // Validate anchor before considering candidate failures.
  const state = request.snapshot.pumpSwap(anchor, request.context);
  if (state.disableFlags & (anchor.inputMint.equals(pool.quoteMint) ? 8 : 16))
    throw Error("PumpSwap direction is disabled");
  if (state.pool.isCashbackCoin)
    throw Error("PumpSwap cashback quote requires verified fee context");
  for (const fee of [state.baseTransferFee, state.quoteTransferFee])
    if (fee.basisPoints !== 0 && fee.maximumFee !== 0n)
      throw Error("PumpSwap transfer-fee quote semantics are not yet verified");
  const graph = topology ?? buildPumpSwapTopology(search.conversionPools);
  if (graph.edges.has(search.pool.toBase58())) throw Error("Conversion route reuses anchor");
  const paths: PoolTradeHint[][] = [];
  let nodes = 0;
  const from = request.tradeType === "Buy" ? asset : quote,
    to = request.tradeType === "Buy" ? quote : asset;
  function visit(
    mint: PublicKey,
    path: PoolTradeHint[],
    seen: Set<string>,
  ): void {
    if (++nodes > budget) throw Error("PumpSwap search node budget exhausted");
    if (mint.equals(to)) {
      paths.push([...path]);
      return;
    }
    if (path.length >= maxHops) return;
    for (const h of graph.adjacency.get(mint.toBase58()) ?? []) {
      let next: PublicKey;
      if (h.inputMint.equals(mint)) next = h.outputMint;
      else if (h.outputMint.equals(mint)) next = h.inputMint;
      else continue;
      if (
        next.equals(token) ||
        seen.has(next.toBase58()) ||
        path.some((x) => x.pool.equals(h.pool))
      )
        continue;
      visit(
        next,
        [...path, new PoolTradeHint(h.pool, mint, next, h.pumpfunVersion)],
        new Set([...seen, next.toBase58()]),
      );
    }
  }
  visit(from, [], new Set([from.toBase58()]));
  const rejectedRoutes: { pools: PublicKey[]; reason: string }[] = [];
  let best: PreparedPumpSwapTrade | undefined,
    bestPath: PoolTradeHint[] = [];
  const compare = (
    a: readonly PoolTradeHint[],
    b: readonly PoolTradeHint[],
  ) => {
    for (let i = 0; i < a.length; i++) {
      const n = Buffer.compare(a[i]!.pool.toBuffer(), b[i]!.pool.toBuffer());
      if (n) return n;
    }
    return 0;
  };
  for (const conversion of paths) {
    const path =
      request.tradeType === "Buy"
        ? [...conversion, anchor]
        : [anchor, ...conversion];
    try {
      const trade = preparePumpSwapTrade(request, path, { anchorPool: search.pool,
        slippageBps: search.bridgeSlippageBps ?? 100,
        maximumPriceImpactBps: search.maximumBridgePriceImpactBps ?? 100 }),
        out = trade.minimumNetAmountOut,
        previous = best?.minimumNetAmountOut;
      if (
        !best ||
        out > previous! ||
        (out === previous &&
          (path.length < bestPath.length ||
            (path.length === bestPath.length && compare(path, bestPath) < 0)))
      ) {
        best = trade;
        bestPath = path;
      }
    } catch (error) {
      if (error instanceof CacheNotReadyError) throw error;
      rejectedRoutes.push({
        pools: path.map((h) => h.pool),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!best) throw Error("No executable PumpSwap conversion route");
  return { trade: best, routesEvaluated: paths.length, rejectedRoutes };
}

/** @internal Compiles identities only; never stores account state or quotes. */
export function buildPumpSwapTopology(pools: readonly PoolTradeHint[]) {
  const edges = new Map<string, PoolTradeHint>();
  for (const original of pools) {
    const h = copyHint(original);
    const id = h.pool.toBase58(),
      old = edges.get(id);
    if (old) {
      if (
        !(
          (old.inputMint.equals(h.inputMint) &&
            old.outputMint.equals(h.outputMint)) ||
          (old.inputMint.equals(h.outputMint) &&
            old.outputMint.equals(h.inputMint))
        )
      )
        throw Error("Conflicting pool identities");
    } else edges.set(id, h);
  }
  const sorted = [...edges.values()].sort((a, b) =>
    Buffer.compare(a.pool.toBuffer(), b.pool.toBuffer()),
  );
  const adjacency = new Map<string, PoolTradeHint[]>();
  for (const h of sorted) for (const mint of [h.inputMint, h.outputMint]) {
    const key = mint.toBase58();
    const list = adjacency.get(key) ?? []; list.push(h); adjacency.set(key, list);
  }
  return { edges, adjacency };
}
