import {prepareExplicitDammV2Route} from "./cached_damm_v2";
import {cachedPumpFun} from './cached_pumpfun';
import {settlePumpFunNativeQuote} from './pumpfun_settlement';
import {CacheNotReadyError} from "./subscription_readiness";
import {iterateCandidateRoutes} from "./route_candidates";
/** High-level native cache -> independent buy/sell -> V1. No implicit RPC. */
import {
  PublicKey,
  SystemProgram,
  type Signer,
  type TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  AccountCacheSnapshot,
  type CacheReadContext,
  type PoolTradeHint,
} from "./subscription_cache";
import { settleCachedRouteWithNativeSol } from "./native_sol";
import {
  compileV1Message,
  signV1Transaction,
  type V1Config,
  type CompiledV1Message,
} from "../serialization/v1";
import type { PreparedCachedRoute } from "./cached_route";
export type CachedDexType =
  | "PumpFun"
  | "MeteoraDammV2"
  | "PumpSwap"
  | "RaydiumAmmV4"
  | "LaunchLab"
  | "Bonk"
  | "StonkFun"
  | "RaydiumCpmm"
  | "RaydiumClmm"
  | "OrcaWhirlpool"
  | "MeteoraDlmm";
const programs: Record<CachedDexType, string> = {
  PumpFun: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  MeteoraDammV2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  PumpSwap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  RaydiumAmmV4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  LaunchLab: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  Bonk: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  StonkFun: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  RaydiumCpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  RaydiumClmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  OrcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  MeteoraDlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
};
export interface CachedTradeRequest {
  dexType: CachedDexType;
  tradeType: "Buy" | "Sell";
  snapshot: AccountCacheSnapshot;
  hints?: readonly PoolTradeHint[];
  candidates?: readonly PoolTradeHint[];
  inputMint?: PublicKey;
  outputMint?: PublicKey;
  context: CacheReadContext;
  unixTimestamp: bigint;
  payer: PublicKey;
  amount: bigint;
  /** Caller minimum for direct DAMM v2 exact-in; not an estimated quotation. */
  fixedOutputAmount?: bigint;
  recentBlockhash: string;
  slippageBps?: number;
  maximumArrays?: number;
  v1Config?: V1Config;
  nativeInput?: boolean;
  nativeOutput?: boolean;
  temporaryWsolSeed?: string;
  rentLamports?: bigint;
  /** Explicit service tip in lamports; provider selection is performed before preparation. */
  tipAccount?: PublicKey;
  tipLamports?: bigint;
}
export interface PreparedCachedTrade {
  /** WSOL sell wraps only the protected output; surplus remains native SOL. */
  estimatedNativeResidualLamports: bigint;
  route: PreparedCachedRoute;
  instructions: readonly TransactionInstruction[];
  compiled: CompiledV1Message;
  requiredNativeLamports: bigint;
}
export function prepareCachedTrade(r: CachedTradeRequest): PreparedCachedTrade {
  if (r.slippageBps !== undefined && (!Number.isInteger(r.slippageBps) || r.slippageBps < 0 || r.slippageBps >= 10000))
    throw Error("Invalid cached trade slippage: expected integer basis points in [0, 10000)");
  if (r.tradeType !== "Buy" && r.tradeType !== "Sell")
    throw Error("Cached trade requires independent Buy or Sell");
  if(!r.snapshot)throw Error("Missing frozen account snapshot");
  r.snapshot.assertUsable();
  if (!r.hints?.length) {
    if (!r.candidates || !r.inputMint || !r.outputMint) throw Error("Provide explicit hints or candidate pools and endpoint mints");
    const failures: unknown[] = [];
    for (const hints of iterateCandidateRoutes(r.candidates,r.inputMint,r.outputMint)) {
      r.snapshot.assertUsable();
      try { return prepareCachedTrade({...r,hints,candidates:undefined}); }
      catch (error) { if(error instanceof CacheNotReadyError)throw error; failures.push(error); }
    }
    throw new AggregateError(failures,"No candidate route passed current state validation and quoting");
  }
  const program = programs[r.dexType];
  if (!program || !r.hints.length)
    throw Error("Unsupported cached trade protocol or empty path");
  const anchor = r.hints[r.tradeType === "Buy" ? r.hints.length - 1 : 0]!;
  if (r.snapshot.get(anchor.pool, r.context).owner.toBase58() !== program)
    throw Error("Trade protocol does not match anchor pool");
  // Attribution requires actual platform identity, not a shared program id alone.
  if (r.dexType === "StonkFun" || r.dexType === "LaunchLab" || r.dexType === "Bonk") {
    const {accounts} = r.dexType === "StonkFun" ? r.snapshot.stonkfunCurve(anchor,r.context) : r.snapshot.launchlabCurve(anchor,r.context);
    if (!accounts.baseMint.equals(r.tradeType === "Buy" ? anchor.outputMint : anchor.inputMint))
      throw Error("LaunchLab anchor direction does not match independent trade type");
  }
  let nativePumpFun=false;
  if(r.dexType==='PumpFun') {
    const state=cachedPumpFun(r.snapshot,anchor,r.context);
    nativePumpFun=state.quote.toBase58()==='So11111111111111111111111111111111111111112';
    if(!state.mint.equals(r.tradeType==='Buy'?anchor.outputMint:anchor.inputMint))throw Error('PumpFun anchor direction does not match independent trade type');
  }
  if(r.dexType !== "MeteoraDammV2" && r.fixedOutputAmount !== undefined) throw Error("fixedOutputAmount is only supported by explicit DAMM v2 preparation");
  let route = r.dexType === "MeteoraDammV2" ? prepareExplicitDammV2Route(r.snapshot,r.hints,r.context,r.unixTimestamp,r.payer,r.amount,r.fixedOutputAmount,r.tradeType) : r.snapshot.prepareRoute(
    r.hints,
    r.context,
    r.unixTimestamp,
    r.payer,
    r.amount,
    r.slippageBps ?? 100,
    r.maximumArrays ?? 8,
    nativePumpFun,
  );
  const input = r.nativeInput ?? false,
    output = r.nativeOutput ?? false;
  if (typeof input !== "boolean" || typeof output !== "boolean")
    throw Error("Native endpoint flags must be boolean");
  let instructions: readonly TransactionInstruction[] = [
      ...route.setupInstructions,
      ...route.swapInstructions,
    ],
    requiredNativeLamports = 0n;
  let estimatedNativeResidualLamports=0n;
  if(nativePumpFun) {
    const n=settlePumpFunNativeQuote(route,r.payer,input,output,r.temporaryWsolSeed!,r.rentLamports!);
    instructions=n.instructions;requiredNativeLamports=n.requiredLamports;estimatedNativeResidualLamports=n.estimatedNativeResidualLamports;
    if(r.tradeType==='Sell'&&route.legs.length>1)route={...route,estimatedIntermediateResiduals:[{mint:route.legs[0]!.hint.outputMint,amount:route.legs[0]!.minimumNetAmountOut-route.legs[1]!.amountIn},...route.estimatedIntermediateResiduals.slice(1)]};
  } else if (input || output) {
    const n = settleCachedRouteWithNativeSol(
      route,
      r.payer,
      r.temporaryWsolSeed!,
      r.rentLamports!,
      input,
      output,
    );
    instructions = n.instructions;
    requiredNativeLamports = n.requiredLamports;
  }
  const tip = r.tipLamports ?? 0n;
  if (typeof tip !== "bigint" || tip < 0n || tip >= 1n << 64n)
    throw Error("Tip lamports must be u64");
  if (tip > 0n || r.tipAccount !== undefined) {
    if (
      !tip ||
      !r.tipAccount ||
      r.tipAccount.equals(PublicKey.default) ||
      r.tipAccount.equals(r.payer)
    )
      throw Error(
        "Provide a positive tip and a distinct non-default recipient",
      );
    requiredNativeLamports += tip;
    if (requiredNativeLamports >= 1n << 64n)
      throw Error("Native funding plus tip exceeds u64");
    instructions = [
      SystemProgram.transfer({
        fromPubkey: r.payer,
        toPubkey: r.tipAccount,
        lamports: tip,
      }),
      ...instructions,
    ];
  }
  const compiled = compileV1Message(r.payer, instructions, r.recentBlockhash, {
    ...r.v1Config,
    computeUnitLimit: r.v1Config?.computeUnitLimit ?? 300000,
    loadedAccountsDataSizeLimit:
      r.v1Config?.loadedAccountsDataSizeLimit ?? 64 * 1024 * 1024,
  });
  r.snapshot.assertUsable();
  return { route, instructions, compiled, requiredNativeLamports,estimatedNativeResidualLamports };
}
/** Caller supplies a SWQOS/raw-wire transport. Receipt is submission, not confirmation. */
export class CachedTradeExecutor {
  constructor(private readonly dexType: CachedDexType) {}
  prepare(request: CachedTradeRequest) {
    if (request.dexType !== this.dexType)
      throw Error("Factory/request protocol mismatch");
    return prepareCachedTrade(request);
  }
  async execute(
    request: CachedTradeRequest,
    signers: readonly Signer[],
    submit: (wire: Uint8Array, tradeType: "Buy" | "Sell") => Promise<string>,
  ) {
    if (typeof submit !== "function")
      throw Error("Provide a raw-wire submission transport");
    const prepared = this.prepare(request),
      wire = signV1Transaction(prepared.compiled, signers),
      signature = bs58.encode(
        wire.slice(
          prepared.compiled.message.length,
          prepared.compiled.message.length + 64,
        ),
      );
    request.snapshot.assertUsable();
    const returned = await submit(Uint8Array.from(wire), request.tradeType);
    if (returned !== signature)
      throw Error("Submission signature does not match signed V1 transaction");
    return {
      signature,
      submitted: true,
      confirmed: false,
      minimumNetAmountOut: prepared.route.minimumNetAmountOut,
    };
  }
}
