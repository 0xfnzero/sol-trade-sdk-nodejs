import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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
    .swqosCoresFromEnd(options.swqosCoresFromEnd ?? true)
    .maxSwqosSubmitConcurrency(options.maxSwqosSubmitConcurrency ?? 8)
    .gasStrategy(options.gasStrategy ?? lowLatencyGasStrategy())
    .logEnabled(options.logEnabled ?? true)
    .build();
}

export function createExampleClient(options: Partial<TradeConfig> = {}): TradingClient {
  return new TradingClient(Keypair.generate(), tradeConfig(options));
}

export function createConnection(): Connection {
  return new Connection(rpcUrl(), 'confirmed');
}

export function exampleBondingCurve(): BondingCurveAccount {
  return {
    discriminator: 0,
    account: examplePublicKey(11),
    virtualTokenReserves: 1_000_000_000,
    virtualSolReserves: 30_000_000_000,
    realTokenReserves: 800_000_000,
    realSolReserves: 24_000_000_000,
    tokenTotalSupply: 1_000_000_000,
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
    poolBaseTokenReserves: 2_000_000_000,
    poolQuoteTokenReserves: 50_000_000_000,
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
  if (dexType === DexType.MeteoraDammV2) {
    params.fixedOutputTokenAmount = 90_000;
  }
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
  if (dexType === DexType.MeteoraDammV2) {
    params.fixedOutputTokenAmount = 45_000;
  }
  return params;
}

export function describeDryRun(name: string): void {
  console.log(name + ' prepared with current SDK types.');
  console.log('Set RUN_LIVE_EXAMPLES=1 and replace example params with real parser/RPC data before sending transactions.');
}

export function logResult(label: string, result: TradeResult): void {
  console.log(label + ': success=' + result.success + ' signatures=' + result.signatures.join(','));
  if (result.error) console.log(label + ' error: ' + result.error.message);
}
