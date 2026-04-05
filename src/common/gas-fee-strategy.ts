/**
 * Gas Fee Strategy for Sol Trade SDK
 */

// TradeType is defined in index.ts to avoid circular imports
export enum TradeType {
  Buy = 'Buy',
  Sell = 'Sell',
}

// SwqosType is defined locally to avoid circular imports
export enum SwqosType {
  Default = 'Default',
  Jito = 'Jito',
  Bloxroute = 'Bloxroute',
  ZeroSlot = 'ZeroSlot',
  Temporal = 'Temporal',
  FlashBlock = 'FlashBlock',
  BlockRazor = 'BlockRazor',
  Node1 = 'Node1',
  Astralane = 'Astralane',
  NextBlock = 'NextBlock',
  Helius = 'Helius',
}

export enum GasFeeStrategyType {
  Normal = 'Normal',
  LowTipHighCuPrice = 'LowTipHighCuPrice',
  HighTipLowCuPrice = 'HighTipLowCuPrice',
}

export interface GasFeeStrategyValue {
  cuLimit: number;
  cuPrice: number;
  tip: number;
}

interface StrategyKey {
  swqosType: SwqosType;
  tradeType: TradeType;
  strategyType: GasFeeStrategyType;
}

export class GasFeeStrategy {
  private strategies: Map<string, GasFeeStrategyValue> = new Map();

  constructor() {}

  /**
   * Set global fee strategy for all SWQOS types
   */
  setGlobalFeeStrategy(
    buyCuLimit: number,
    sellCuLimit: number,
    buyCuPrice: number,
    sellCuPrice: number,
    buyTip: number,
    sellTip: number
  ): void {
    const allTypes = [
      SwqosType.Jito,
      SwqosType.NextBlock,
      SwqosType.ZeroSlot,
      SwqosType.Temporal,
      SwqosType.Bloxroute,
      SwqosType.Node1,
      SwqosType.FlashBlock,
      SwqosType.BlockRazor,
      SwqosType.Astralane,
      SwqosType.Stellium,
      SwqosType.Lightspeed,
      SwqosType.Soyas,
      SwqosType.Speedlanding,
      SwqosType.Helius,
    ];

    for (const swqosType of allTypes) {
      this.set(swqosType, TradeType.Buy, GasFeeStrategyType.Normal, buyCuLimit, buyCuPrice, buyTip);
      this.set(swqosType, TradeType.Sell, GasFeeStrategyType.Normal, sellCuLimit, sellCuPrice, sellTip);
    }

    // Default (RPC) has no tip
    this.set(SwqosType.Default, TradeType.Buy, GasFeeStrategyType.Normal, buyCuLimit, buyCuPrice, 0);
    this.set(SwqosType.Default, TradeType.Sell, GasFeeStrategyType.Normal, sellCuLimit, sellCuPrice, 0);
  }

  /**
   * Set high-low fee strategies for multiple SWQOS types
   */
  setHighLowFeeStrategies(
    swqosTypes: SwqosType[],
    tradeType: TradeType,
    cuLimit: number,
    lowCuPrice: number,
    highCuPrice: number,
    lowTip: number,
    highTip: number
  ): void {
    for (const swqosType of swqosTypes) {
      this.delete(swqosType, tradeType, GasFeeStrategyType.Normal);
      this.set(swqosType, tradeType, GasFeeStrategyType.LowTipHighCuPrice, cuLimit, highCuPrice, lowTip);
      this.set(swqosType, tradeType, GasFeeStrategyType.HighTipLowCuPrice, cuLimit, lowCuPrice, highTip);
    }
  }

  /**
   * Set a specific gas fee strategy
   */
  set(
    swqosType: SwqosType,
    tradeType: TradeType,
    strategyType: GasFeeStrategyType,
    cuLimit: number,
    cuPrice: number,
    tip: number
  ): void {
    // Remove conflicting strategies
    if (strategyType === GasFeeStrategyType.Normal) {
      this.delete(swqosType, tradeType, GasFeeStrategyType.LowTipHighCuPrice);
      this.delete(swqosType, tradeType, GasFeeStrategyType.HighTipLowCuPrice);
    } else {
      this.delete(swqosType, tradeType, GasFeeStrategyType.Normal);
    }

    const key = this.getKey(swqosType, tradeType, strategyType);
    this.strategies.set(key, { cuLimit, cuPrice, tip });
  }

  /**
   * Get a specific gas fee strategy
   */
  get(
    swqosType: SwqosType,
    tradeType: TradeType,
    strategyType: GasFeeStrategyType
  ): GasFeeStrategyValue | undefined {
    const key = this.getKey(swqosType, tradeType, strategyType);
    return this.strategies.get(key);
  }

  /**
   * Delete a specific gas fee strategy
   */
  delete(swqosType: SwqosType, tradeType: TradeType, strategyType: GasFeeStrategyType): void {
    const key = this.getKey(swqosType, tradeType, strategyType);
    this.strategies.delete(key);
  }

  /**
   * Delete all strategies for a SWQOS type and trade type
   */
  deleteAll(swqosType: SwqosType, tradeType: TradeType): void {
    this.delete(swqosType, tradeType, GasFeeStrategyType.Normal);
    this.delete(swqosType, tradeType, GasFeeStrategyType.LowTipHighCuPrice);
    this.delete(swqosType, tradeType, GasFeeStrategyType.HighTipLowCuPrice);
  }

  /**
   * Get all strategies for a trade type
   */
  getStrategies(tradeType: TradeType): Array<{
    swqosType: SwqosType;
    strategyType: GasFeeStrategyType;
    value: GasFeeStrategyValue;
  }> {
    const results: Array<{
      swqosType: SwqosType;
      strategyType: GasFeeStrategyType;
      value: GasFeeStrategyValue;
    }> = [];

    this.strategies.forEach((value, key) => {
      const parsed = this.parseKey(key);
      if (parsed.tradeType === tradeType) {
        results.push({
          swqosType: parsed.swqosType,
          strategyType: parsed.strategyType,
          value,
        });
      }
    });

    return results;
  }

  /**
   * Update buy tip for all strategies
   */
  updateBuyTip(buyTip: number): void {
    this.strategies.forEach((value, key) => {
      const parsed = this.parseKey(key);
      if (parsed.tradeType === TradeType.Buy) {
        value.tip = buyTip;
        this.strategies.set(key, value);
      }
    });
  }

  /**
   * Update sell tip for all strategies
   */
  updateSellTip(sellTip: number): void {
    this.strategies.forEach((value, key) => {
      const parsed = this.parseKey(key);
      if (parsed.tradeType === TradeType.Sell) {
        value.tip = sellTip;
        this.strategies.set(key, value);
      }
    });
  }

  /**
   * Clear all strategies
   */
  clear(): void {
    this.strategies.clear();
  }

  private getKey(
    swqosType: SwqosType,
    tradeType: TradeType,
    strategyType: GasFeeStrategyType
  ): string {
    return `${swqosType}:${tradeType}:${strategyType}`;
  }

  private parseKey(key: string): StrategyKey {
    const [swqosType, tradeType, strategyType] = key.split(':');
    return {
      swqosType: swqosType as SwqosType,
      tradeType: tradeType as TradeType,
      strategyType: strategyType as GasFeeStrategyType,
    };
  }
}

/**
 * Create a new gas fee strategy with defaults
 */
export function createGasFeeStrategy(): GasFeeStrategy {
  const strategy = new GasFeeStrategy();
  strategy.setGlobalFeeStrategy(200000, 200000, 100000, 100000, 0.001, 0.001);
  return strategy;
}
