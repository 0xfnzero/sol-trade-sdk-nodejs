import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  AstralaneTransport,
  BondingCurveAccount,
  BonkParams,
  CONSTANTS,
  DexParamEnum,
  DexType,
  GasFeeStrategy,
  GasFeeStrategyConfig,
  MeteoraDammV2Params,
  PumpFunParams,
  PumpSwapParams,
  RaydiumAmmV4Params,
  RaydiumCpmmParams,
  SwqosConfig,
  SwqosRegion,
  SwqosTransport,
  SwqosType,
  TradeBuyParams,
  TradeConfig,
  TradeConfigBuilder,
  TradeResult,
  TradeSellParams,
  TradeTokenType,
  TradingClient,
} from 'sol-trade-sdk';

export const RUN_LIVE = process.env.RUN_LIVE_EXAMPLES === '1';
export const EXAMPLE_BLOCKHASH = new PublicKey(Buffer.alloc(32, 99)).toBase58();

export function rpcUrl(): string {
  return process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
}

export function examplePublicKey(seed: number): PublicKey {
  return new PublicKey(Buffer.alloc(32, seed));
}

export function defaultSwqosConfigs(): SwqosConfig[] {
  const configs: SwqosConfig[] = [
    { type: SwqosType.Default, region: SwqosRegion.Default, apiKey: '' },
  ];

  if (process.env.JITO_UUID) {
    configs.push({ type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: process.env.JITO_UUID });
  }
  if (process.env.BLOXROUTE_AUTH_TOKEN) {
    configs.push({ type: SwqosType.Bloxroute, region: SwqosRegion.Frankfurt, apiKey: process.env.BLOXROUTE_AUTH_TOKEN });
  }
  if (process.env.ASTRALANE_API_KEY) {
    configs.push({
      type: SwqosType.Astralane,
      region: SwqosRegion.Frankfurt,
      apiKey: process.env.ASTRALANE_API_KEY,
      transport: SwqosTransport.Quic,
      astralaneTransport: AstralaneTransport.Quic,
      mevProtection: true,
    });
  }
  if (process.env.HELIUS_API_KEY) {
    configs.push({ type: SwqosType.Helius, region: SwqosRegion.Default, apiKey: process.env.HELIUS_API_KEY, swqosOnly: true });
  }

  return configs;
}

export const flatGasFeeStrategy: GasFeeStrategyConfig = {
  buyPriorityFee: 500_000,
  sellPriorityFee: 500_000,
  buyComputeUnits: 180_000,
  sellComputeUnits: 160_000,
  buyTipLamports: 1_000_000,
  sellTipLamports: 1_000_000,
};

export function lowLatencyGasStrategy(): GasFeeStrategy {
  const strategy = new GasFeeStrategy();
  strategy.setGlobalFeeStrategy(180_000, 160_000, 800_000, 600_000, 0.002, 0.0015);
  return strategy;
}

export function tradeConfig(options: Partial<TradeConfig> = {}): TradeConfig {
  return TradeConfigBuilder.create(rpcUrl())
    .swqosConfigs(options.swqosConfigs ?? defaultSwqosConfigs())
    .useSeedOptimize(options.useSeedOptimize ?? true)
    .swqosCoresFromEnd(options.swqosCoresFromEnd ?? false)
    .maxSwqosSubmitConcurrency(options.maxSwqosSubmitConcurrency ?? 8)
    .gasStrategy(options.gasStrategy ?? lowLatencyGasStrategy())
    .logEnabled(options.logEnabled ?? true)
    .build();
}

export function createExampleClient(options: Partial<TradeConfig> = {}): TradingClient {
  if (RUN_LIVE) {
    throw new Error(
      'The protocol examples contain placeholder accounts and are dry-run only. ' +
        'Use low_latency_bot.ts and wire real parser/streamer state before submitting.'
    );
  }
  return new TradingClient(Keypair.generate(), tradeConfig(options));
}

