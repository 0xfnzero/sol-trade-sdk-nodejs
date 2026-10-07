/** PumpFun curve account: exact u64 storage and pinned Rust account math. */
import { PublicKey } from '@solana/web3.js';
import { decodePumpFunBondingCurveData } from '../params';
import { getBondingCurvePda, getCreatorVaultPda } from '../instruction/pumpfun_builder';
import { WSOL_TOKEN_ACCOUNT, USDC_TOKEN_ACCOUNT, SOL_TOKEN_ACCOUNT } from '../constants';
const MAX = (1n << 64n) - 1n;
function u64(value: bigint): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > MAX) throw new RangeError('Expected u64 bigint');
  return value;
}
function low64(value: bigint): bigint { return BigInt.asUintN(64, value); }
export class BondingCurveAccount {
  discriminator = 0;
  account = PublicKey.default;
  virtualTokenReserves = 0n;
  virtualSolReserves = 0n;
  realTokenReserves = 0n;
  realSolReserves = 0n;
  tokenTotalSupply = 0n;
  complete = false;
  creator = PublicKey.default;
  isMayhemMode = false;
  isCashbackCoin = false;
  quoteMint = PublicKey.default;
  creatorFeeBps = 0n;
  canEditCreatorFee = false;
  isHolderReward = false;
  creatorFee = 0n;
  protocolFees = 0n;
  depth = 0;
  initialVirtualQuoteReserves = 0n;
  postCompleteBaseOut = 0n;
  postCompleteQuoteIn = 0n;

