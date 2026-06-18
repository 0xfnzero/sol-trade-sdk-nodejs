/**
 * Tests for Sol Trade SDK - TypeScript
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair, PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import {
  AccountPolicy,
  BuyAmount,
  DexType,
  GasFeeStrategy,
  GasFeeStrategyType,
  SellAmount,
  createGasFeeStrategy,
  SwqosType,
  SwqosRegion,
  TradeType,
  TradeTokenType,
  TradeConfigBuilder,
  TradingClient,
  MiddlewareManager,
  InstructionProcessor,
  MAX_INSTRUCTIONS_WARN,
  ExecutionPath,
  createTradeConfig,
  createSimpleBuyParams,
  createSimpleBuyParamsWithDurableNonce,
  createSimpleSellParams,
  createSimpleSellParamsWithDurableNonce,
  recommendedSenderThreadCoreIndices,
  simpleBuyParamsToTradeBuyParams,
  simpleSellParamsToTradeSellParams,
  withSimpleBuyAccountPolicy,
  withSimpleBuyDurableNonce,
  withSimpleBuyGrpcRecvUs,
  withSimpleBuySimulate,
  withSimpleBuySlippage,
  withSimpleBuyWaitForAllSubmits,
  withSimpleBuyWaitTxConfirmed,
  withSimpleSellAccountPolicy,
  withSimpleSellGrpcRecvUs,
  withSimpleSellSimulate,
  withSimpleSellSlippage,
  withSimpleSellTip,
  withSimpleSellWaitForAllSubmits,
  withSimpleSellWaitTxConfirmed,
  RUST_PARITY_SIMULATE_CONFIG,
  commitmentToGetTxFinality,
  type InstructionMiddleware,
} from '../index';
import {
  ASTRALANE_ENDPOINTS,
  ASTRALANE_QUIC_HOSTS,
  BLOXROUTE_ENDPOINTS,
  BLOCK_RAZOR_ENDPOINTS,
  ClientFactory as SenderClientFactory,
  MIN_TIP_DEFAULT,
  MIN_TIP_SOLAMI,
  NODE1_ENDPOINTS,
  SOYAS_ENDPOINTS,
  SolamiClient as SenderSolamiClient,
  SPEEDLANDING_ENDPOINTS,
  STELLIUM_ENDPOINTS,
} from '../swqos/clients';
import {
  SolamiClient as ProviderSolamiClient,
  SwqosClientFactory,
  SwqosType as ProviderSwqosType,
} from '../swqos/providers';
import {
  confirmAnyTransactionSignature,
  extractHintsFromLogs,
  instructionErrorCodeFromMetaErr,
} from '../common/confirm-any-signature';
import { mapWithConcurrencyLimit } from '../common/map-pool';
import { Connection } from '@solana/web3.js';
import { SOL_TOKEN_ACCOUNT, WSOL_TOKEN_ACCOUNT } from '../constants';
import {
  computeFee,
  ceilDiv,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
} from '../calc';

describe('GasFeeStrategy', () => {
  let strategy: GasFeeStrategy;

  beforeEach(() => {
    strategy = new GasFeeStrategy();
  });

  it('should create a gas fee strategy', () => {
    expect(strategy).toBeDefined();
  });

  it('should set and get a strategy', () => {
    strategy.set(
      SwqosType.Jito,
      TradeType.Buy,
      GasFeeStrategyType.Normal,
      200000,
      100000,
      0.001
    );

    const value = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    expect(value).toBeDefined();
    expect(value?.cuLimit).toBe(200000);
    expect(value?.cuPrice).toBe(100000);
    expect(value?.tip).toBe(0.001);
  });

  it('should set global fee strategy', () => {
    const globalStrategy = createGasFeeStrategy();

    // Set global fee strategy first
    globalStrategy.setGlobalFeeStrategy(
      200000, 200000,  // buy/sell CU limit
      100000, 100000,  // buy/sell CU price
      100000, 100000   // buy/sell tip
    );

    // Check that strategies are set for common SWQOS types
    const jitoValue = globalStrategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    expect(jitoValue).toBeDefined();
    expect(jitoValue?.cuLimit).toBe(200000);
  });

  it('should update buy tip for all strategies', () => {
    strategy.set(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal, 200000, 100000, 0.001);
    strategy.set(SwqosType.Jito, TradeType.Sell, GasFeeStrategyType.Normal, 200000, 100000, 0.002);

    strategy.updateBuyTip(0.005);

    const buyValue = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    const sellValue = strategy.get(SwqosType.Jito, TradeType.Sell, GasFeeStrategyType.Normal);

    expect(buyValue?.tip).toBe(0.005);
    expect(sellValue?.tip).toBe(0.002);
  });

  it('should delete a strategy', () => {
    strategy.set(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal, 200000, 100000, 0.001);
    strategy.delete(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);

    const value = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);
    expect(value).toBeUndefined();
  });

  it('should resolve conflicts when setting Normal strategy', () => {
    // Set high/low strategies first
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice,
      200000, 100000, 0.0005
    );
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.HighTipLowCuPrice,
      200000, 100000, 0.002
    );

    // Set Normal strategy (should remove high/low)
    strategy.set(
      SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal,
      200000, 100000, 0.001
    );

    const low = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.LowTipHighCuPrice);
    const high = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.HighTipLowCuPrice);
    const normal = strategy.get(SwqosType.Jito, TradeType.Buy, GasFeeStrategyType.Normal);

    expect(low).toBeUndefined();
    expect(high).toBeUndefined();
    expect(normal).toBeDefined();
  });

  it('setHighLowFeeStrategies exposes two strategy rows per SWQOS (Rust parity)', () => {
    strategy.setHighLowFeeStrategies(
      [SwqosType.Jito],
      TradeType.Buy,
      200000,
      1000,
      500000,
      0.0001,
      0.0005
    );
    const rows = strategy
      .getStrategies(TradeType.Buy)
      .filter((r) => r.swqosType === SwqosType.Jito);
    expect(rows.length).toBe(2);
    const st = new Set(rows.map((r) => r.strategyType));
    expect(st.has(GasFeeStrategyType.LowTipHighCuPrice)).toBe(true);
    expect(st.has(GasFeeStrategyType.HighTipLowCuPrice)).toBe(true);
  });
});

describe('Calculations', () => {
  it('should compute fee correctly', () => {
    const fee = computeFee(1000000n, 100n, 10000n); // 1%
    expect(fee).toBe(10000n);
  });

  it('should perform ceiling division', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(11n, 3n)).toBe(4n);
  });

  it('should calculate with slippage for buy', () => {
    const result = calculateWithSlippageBuy(1000n, 100n); // 1% slippage
    expect(result).toBe(1010n);
  });

  it('should calculate with slippage for sell', () => {
    const result = calculateWithSlippageSell(1000n, 100n); // 1% slippage
    expect(result).toBe(990n);
  });

  it('should calculate PumpFun buy output', () => {
    const tokens = getBuyTokenAmountFromSolAmount(
      1000000n, // 0.001 SOL
      30000000000n,
      1073000000000000n,
      false,
      793000000000000n
    );
    expect(tokens > 0n).toBe(true);
  });

  it('should calculate PumpFun sell output', () => {
    const sol = getSellSolAmountFromTokenAmount(
      1000000000n, // 1 million tokens
      30000000000n,
      1073000000000000n,
      1000000000n
    );
    expect(sol > 0n).toBe(true);
  });
});

describe('createTradeConfig', () => {
  it('accepts optional commitment and flags', () => {
    const cfg = createTradeConfig('https://x', [], {
      commitment: 'finalized',
      checkMinTip: true,
    });
    expect(cfg.commitment).toBe('finalized');
    expect(cfg.checkMinTip).toBe(true);
  });

  it('passes through builder-style fields', () => {
    const cfg = createTradeConfig('https://x', [], {
      maxSwqosSubmitConcurrency: 4,
      mevProtection: true,
    });
    expect(cfg.maxSwqosSubmitConcurrency).toBe(4);
    expect(cfg.mevProtection).toBe(true);
  });

  it('adds Default RPC when SWQOS providers are configured', () => {
    const cfg = createTradeConfig('https://x', [
      { type: SwqosType.Jito, region: SwqosRegion.Frankfurt, apiKey: 'uuid' },
    ]);
    expect(cfg.swqosConfigs.map((c) => c.type)).toEqual([
      SwqosType.Jito,
      SwqosType.Default,
    ]);
  });

  it('adds Default RPC when no SWQOS providers are configured', () => {
    const cfg = TradeConfigBuilder.create('https://x').build();
    expect(cfg.swqosConfigs.map((c) => c.type)).toEqual([SwqosType.Default]);
  });

  it('sets Rust-parity defaults in shorthand helper', () => {
    const cfg = createTradeConfig('https://x');
    expect(cfg.logEnabled).toBe(true);
    expect(cfg.checkMinTip).toBe(false);
    expect(cfg.mevProtection).toBe(false);
    expect(cfg.useSeedOptimize).toBe(true);
    expect(cfg.createWsolAtaOnStartup).toBe(true);
    expect(cfg.swqosCoresFromEnd).toBe(false);
  });

  it('recommendedSenderThreadCoreIndices uses Rust two-thirds cap', () => {
    expect(recommendedSenderThreadCoreIndices(10, 6)).toEqual([2, 3, 4, 5]);
  });
});

describe('Simple trade params', () => {
  const mint = PublicKey.default;
  const durableNonce = {
    nonceAccount: PublicKey.default,
    authority: PublicKey.default,
    nonceHash: 'nonce-hash',
    recentBlockhash: 'recent-from-nonce',
  };

  it('constructs simple params with Rust-parity defaults and amount helpers', () => {
    const buy = createSimpleBuyParams(
      DexType.PumpFun,
      TradeTokenType.WSOL,
      mint,
      BuyAmount.WithMaxInput(5_000),
      { type: 'PumpFun', params: {} as any },
      'recent'
    );

    expect(buy.accountPolicy).toBe(AccountPolicy.Auto);
    expect(buy.waitTxConfirmed).toBe(false);
    expect(buy.waitForAllSubmits).toBe(false);
    expect(buy.simulate).toBe(false);
    expect(buy.recentBlockhash).toBe('recent');

    const sell = createSimpleSellParams(
      DexType.PumpFun,
      TradeTokenType.USDC,
      mint,
      SellAmount.ExactInput(7_000),
      { type: 'PumpFun', params: {} as any },
      'recent'
    );
    expect(sell.accountPolicy).toBe(AccountPolicy.Auto);
    expect(sell.withTip).toBe(true);
    expect(sell.waitTxConfirmed).toBe(false);
    expect(sell.waitForAllSubmits).toBe(false);
    expect(sell.simulate).toBe(false);
  });

  it('constructs durable nonce simple params without a recent blockhash', () => {
    const buy = createSimpleBuyParamsWithDurableNonce(
      DexType.PumpFun,
      TradeTokenType.SOL,
      mint,
      BuyAmount.ExactInput(1_000),
      { type: 'PumpFun', params: {} as any },
      durableNonce
    );
    expect(buy.recentBlockhash).toBeUndefined();
    expect(buy.durableNonce).toBe(durableNonce);

    const sell = createSimpleSellParamsWithDurableNonce(
      DexType.PumpFun,
      TradeTokenType.SOL,
      mint,
      SellAmount.ExactOutput(500, 1_000),
      { type: 'PumpFun', params: {} as any },
      durableNonce
    );
    expect(sell.recentBlockhash).toBeUndefined();
    expect(sell.durableNonce).toBe(durableNonce);
  });

  it('applies simple params with-helpers without mutating the original object', () => {
    const base = createSimpleBuyParams(
      DexType.PumpFun,
      TradeTokenType.WSOL,
      mint,
      BuyAmount.ExactInput(1_000),
      { type: 'PumpFun', params: {} as any },
      'recent'
    );
    const buy = withSimpleBuyGrpcRecvUs(
      withSimpleBuySimulate(
        withSimpleBuyWaitForAllSubmits(
          withSimpleBuyWaitTxConfirmed(
            withSimpleBuyDurableNonce(
              withSimpleBuyAccountPolicy(withSimpleBuySlippage(base, 123), AccountPolicy.CreateMissing),
              durableNonce
            ),
            true
          ),
          true
        ),
        true
      ),
      456
    );

    expect(base.recentBlockhash).toBe('recent');
    expect(buy.recentBlockhash).toBeUndefined();
    expect(buy.slippageBasisPoints).toBe(123);
    expect(buy.accountPolicy).toBe(AccountPolicy.CreateMissing);
    expect(buy.waitTxConfirmed).toBe(true);
    expect(buy.waitForAllSubmits).toBe(true);
    expect(buy.simulate).toBe(true);
    expect(buy.grpcRecvUs).toBe(456);

    const sell = withSimpleSellGrpcRecvUs(
      withSimpleSellTip(
        withSimpleSellSimulate(
          withSimpleSellWaitForAllSubmits(
            withSimpleSellWaitTxConfirmed(
              withSimpleSellAccountPolicy(
                withSimpleSellSlippage(
                  createSimpleSellParams(
                    DexType.PumpFun,
                    TradeTokenType.SOL,
                    mint,
                    SellAmount.ExactInput(1_000),
                    { type: 'PumpFun', params: {} as any },
                    'recent'
                  ),
                  321
                ),
                AccountPolicy.AssumePrepared
              ),
              true
            ),
            true
          ),
          true
        ),
        false
      ),
      654
    );
    expect(sell.slippageBasisPoints).toBe(321);
    expect(sell.accountPolicy).toBe(AccountPolicy.AssumePrepared);
    expect(sell.waitTxConfirmed).toBe(true);
    expect(sell.waitForAllSubmits).toBe(true);
    expect(sell.simulate).toBe(true);
    expect(sell.withTip).toBe(false);
    expect(sell.grpcRecvUs).toBe(654);
  });

  it('maps WithMaxInput buy and hot path account policy', () => {
    const low = simpleBuyParamsToTradeBuyParams({
      dexType: DexType.PumpFun,
      payWith: TradeTokenType.USDC,
      mint,
      amount: { type: 'WithMaxInput', quoteAmount: 10_000 },
      extensionParams: { type: 'PumpFun', params: {} as any },
      recentBlockhash: 'recent',
      slippageBasisPoints: 250,
      accountPolicy: AccountPolicy.HotPathMinimal,
      waitForAllSubmits: true,
      durableNonce,
      simulate: true,
    });

    expect(low.inputTokenType).toBe(TradeTokenType.USDC);
    expect(low.inputTokenAmount).toBe(10_000);
    expect(low.useExactSolAmount).toBe(false);
    expect(low.createInputTokenAta).toBe(false);
    expect(low.createMintAta).toBe(false);
    expect(low.closeInputTokenAta).toBe(false);
    expect(low.recentBlockhash).toBeUndefined();
    expect(low.durableNonce).toBe(durableNonce);
    expect(low.waitForAllSubmits).toBe(true);
    expect(low.simulate).toBe(true);
    expect(low.slippageBasisPoints).toBe(250);
  });

  it('maps ExactOutput buy and Auto account policy', () => {
    const low = simpleBuyParamsToTradeBuyParams({
      dexType: DexType.PumpFun,
      payWith: TradeTokenType.SOL,
      mint,
      amount: { type: 'ExactOutput', outputAmount: 42, maxInputAmount: 10_000 },
      extensionParams: { type: 'PumpFun', params: {} as any },
      accountPolicy: AccountPolicy.Auto,
    });

    expect(low.inputTokenAmount).toBe(10_000);
    expect(low.fixedOutputTokenAmount).toBe(42);
    expect(low.useExactSolAmount).toBe(true);
    expect(low.createInputTokenAta).toBe(false);
    expect(low.createMintAta).toBe(true);
    expect(low.closeInputTokenAta).toBe(false);
  });

  it('maps sell defaults, exact output, and SOL receive policy', () => {
    const low = simpleSellParamsToTradeSellParams({
      dexType: DexType.PumpFun,
      receiveAs: TradeTokenType.USDC,
      mint,
      amount: { type: 'ExactOutput', outputAmount: 7_000, maxInputAmount: 50_000 },
      extensionParams: { type: 'PumpFun', params: {} as any },
    });

    expect(low.inputTokenAmount).toBe(50_000);
    expect(low.fixedOutputTokenAmount).toBe(7_000);
    expect(low.withTip).toBe(true);
    expect(low.createOutputTokenAta).toBe(true);
    expect(low.closeOutputTokenAta).toBe(false);
    expect(low.closeMintTokenAta).toBe(false);

    const solLow = simpleSellParamsToTradeSellParams({
      dexType: DexType.PumpFun,
      receiveAs: TradeTokenType.SOL,
      mint,
      amount: { type: 'ExactInput', amount: 50_000 },
      extensionParams: { type: 'PumpFun', params: {} as any },
      withTip: false,
    });
    expect(solLow.withTip).toBe(false);
    expect(solLow.createOutputTokenAta).toBe(false);
  });
});

describe('Solami SWQOS parity', () => {
  it('sender factory creates Solami client with Rust v4.0.21 defaults', () => {
    const client = SenderClientFactory.createClient(
      { type: SwqosType.Solami, region: SwqosRegion.Tokyo },
      'https://rpc.example'
    );

    expect(client).toBeInstanceOf(SenderSolamiClient);
    expect(client.getSwqosType()).toBe(SwqosType.Solami);
    expect(client.minTipSol()).toBe(MIN_TIP_SOLAMI);
  });

  it('sender Solami requires Rust-style api token for client certificate auth', async () => {
    const client = SenderClientFactory.createClient(
      { type: SwqosType.Solami, region: SwqosRegion.Tokyo },
      'https://rpc.example'
    );

    await expect(
      client.sendTransaction(TradeType.Buy, Buffer.from([1, ...new Array(64).fill(0)]), false)
    ).rejects.toThrow(/Solami api token is required/);
  });

  it('provider factory exposes Solami provider', () => {
    expect(SwqosClientFactory.getSupportedTypes()).toContain(ProviderSwqosType.Solami);
    expect(SwqosClientFactory.getSupportedTypes()).not.toContain(ProviderSwqosType.Triton);
    expect(SwqosClientFactory.getSupportedTypes()).not.toContain(ProviderSwqosType.QuickNode);
    expect(SwqosClientFactory.getSupportedTypes()).not.toContain(ProviderSwqosType.Syndica);
    expect(SwqosClientFactory.getSupportedTypes()).not.toContain(ProviderSwqosType.Figment);
    expect(SwqosClientFactory.getSupportedTypes()).not.toContain(ProviderSwqosType.Alchemy);
    const provider = SwqosClientFactory.createClient({
      swqosType: ProviderSwqosType.Solami,
    });
    expect(provider).toBeInstanceOf(ProviderSolamiClient);
    expect(provider.getProviderType()).toBe(ProviderSwqosType.Solami);
  });

  it('provider Solami path does not claim unsupported HTTP live submit', async () => {
    const provider = SwqosClientFactory.createClient({
      swqosType: ProviderSwqosType.Solami,
    });
    const result = await provider.submitTransaction(Buffer.from([1, ...new Array(64).fill(0)]));
    expect(result.success).toBe(false);
    expect(result.error).toContain('QUIC path');
  });

  it('sender factory rejects legacy non-Rust SWQOS providers', () => {
    expect(() =>
      SenderClientFactory.createClient(
        { type: SwqosType.Triton, region: SwqosRegion.Default },
        'https://rpc.example'
      )
    ).toThrow(/Unsupported SWQOS type/);
  });

  it('rejects NextBlock because Rust v4.0.21 blacklists it by default', () => {
    const cfg = createTradeConfig('https://x', [
      { type: SwqosType.NextBlock, region: SwqosRegion.Frankfurt, apiKey: 'token' },
    ]);
    expect(cfg.swqosConfigs.map((c) => c.type)).toEqual([SwqosType.Default]);
    expect(() =>
      SenderClientFactory.createClient(
        { type: SwqosType.NextBlock, region: SwqosRegion.Frankfurt, apiKey: 'token' },
        'https://rpc.example'
      )
    ).toThrow(/blacklisted/);
  });
});

describe('SWQOS endpoint parity', () => {
  it('matches Rust v4.0.21 key region fallbacks', () => {
    expect(MIN_TIP_DEFAULT).toBe(0.00001);
    expect(BLOXROUTE_ENDPOINTS[SwqosRegion.Singapore]).toBe('https://tokyo.solana.dex.blxrbdn.com');
    expect(NODE1_ENDPOINTS[SwqosRegion.Singapore]).toBe('http://tk.node1.me');
    expect(BLOCK_RAZOR_ENDPOINTS[SwqosRegion.Singapore]).toContain('tokyo.solana.blockrazor');
    expect(ASTRALANE_ENDPOINTS[SwqosRegion.SLC]).toBe('http://la.gateway.astralane.io/irisb');
    expect(ASTRALANE_ENDPOINTS[SwqosRegion.Singapore]).toBe('http://sg.gateway.astralane.io/irisb');
    expect(ASTRALANE_QUIC_HOSTS[SwqosRegion.Singapore]).toBe('sg.gateway.astralane.io');
    expect(STELLIUM_ENDPOINTS[SwqosRegion.Singapore]).toBe('http://tyo1.flashrpc.com');
    expect(SOYAS_ENDPOINTS[SwqosRegion.Singapore]).toBe('tyo.landing.soyas.xyz:9000');
    expect(SPEEDLANDING_ENDPOINTS[SwqosRegion.Singapore]).toBe('sgp.speedlanding.trade:17778');
  });
});

describe('commitmentToGetTxFinality', () => {
  it('maps non-finality commitments to confirmed', () => {
    expect(commitmentToGetTxFinality('recent')).toBe('confirmed');
    expect(commitmentToGetTxFinality('processed')).toBe('confirmed');
  });

  it('preserves finalized', () => {
    expect(commitmentToGetTxFinality('finalized')).toBe('finalized');
  });
});

describe('RUST_PARITY_SIMULATE_CONFIG', () => {
  it('matches Rust simulate_transaction RPC flags', () => {
    expect(RUST_PARITY_SIMULATE_CONFIG.sigVerify).toBe(false);
    expect(RUST_PARITY_SIMULATE_CONFIG.replaceRecentBlockhash).toBe(false);
    expect(RUST_PARITY_SIMULATE_CONFIG.commitment).toBe('processed');
    expect(RUST_PARITY_SIMULATE_CONFIG.innerInstructions).toBe(true);
  });
});

describe('mapWithConcurrencyLimit', () => {
  it('caps concurrent workers', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('extractHintsFromLogs', () => {
  it('parses Rust log patterns', () => {
    const h = extractHintsFromLogs([
      'Program log: Error: slippage.',
      'x Error Message: user rejected.',
    ]);
    expect(h).toContain('slippage');
    expect(h).toContain('user rejected');
  });
});

describe('instructionErrorCodeFromMetaErr', () => {
  it('returns Custom instruction code', () => {
    expect(
      instructionErrorCodeFromMetaErr({
        InstructionError: [2, { Custom: 6001 }],
      })
    ).toEqual({ code: 6001, instructionIndex: 2 });
  });

  it('maps Solana built-in InstructionError variants like Rust', () => {
    expect(
      instructionErrorCodeFromMetaErr({
        InstructionError: [1, 'InvalidInstructionData'],
      })
    ).toEqual({ code: 3, instructionIndex: 1 });
    expect(
      instructionErrorCodeFromMetaErr({
        InstructionError: [4, 'MissingRequiredSignature'],
      })
    ).toEqual({ code: 8, instructionIndex: 4 });
  });

  it('uses Rust unknown and non-instruction fallbacks', () => {
    expect(
      instructionErrorCodeFromMetaErr({
        InstructionError: [3, 'ComputationalBudgetExceeded'],
      })
    ).toEqual({ code: 999, instructionIndex: 3 });
    expect(instructionErrorCodeFromMetaErr('BlockhashNotFound')).toEqual({ code: 108 });
  });
});

describe('confirmAnyTransactionSignature', () => {
  it('throws TradeError 106 when signatures empty', async () => {
    const c = new Connection('https://api.mainnet-beta.solana.com');
    await expect(confirmAnyTransactionSignature(c, [])).rejects.toMatchObject({
      code: 106,
    });
  });

  it('single signature path also parses meta.err and logs', async () => {
    const connection = {
      getSignatureStatuses: vi.fn().mockResolvedValue({
        context: { slot: 1 },
        value: [
          {
            err: { InstructionError: [0, { Custom: 6002 }] },
            confirmationStatus: 'processed' as const,
            slot: 1,
            confirmations: 0,
          },
        ],
      }),
      getTransaction: vi.fn().mockResolvedValue({
        slot: 1,
        transaction: { signatures: [], message: {} },
        meta: {
          err: { InstructionError: [0, { Custom: 6002 }] },
          fee: 5000,
          preBalances: [0],
          postBalances: [0],
          logMessages: ['Program log: Error: failed.'],
        },
      }),
    } as unknown as Connection;

    await expect(
      confirmAnyTransactionSignature(connection, ['sigA'], {
        pollsBeforeGetTransaction: 1,
        pollIntervalMs: 0,
      })
    ).rejects.toMatchObject({ code: 6002 });
    expect(connection.getTransaction).toHaveBeenCalled();
  });

  it('after poll threshold, uses getTransaction meta.err like Rust (Custom code)', async () => {
    const connection = {
      getSignatureStatuses: vi.fn().mockResolvedValue({
        context: { slot: 1 },
        value: [
          {
            err: null,
            confirmationStatus: 'processed' as const,
            slot: 1,
            confirmations: 0,
          },
          null,
        ],
      }),
      getTransaction: vi.fn().mockResolvedValue({
        slot: 1,
        transaction: { signatures: [], message: {} },
        meta: {
          err: { InstructionError: [0, { Custom: 6001 }] },
          fee: 5000,
          preBalances: [0],
          postBalances: [0],
          logMessages: ['Program log: Error: slippage exceeded.'],
        },
      }),
    } as unknown as Connection;
    await expect(
      confirmAnyTransactionSignature(connection, ['sigA', 'sigB'], {
        pollsBeforeGetTransaction: 1,
        pollIntervalMs: 0,
      })
    ).rejects.toMatchObject({ code: 6001 });
    expect(connection.getTransaction).toHaveBeenCalled();
  });
});

describe('TradingClient execution parity', () => {
  it('prefers durable nonce hash over recent blockhash on the legacy execution path', async () => {
    const payer = Keypair.generate();
    const client = new (TradingClient as any)(
      payer,
      TradeConfigBuilder.create('https://rpc.example').build()
    );
    client._config.swqosConfigs = [];
    const nonceHash = 'swqrv48gsrwpBFbftEwnP2vB4jckpvfGJfXkwaniLCC';
    const recentBlockhash = 'p2Yicb86aZig616Eav2VWG9vuXR5mEqhtzshZYBxzsV';
    let sent: Buffer | undefined;
    client.connection = {
      sendRawTransaction: vi.fn(async (raw: Buffer) => {
        sent = raw;
        return 'sig';
      }),
    };

    const result = await client.executeTransaction(
      [new TransactionInstruction({ programId: PublicKey.default, keys: [], data: Buffer.from([1]) })],
      recentBlockhash,
      undefined,
      false,
      false,
      {
        tradeType: TradeType.Buy,
        dexType: DexType.PumpFun,
        durableNonce: {
          nonceAccount: PublicKey.default,
          authority: payer.publicKey,
          nonceHash,
          recentBlockhash,
        },
      }
    );

    expect(result.success).toBe(true);
    expect(sent).toBeDefined();
    const tx = VersionedTransaction.deserialize(sent!);
    expect(tx.message.recentBlockhash).toBe(nonceHash);
  });

  it('rejects oversized signed transactions before submit like Rust', async () => {
    const payer = Keypair.generate();
    const client = new (TradingClient as any)(
      payer,
      TradeConfigBuilder.create('https://rpc.example').build()
    );
    client._config.swqosConfigs = [];
    client.connection = {
      sendRawTransaction: vi.fn(async () => 'sig'),
    };

    const result = await client.executeTransaction(
      [
        new TransactionInstruction({
          programId: PublicKey.default,
          keys: Array.from({ length: 40 }, () => ({
            pubkey: Keypair.generate().publicKey,
            isSigner: false,
            isWritable: false,
          })),
          data: Buffer.alloc(700, 1),
        }),
      ],
      'p2Yicb86aZig616Eav2VWG9vuXR5mEqhtzshZYBxzsV',
      undefined,
      false,
      false,
      {
        tradeType: TradeType.Buy,
        dexType: DexType.PumpFun,
      }
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('transaction too large');
    expect(client.connection.sendRawTransaction).not.toHaveBeenCalled();
  });
});

describe('ExecutionPath (Rust parity)', () => {
  it('isBuy is true for SOL/WSOL quote mints', () => {
    expect(ExecutionPath.isBuy(SOL_TOKEN_ACCOUNT)).toBe(true);
    expect(ExecutionPath.isBuy(WSOL_TOKEN_ACCOUNT)).toBe(true);
  });
});

describe('InstructionProcessor (Rust parity)', () => {
  it('throws when instructions empty', () => {
    expect(() => InstructionProcessor.preprocess([])).toThrow('Instructions empty');
  });

  it('calculateSize counts web3 TransactionInstruction keys', () => {
    const ix = new TransactionInstruction({
      keys: [{ pubkey: PublicKey.default, isSigner: false, isWritable: true }],
      programId: PublicKey.default,
      data: Buffer.from([1, 2]),
    });
    const size = InstructionProcessor.calculateSize([ix]);
    expect(size).toBe(2 + 32);
  });

  it('warns when instruction count exceeds MAX_INSTRUCTIONS_WARN', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = new TransactionInstruction({
      keys: [],
      programId: PublicKey.default,
      data: Buffer.alloc(0),
    });
    const many = Array.from({ length: MAX_INSTRUCTIONS_WARN + 1 }, () => stub);
    InstructionProcessor.preprocess(many);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('MiddlewareManager (Rust parity)', () => {
  class RecordingMiddleware implements InstructionMiddleware {
    protocolCalls: { len: number; protocol: string; isBuy: boolean }[] = [];
    fullCalls: { len: number; protocol: string; isBuy: boolean }[] = [];

    name(): string {
      return 'RecordingMiddleware';
    }

    processProtocolInstructions(
      ixs: TransactionInstruction[],
      protocolName: string,
      isBuy: boolean
    ): TransactionInstruction[] {
      this.protocolCalls.push({ len: ixs.length, protocol: protocolName, isBuy });
      return ixs;
    }

    processFullInstructions(
      ixs: TransactionInstruction[],
      protocolName: string,
      isBuy: boolean
    ): TransactionInstruction[] {
      this.fullCalls.push({ len: ixs.length, protocol: protocolName, isBuy });
      return ixs;
    }

    clone(): InstructionMiddleware {
      return new RecordingMiddleware();
    }
  }

  it('TradeConfigBuilder passes middlewareManager to TradeConfig', () => {
    const mgr = new MiddlewareManager();
    const cfg = TradeConfigBuilder.create('https://api.mainnet-beta.solana.com')
      .middlewareManager(mgr)
      .build();
    expect(cfg.middlewareManager).toBe(mgr);
  });

  it('TradeConfigBuilder passes maxSwqosSubmitConcurrency', () => {
    const cfg = TradeConfigBuilder.create('https://api.mainnet-beta.solana.com')
      .maxSwqosSubmitConcurrency(8)
      .build();
    expect(cfg.maxSwqosSubmitConcurrency).toBe(8);
  });

  it('protocol pass then full pass match Rust executor + transaction_builder ordering', () => {
    const rec = new RecordingMiddleware();
    const mgr = new MiddlewareManager().addMiddleware(rec);
    const proto = [
      new TransactionInstruction({
        keys: [],
        programId: PublicKey.default,
        data: Buffer.alloc(0),
      }),
    ];
    mgr.applyMiddlewaresProcessProtocolInstructions(proto, 'PumpFun', true);
    expect(rec.protocolCalls).toEqual([
      { len: 1, protocol: 'PumpFun', isBuy: true },
    ]);

    const wired = [
      new TransactionInstruction({
        keys: [],
        programId: PublicKey.default,
        data: Buffer.from([1]),
      }),
      ...proto,
    ];
    mgr.applyMiddlewaresProcessFullInstructions(wired, 'PumpFun', true);
    expect(rec.fullCalls).toEqual([{ len: 2, protocol: 'PumpFun', isBuy: true }]);
  });
});