export function loadPayerFromEnv(name = 'PRIVATE_KEY'): Keypair {
  const encoded = process.env[name]?.trim();
  if (!encoded) throw new Error(`${name} is required for live trading`);

  let secret: Uint8Array | undefined = undefined;
  try {
    if (encoded.startsWith('[')) {
      const values: unknown = JSON.parse(encoded);
      if (!Array.isArray(values) || values.length !== 64 || values.some((v) => !Number.isInteger(v) || Number(v) < 0 || Number(v) > 255)) {
        throw new Error('JSON private key must contain exactly 64 bytes');
      }
      secret = Uint8Array.from(values as number[]);
    } else {
      secret = bs58.decode(encoded);
    }
    if (secret.length !== 64) throw new Error(`decoded private key has ${secret.length} bytes, expected 64`);
    return Keypair.fromSecretKey(secret);
  } catch (error) {
    throw new Error(`Invalid ${name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    secret?.fill(0);
  }
}

export function createLiveClient(options: Partial<TradeConfig> = {}): TradingClient {
  if (!RUN_LIVE) throw new Error('Set RUN_LIVE_EXAMPLES=1 only after all live adapters are configured');
  return new TradingClient(loadPayerFromEnv(), tradeConfig(options));
}

export function isEventFresh(receivedAtMs: number, maxAgeMs: number, nowMs = Date.now()): boolean {
  return Number.isFinite(receivedAtMs) && maxAgeMs > 0 && receivedAtMs <= nowMs && nowMs - receivedAtMs <= maxAgeMs;
}

export function matchesTarget(actual: PublicKey, expected?: PublicKey): boolean {
  return expected === undefined || actual.equals(expected);
}

export function checkedPositionDelta(before: bigint, after: bigint): bigint {
  if (after <= before) throw new Error(`Buy produced no positive token balance delta: before=${before} after=${after}`);
  return after - before;
}

export function validateTradeIntent(inputAmount: number, slippageBasisPoints: number, fixedOutput?: number): void {
  if (!Number.isSafeInteger(inputAmount) || inputAmount <= 0) throw new Error('input amount must be a positive safe integer');
  if (!Number.isInteger(slippageBasisPoints) || slippageBasisPoints < 0 || slippageBasisPoints >= 10_000) {
    throw new Error('slippage must be an integer from 0 through 9999 basis points');
  }
  if (fixedOutput !== undefined && (!Number.isSafeInteger(fixedOutput) || fixedOutput <= 0)) {
    throw new Error('fixed output amount must be a positive safe integer when provided');
  }
}

export function createConnection(): Connection {
  return new Connection(rpcUrl(), 'confirmed');
}

export function exampleBondingCurve(): BondingCurveAccount {
  return {
    discriminator: 0,
    account: examplePublicKey(11),
    virtualTokenReserves: 1_000_000_000n,
    virtualSolReserves: 30_000_000_000n,
    realTokenReserves: 800_000_000n,
    realSolReserves: 24_000_000_000n,
    tokenTotalSupply: 1_000_000_000n,
    complete: false,
    creator: examplePublicKey(12),
    isMayhemMode: false,
    isCashbackCoin: true,
  };
}

export function pumpFunParams(): PumpFunParams {
  return {
    bondingCurve: exampleBondingCurve(),
    associatedBondingCurve: examplePublicKey(13),
    creatorVault: examplePublicKey(14),
    tokenProgram: CONSTANTS.TOKEN_PROGRAM,
    feeRecipient: examplePublicKey(15),
    quoteMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
  };
}

export function pumpSwapParams(): PumpSwapParams {
  return {
    pool: examplePublicKey(21),
    baseMint: examplePublicKey(22),
    quoteMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
    poolBaseTokenAccount: examplePublicKey(23),
    poolQuoteTokenAccount: examplePublicKey(24),
    poolBaseTokenReserves: 2_000_000_000n,
    poolQuoteTokenReserves: 50_000_000_000n,
    virtualQuoteReserves: 0n,
    coinCreatorVaultAta: examplePublicKey(25),
    coinCreatorVaultAuthority: examplePublicKey(26),
    baseTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    quoteTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    isMayhemMode: false,
    isCashbackCoin: true,
  };
}

export function bonkParams(): BonkParams {
  return {
    virtualBase: 2_000_000_000n,
    virtualQuote: 50_000_000_000n,
    realBase: 1_700_000_000n,
    realQuote: 40_000_000_000n,
    poolState: examplePublicKey(31),
    baseVault: examplePublicKey(32),
    quoteVault: examplePublicKey(33),
    mintTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    platformConfig: examplePublicKey(34),
    platformAssociatedAccount: examplePublicKey(35),
    creatorAssociatedAccount: examplePublicKey(36),
    globalConfig: examplePublicKey(37),
  };
}

export function raydiumCpmmParams(): RaydiumCpmmParams {
  return {
    poolState: examplePublicKey(41),
    ammConfig: examplePublicKey(42),
    baseMint: examplePublicKey(43),
    quoteMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
    baseReserve: 2_000_000_000,
    quoteReserve: 50_000_000_000,
    baseVault: examplePublicKey(44),
    quoteVault: examplePublicKey(45),
    baseTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    quoteTokenProgram: CONSTANTS.TOKEN_PROGRAM,
    observationState: examplePublicKey(46),
  };
}

export function raydiumAmmV4Params(): RaydiumAmmV4Params {
  return {
    amm: examplePublicKey(51),
    coinMint: examplePublicKey(52),
    pcMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
    tokenCoin: examplePublicKey(53),
    tokenPc: examplePublicKey(54),
    ammOpenOrders: examplePublicKey(55),
    ammTargetOrders: examplePublicKey(56),
    serumProgram: examplePublicKey(57),
    serumMarket: examplePublicKey(58),
    serumBids: examplePublicKey(59),
    serumAsks: examplePublicKey(60),
    serumEventQueue: examplePublicKey(61),
    serumCoinVaultAccount: examplePublicKey(62),
    serumPcVaultAccount: examplePublicKey(63),
    serumVaultSigner: examplePublicKey(64),
    coinReserve: 2_000_000_000n,
    pcReserve: 50_000_000_000n,
  };
}

export function meteoraDammV2Params(): MeteoraDammV2Params {
  return {
    pool: examplePublicKey(71),
    tokenAVault: examplePublicKey(72),
    tokenBVault: examplePublicKey(73),
    tokenAMint: examplePublicKey(74),
    tokenBMint: CONSTANTS.WSOL_TOKEN_ACCOUNT,
    tokenAProgram: CONSTANTS.TOKEN_PROGRAM,
    tokenBProgram: CONSTANTS.TOKEN_PROGRAM,
  };
}

export function dexParams(dexType: DexType): DexParamEnum {
  switch (dexType) {
    case DexType.PumpFun:
      return { type: 'PumpFun', params: pumpFunParams() };
    case DexType.PumpSwap:
      return { type: 'PumpSwap', params: pumpSwapParams() };
    case DexType.Bonk:
      return { type: 'Bonk', params: bonkParams() };
    case DexType.RaydiumCpmm:
      return { type: 'RaydiumCpmm', params: raydiumCpmmParams() };
    case DexType.RaydiumAmmV4:
      return { type: 'RaydiumAmmV4', params: raydiumAmmV4Params() };
    case DexType.MeteoraDammV2:
      return { type: 'MeteoraDammV2', params: meteoraDammV2Params() };
    default:
      throw new Error('This protocol requires current cached parameters; use examples/cached_trade.ts');
  }
}

function defaultTradeMint(dexType: DexType): PublicKey {
  switch (dexType) {
    case DexType.PumpSwap:
      return pumpSwapParams().baseMint;
    case DexType.RaydiumCpmm:
      return raydiumCpmmParams().baseMint;
    case DexType.RaydiumAmmV4:
      return raydiumAmmV4Params().coinMint;
    case DexType.MeteoraDammV2:
      return meteoraDammV2Params().tokenAMint;
    default:
      return examplePublicKey(91);
  }
}

export function exampleBuyParams(dexType: DexType, mint?: PublicKey): TradeBuyParams {
  const params: TradeBuyParams = {
    dexType,
    inputTokenType: dexType === DexType.Bonk ? TradeTokenType.USD1 : TradeTokenType.WSOL,
    mint: mint ?? defaultTradeMint(dexType),
    inputTokenAmount: 100_000,
    slippageBasisPoints: 300,
    recentBlockhash: EXAMPLE_BLOCKHASH,
    extensionParams: dexParams(dexType),
    waitTxConfirmed: true,
    createInputTokenAta: true,
    closeInputTokenAta: true,
    createMintAta: true,
    gasFeeStrategy: flatGasFeeStrategy,
    grpcRecvUs: Date.now() * 1000,
  };
  return params;
}

export function exampleSellParams(dexType: DexType, mint?: PublicKey): TradeSellParams {
  const params: TradeSellParams = {
    dexType,
    outputTokenType: dexType === DexType.Bonk ? TradeTokenType.USD1 : TradeTokenType.WSOL,
    mint: mint ?? defaultTradeMint(dexType),
    inputTokenAmount: 50_000,
    slippageBasisPoints: 300,
    recentBlockhash: EXAMPLE_BLOCKHASH,
    withTip: true,
    extensionParams: dexParams(dexType),
    waitTxConfirmed: true,
    createOutputTokenAta: true,
    closeOutputTokenAta: true,
    closeMintTokenAta: false,
    gasFeeStrategy: flatGasFeeStrategy,
    grpcRecvUs: Date.now() * 1000,
  };
  return params;
}

export function describeDryRun(name: string): void {
  console.log(name + ' prepared with current SDK types.');
  console.log('Placeholder protocol accounts are never submitted. Use low_latency_bot.ts for the guarded live workflow.');
}

export function logResult(label: string, result: TradeResult): void {
  console.log(label + ': success=' + result.success + ' signatures=' + result.signatures.join(','));
  if (result.error) console.log(label + ' error: ' + result.error.message);
}
