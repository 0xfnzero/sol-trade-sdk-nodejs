/**
 * Bonding curve account for Pump.fun.
 * Based on sol-trade-sdk Rust implementation.
 */

import { PublicKey } from '@solana/web3.js';
import {
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  INITIAL_VIRTUAL_TOKEN_RESERVES,
  INITIAL_VIRTUAL_SOL_RESERVES,
  INITIAL_REAL_TOKEN_RESERVES,
  TOKEN_TOTAL_SUPPLY,
} from '../calc/pumpfun';

/**
 * Represents the bonding curve account for token pricing
 */
export class BondingCurveAccount {
  discriminator: number = 0;
  account: PublicKey = PublicKey.default;
  virtualTokenReserves: number = 0;
  virtualSolReserves: number = 0;
  realTokenReserves: number = 0;
  realSolReserves: number = 0;
  tokenTotalSupply: number = TOKEN_TOTAL_SUPPLY;
  complete: boolean = false;
  creator: PublicKey = PublicKey.default;
  isMayhemMode: boolean = false;
  isCashbackCoin: boolean = false;

  constructor(fields?: Partial<BondingCurveAccount>) {
    if (fields) {
      Object.assign(this, fields);
    }
  }

  /**
   * Create from dev trade data
   */
  static fromDevTrade(
    bondingCurve: PublicKey,
    mint: PublicKey,
    devTokenAmount: number,
    devSolAmount: number,
    creator: PublicKey,
    isMayhemMode: boolean = false,
    isCashbackCoin: boolean = false,
  ): BondingCurveAccount {
    return new BondingCurveAccount({
      discriminator: 0,
      account: bondingCurve,
      virtualTokenReserves: INITIAL_VIRTUAL_TOKEN_RESERVES - devTokenAmount,
      virtualSolReserves: INITIAL_VIRTUAL_SOL_RESERVES + devSolAmount,
      realTokenReserves: INITIAL_REAL_TOKEN_RESERVES - devTokenAmount,
      realSolReserves: devSolAmount,
      tokenTotalSupply: TOKEN_TOTAL_SUPPLY,
      complete: false,
      creator,
      isMayhemMode,
      isCashbackCoin,
    });
  }

  /**
   * Create from trade data
   */
  static fromTrade(
    bondingCurve: PublicKey,
    mint: PublicKey,
    creator: PublicKey,
    virtualTokenReserves: number,
    virtualSolReserves: number,
    realTokenReserves: number,
    realSolReserves: number,
    isMayhemMode: boolean = false,
    isCashbackCoin: boolean = false,
  ): BondingCurveAccount {
    return new BondingCurveAccount({
      discriminator: 0,
      account: bondingCurve,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply: TOKEN_TOTAL_SUPPLY,
      complete: false,
      creator,
      isMayhemMode,
      isCashbackCoin,
    });
  }

  /**
   * Calculate tokens received for given SOL amount
   */
  getBuyPrice(amount: number): number {
    if (this.complete) {
      throw new Error('Curve is complete');
    }

    return getBuyTokenAmountFromSolAmount(
      this.virtualTokenReserves,
      this.virtualSolReserves,
      this.realTokenReserves,
      this.creator.toBytes(),
      amount,
    );
  }

  /**
   * Calculate SOL received for given token amount
   */
  getSellPrice(amount: number): number {
    if (this.complete) {
      throw new Error('Curve is complete');
    }

    return getSellSolAmountFromTokenAmount(
      this.virtualTokenReserves,
      this.virtualSolReserves,
      this.creator.toBytes(),
      amount,
    );
  }

  /**
   * Calculate current market cap in SOL
   */
  getMarketCapSol(): number {
    if (this.virtualTokenReserves === 0) {
      return 0;
    }

    const pricePerToken = this.virtualSolReserves / this.virtualTokenReserves;
    return (pricePerToken * this.tokenTotalSupply) / 1e9;
  }

  /**
   * Calculate price to buy out all remaining tokens
   */
  getBuyOutPrice(amount: number): number {
    if (this.complete) {
      throw new Error('Curve is complete');
    }

    // Rough estimate: current price * amount
    if (this.virtualTokenReserves === 0) {
      return 0;
    }

    const priceRatio = this.virtualSolReserves / this.virtualTokenReserves;
    return Math.floor(priceRatio * amount);
  }
}
