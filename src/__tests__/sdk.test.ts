/**
 * Tests for Sol Trade SDK - TypeScript
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  GasFeeStrategy,
  GasFeeStrategyType,
  createGasFeeStrategy,
  SwqosType,
  TradeType,
  TradeConfigBuilder,
  MiddlewareManager,
  InstructionProcessor,
  MAX_INSTRUCTIONS_WARN,
  ExecutionPath,
  createTradeConfig,
  RUST_PARITY_SIMULATE_CONFIG,
  commitmentToGetTxFinality,
  type InstructionMiddleware,
} from '../index';
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
});

describe('confirmAnyTransactionSignature', () => {
  it('throws TradeError 106 when signatures empty', async () => {
    const c = new Connection('https://api.mainnet-beta.solana.com');
    await expect(confirmAnyTransactionSignature(c, [])).rejects.toMatchObject({
      code: 106,
    });
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