  constructor(fields?: Partial<BondingCurveAccount>) {
    if (fields) Object.assign(this, fields);
    for (const n of [this.virtualTokenReserves, this.virtualSolReserves, this.realTokenReserves, this.realSolReserves, this.tokenTotalSupply]) u64(n);
  }
  private validateReserves(): void {
    for (const value of [this.virtualTokenReserves,this.virtualSolReserves,this.realTokenReserves,this.realSolReserves,this.tokenTotalSupply]) u64(value);
  }
  static normalizeQuoteMint(mint: PublicKey): PublicKey {
    return mint.equals(PublicKey.default) || mint.equals(SOL_TOKEN_ACCOUNT) ? WSOL_TOKEN_ACCOUNT : mint;
  }
  effectiveQuoteMint(): PublicKey { return BondingCurveAccount.normalizeQuoteMint(this.quoteMint); }
  static initialVirtualQuoteReservesForQuoteMint(mint: PublicKey): bigint { return mint.equals(USDC_TOKEN_ACCOUNT) ? 4_292_000_000n : 30_000_000_000n; }
  virtualQuoteReserves(): bigint { return this.virtualSolReserves; }
  realQuoteReserves(): bigint { return this.realSolReserves; }
  withQuoteMint(mint: PublicKey): this {
    const normalized = BondingCurveAccount.normalizeQuoteMint(mint);
    const initial = BondingCurveAccount.initialVirtualQuoteReservesForQuoteMint(this.effectiveQuoteMint());
    const previous = initial + this.realSolReserves;
    if (this.virtualSolReserves === (previous > MAX ? MAX : previous)) {
      const next = BondingCurveAccount.initialVirtualQuoteReservesForQuoteMint(normalized) + this.realSolReserves;
      this.virtualSolReserves = next > MAX ? MAX : next;
    }
    this.quoteMint = normalized;
    return this;
  }
  static fromDevTrade(bondingCurve: PublicKey, mint: PublicKey, token: bigint, quote: bigint, creator: PublicKey, mayhem = false, cashback = false, quoteMint = WSOL_TOKEN_ACCOUNT): BondingCurveAccount {
    u64(token); u64(quote);
    const normalized = BondingCurveAccount.normalizeQuoteMint(quoteMint);
    const virtualQuote = BondingCurveAccount.initialVirtualQuoteReservesForQuoteMint(normalized) + quote;
    if (token > 793_100_000_000_000n || virtualQuote > MAX) throw new RangeError('Invalid dev trade reserves');
    return new BondingCurveAccount({account: bondingCurve.equals(PublicKey.default) ? getBondingCurvePda(mint) : bondingCurve, virtualTokenReserves: 1_073_000_000_000_000n - token, virtualSolReserves: virtualQuote, realTokenReserves: 793_100_000_000_000n - token, realSolReserves: quote, tokenTotalSupply: 1_000_000_000_000_000n, creator, isMayhemMode: mayhem, isCashbackCoin: cashback, quoteMint: normalized});
  }
  static fromTrade(bondingCurve: PublicKey, mint: PublicKey, creator: PublicKey, virtualTokenReserves: bigint, virtualSolReserves: bigint, realTokenReserves: bigint, realSolReserves: bigint, isMayhemMode = false, isCashbackCoin = false, quoteMint = WSOL_TOKEN_ACCOUNT): BondingCurveAccount {
    return new BondingCurveAccount({account: bondingCurve.equals(PublicKey.default) ? getBondingCurvePda(mint) : bondingCurve, creator, virtualTokenReserves, virtualSolReserves, realTokenReserves, realSolReserves, tokenTotalSupply: 1_000_000_000_000_000n, isMayhemMode, isCashbackCoin, quoteMint: BondingCurveAccount.normalizeQuoteMint(quoteMint)});
  }
  getCreatorVaultPda(): PublicKey { return getCreatorVaultPda(this.creator); }
  getBuyPrice(amount: bigint): bigint {
    this.validateReserves(); u64(amount); if (this.complete) throw new Error('Curve is complete');
    if (amount === 0n) return 0n;
    const r = this.virtualSolReserves * this.virtualTokenReserves / (this.virtualSolReserves + amount) + 1n;
    if (r > this.virtualTokenReserves) throw new RangeError('Invalid curve reserves');
    const out = low64(this.virtualTokenReserves - r);
    return out < this.realTokenReserves ? out : this.realTokenReserves;
  }
  getSellPrice(amount: bigint, feeBasisPoints = 95n): bigint {
    this.validateReserves(); u64(amount); u64(feeBasisPoints); if (this.complete) throw new Error('Curve is complete');
    if (amount === 0n) return 0n;
    const gross = amount * this.virtualSolReserves / (this.virtualTokenReserves + amount);
    const fee = gross * feeBasisPoints / 10_000n;
    if (fee > gross) throw new RangeError('Fee exceeds output');
    return low64(gross - fee);
  }
  getMarketCapSol(): bigint { this.validateReserves(); return this.virtualTokenReserves === 0n ? 0n : low64(this.tokenTotalSupply * this.virtualSolReserves / this.virtualTokenReserves); }
  getBuyOutPrice(amount: bigint, feeBasisPoints = 95n): bigint {
    this.validateReserves(); u64(amount); u64(feeBasisPoints);
    const tokens = amount > this.realSolReserves ? amount : this.realSolReserves;
    if (tokens >= this.virtualTokenReserves) throw new RangeError('Invalid buyout reserves');
    const value = tokens * this.virtualSolReserves / (this.virtualTokenReserves - tokens) + 1n;
    return low64(value + value * feeBasisPoints / 10_000n);
  }
  getFinalMarketCapSol(feeBasisPoints = 95n): bigint {
    const value = this.getBuyOutPrice(this.realTokenReserves, feeBasisPoints);
    const tokens = this.virtualTokenReserves - this.realTokenReserves;
    if (tokens < 0n) throw new RangeError('Invalid curve reserves');
    return tokens === 0n ? 0n : low64(this.tokenTotalSupply * (this.virtualSolReserves + value) / tokens);
  }
  getTokenPrice(): number { return (Number(this.virtualSolReserves) / 100_000_000) / (Number(this.virtualTokenReserves) / 100_000); }
}
export const BONDING_CURVE_ACCOUNT_SIZE = 115;
export function decodeBondingCurveAccount(data: Buffer, account = PublicKey.default): BondingCurveAccount | null {
  try {
    const discriminator = Buffer.from([23,183,248,55,96,216,172,96]);
    const rawBody = (data.length === 75 || data.length === 107) && !data.subarray(0, 8).equals(discriminator);
    const prefixed = rawBody ? Buffer.concat([discriminator, data]) : data;
    return new BondingCurveAccount(decodePumpFunBondingCurveData(prefixed, account));
  } catch { return null; }
}
