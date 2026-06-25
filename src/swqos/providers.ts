/**
 * SWQOS Providers for Sol Trade SDK
 * Implements Rust v4.0.21 SWQOS providers plus legacy extended RPC provider
 * classes kept for source compatibility.
 */

import {
  AstralaneTransport,
  TradeError,
  TradeType,
  SwqosTransport,
  isSwqosTypeBlacklisted,
} from '../index';
import {
  AstralaneClient as SenderAstralaneClient,
  BlockRazorClient as SenderBlockRazorClient,
  ClientFactory as SenderClientFactory,
  SolamiClient as SenderSolamiClient,
  SpeedlandingClient as SenderSpeedlandingClient,
} from './clients';

// ===== Enums =====

/**
 * SWQOS service provider types
 */
export enum SwqosType {
  Jito = 'Jito',
  NextBlock = 'NextBlock',
  ZeroSlot = 'ZeroSlot',
  Temporal = 'Temporal',
  Bloxroute = 'Bloxroute',
  Node1 = 'Node1',
  FlashBlock = 'FlashBlock',
  BlockRazor = 'BlockRazor',
  Astralane = 'Astralane',
  Stellium = 'Stellium',
  Lightspeed = 'Lightspeed',
  Soyas = 'Soyas',
  Speedlanding = 'Speedlanding',
  Helius = 'Helius',
  Solami = 'Solami',
  /** Legacy extended RPC class, not part of Rust v4.0.21 SWQOS parity. */
  Triton = 'Triton',
  /** Legacy extended RPC class, not part of Rust v4.0.21 SWQOS parity. */
  QuickNode = 'QuickNode',
  /** Legacy extended RPC class, not part of Rust v4.0.21 SWQOS parity. */
  Syndica = 'Syndica',
  /** Legacy extended RPC class, not part of Rust v4.0.21 SWQOS parity. */
  Figment = 'Figment',
  /** Legacy extended RPC class, not part of Rust v4.0.21 SWQOS parity. */
  Alchemy = 'Alchemy',
  Default = 'Default',
}

/**
 * SWQOS service regions
 */
export enum SwqosRegion {
  NewYork = 'NewYork',
  Frankfurt = 'Frankfurt',
  Amsterdam = 'Amsterdam',
  Dublin = 'Dublin',
  SLC = 'SLC',
  Tokyo = 'Tokyo',
  Singapore = 'Singapore',
  London = 'London',
  LosAngeles = 'LosAngeles',
  Default = 'Default',
}

/**
 * MEV protection levels
 */
export enum MevProtectionLevel {
  None = 'none',
  Basic = 'basic',
  Enhanced = 'enhanced',
  Maximum = 'maximum',
}

// ===== Types =====

/**
 * Transaction submission result
 */
export interface TransactionResult {
  success: boolean;
  signature?: string;
  provider: string;
  latencyMs: number;
  slot?: number;
  error?: string;
  bundleId?: string;
  confirmationStatus?: string;
}

/**
 * SWQOS configuration
 */
export interface SwqosConfig {
  swqosType: SwqosType;
  apiKey?: string;
  region?: SwqosRegion;
  url?: string;
  timeoutMs?: number;
  maxRetries?: number;
  enabled?: boolean;
  priorityFeeMultiplier?: number;
  mevProtection?: MevProtectionLevel;
  transport?: SwqosTransport;
  astralaneTransport?: AstralaneTransport;
  swqosOnly?: boolean;
  customHeaders?: Record<string, string>;
  rateLimitRps?: number;
}

/**
 * Client statistics
 */
export interface ClientStats {
  requests: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  lastError?: string;
}

// ===== Base Client =====

/**
 * Base SWQOS client class
 */
export abstract class SwqosClient {
  protected _stats: ClientStats = {
    requests: 0,
    successes: 0,
    failures: 0,
    avgLatencyMs: 0,
  };
  protected _lastRequestTime = 0;
  protected _rateLimitDelay: number;

  constructor(public readonly config: SwqosConfig) {
    const rateLimitRps = config.rateLimitRps ?? 100;
    this._rateLimitDelay = rateLimitRps > 0 ? 1000 / rateLimitRps : 0;
  }

  /**
   * Submit transaction to SWQOS provider
   */
  abstract submitTransaction(transaction: Buffer, tip?: number): Promise<TransactionResult>;

  /**
   * Submit transaction bundle
   */
  async submitBundle(transactions: Buffer[], tip?: number): Promise<TransactionResult> {
    // Default: submit first transaction only
    if (transactions.length > 0) {
      return this.submitTransaction(transactions[0]!, tip);
    }
    return {
      success: false,
      provider: this.config.swqosType,
      latencyMs: 0,
      error: 'Empty bundle',
    };
  }

  /**
   * Get recommended tip amount in lamports
   */
  async getTipRecommendation(): Promise<number> {
    return 10000; // Default 0.00001 SOL
  }

  /**
   * Get client statistics
   */
  getStats(): ClientStats {
    return { ...this._stats };
  }

  /**
   * Update client statistics
   */
  protected updateStats(success: boolean, latencyMs: number, error?: string): void {
    this._stats.requests++;
    if (success) {
      this._stats.successes++;
    } else {
      this._stats.failures++;
      this._stats.lastError = error;
    }

    // Update average latency
    const n = this._stats.requests;
    this._stats.avgLatencyMs = Math.floor(
      (this._stats.avgLatencyMs * (n - 1) + latencyMs) / n
    );
  }

  /**
   * Check and enforce rate limiting
   */
  protected async rateLimitCheck(): Promise<void> {
    if (this._rateLimitDelay <= 0) {
      return;
    }

    const elapsed = Date.now() - this._lastRequestTime;
    if (elapsed < this._rateLimitDelay) {
      await this.sleep(this._rateLimitDelay - elapsed);
    }

    this._lastRequestTime = Date.now();
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP POST request
   */
  protected async post(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new TradeError(response.status, `HTTP error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get provider type
   */
  abstract getProviderType(): SwqosType;

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }
}

async function submitViaSenderClient(
  provider: string,
  startTime: number,
  transaction: Buffer,
  submit: () => Promise<string>,
  updateStats: (success: boolean, latencyMs: number, error?: string) => void,
): Promise<TransactionResult> {
  try {
    const signature = await submit();
    const latencyMs = Date.now() - startTime;
    updateStats(true, latencyMs);
    return {
      success: true,
      signature,
      provider,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    updateStats(false, latencyMs, errorMsg);
    return {
      success: false,
      provider,
      latencyMs,
      error: errorMsg,
    };
  }
}

class SenderBackedProviderClient extends SwqosClient {
  async submitTransaction(transaction: Buffer, _tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();
    const sender = SenderClientFactory.createClient(
      {
        type: this.config.swqosType as any,
        region: (this.config.region ?? SwqosRegion.Default) as any,
        customUrl: this.config.url,
        apiKey: this.config.apiKey,
        mevProtection: this.config.mevProtection !== MevProtectionLevel.None,
        transport: this.config.transport,
        astralaneTransport: this.config.astralaneTransport,
        swqosOnly: this.config.swqosOnly,
      },
      '',
    );
    return submitViaSenderClient(
      this.config.swqosType,
      startTime,
      transaction,
      () => sender.sendTransaction(TradeType.Buy, transaction, false),
      this.updateStats.bind(this),
    );
  }

  getProviderType(): SwqosType {
    return this.config.swqosType;
  }
}

// ===== Provider Implementations =====

/**
 * Jito SWQOS client - MEV protection and bundle submission
 */
export class JitoClient extends SwqosClient {
  private bundleUrl: string;
  private authToken?: string;

  private static readonly DEFAULT_ENDPOINTS: Record<SwqosRegion, string> = {
    [SwqosRegion.NewYork]: 'https://mainnet.block-engine.jito.wtf',
    [SwqosRegion.Frankfurt]: 'https://frankfurt.mainnet.block-engine.jito.wtf',
    [SwqosRegion.Amsterdam]: 'https://amsterdam.mainnet.block-engine.jito.wtf',
    [SwqosRegion.Dublin]: 'https://dublin.mainnet.block-engine.jito.wtf',
    [SwqosRegion.Tokyo]: 'https://tokyo.mainnet.block-engine.jito.wtf',
    [SwqosRegion.SLC]: 'https://slc.mainnet.block-engine.jito.wtf',
    [SwqosRegion.London]: 'https://mainnet.block-engine.jito.wtf',
    [SwqosRegion.LosAngeles]: 'https://mainnet.block-engine.jito.wtf',
    [SwqosRegion.Singapore]: 'https://mainnet.block-engine.jito.wtf',
    [SwqosRegion.Default]: 'https://mainnet.block-engine.jito.wtf',
  };

  constructor(config: SwqosConfig) {
    super(config);
    this.bundleUrl = config.url || this.getEndpointForRegion(config.region || SwqosRegion.Default);
    this.authToken = config.apiKey;
  }

  private getEndpointForRegion(region: SwqosRegion): string {
    return JitoClient.DEFAULT_ENDPOINTS[region] || JitoClient.DEFAULT_ENDPOINTS[SwqosRegion.Default];
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [encoded, { encoding: 'base64' }],
      };

      const headers: Record<string, string> = {};
      if (this.authToken) {
        headers['X-Jito-Auth-Token'] = this.authToken;
      }

      const result = (await this.post(`${this.bundleUrl}/api/v1/bundles`, payload, headers)) as any;

      if (result.error) {
        throw new TradeError(result.error.code || 500, result.error.message);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.result,
        provider: 'Jito',
        latencyMs,
        bundleId: `bundle_${Date.now()}`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Jito',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  async submitBundle(transactions: Buffer[], tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encodedTxs = transactions.map(tx => tx.toString('base64'));
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [encodedTxs],
      };

      const headers: Record<string, string> = {};
      if (this.authToken) {
        headers['X-Jito-Auth-Token'] = this.authToken;
      }

      const result = (await this.post(`${this.bundleUrl}/api/v1/bundles`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.result,
        provider: 'Jito',
        latencyMs,
        bundleId: `bundle_${Date.now()}`,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Jito',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  async getTipRecommendation(): Promise<number> {
    // Jito typically recommends 10000-100000 lamports
    return 50000;
  }

  getProviderType(): SwqosType {
    return SwqosType.Jito;
  }
}

/**
 * Bloxroute SWQOS client - High-speed transaction relay
 */
export class BloxrouteClient extends SwqosClient {
  private gatewayUrl: string;
  private wsUrl: string;

  private static readonly DEFAULT_ENDPOINTS: Record<SwqosRegion, string> = {
    [SwqosRegion.NewYork]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.Frankfurt]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.Amsterdam]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.Dublin]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.Tokyo]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.SLC]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.London]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.LosAngeles]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.Singapore]: 'https://solana.dex.blxrbdn.com',
    [SwqosRegion.Default]: 'https://solana.dex.blxrbdn.com',
  };

  constructor(config: SwqosConfig) {
    super(config);
    this.gatewayUrl = config.url || BloxrouteClient.DEFAULT_ENDPOINTS[config.region || SwqosRegion.Default];
    this.wsUrl = this.gatewayUrl.replace('https://', 'wss://');
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [encoded],
      };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = this.config.apiKey;
      }

      const result = (await this.post(`${this.gatewayUrl}/api/v2/submit`, payload, headers)) as any;

      if (result.reason) {
        throw new TradeError(500, result.reason);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Bloxroute',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Bloxroute',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Bloxroute;
  }
}

/**
 * ZeroSlot SWQOS client - Zero-slot latency
 */
export class ZeroSlotClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.zeroslot.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      if (result.error) {
        throw new TradeError(500, result.error);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'ZeroSlot',
        latencyMs,
        slot: result.slot,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'ZeroSlot',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.ZeroSlot;
  }
}

/**
 * NextBlock SWQOS client - Next block inclusion guarantee
 */
export class NextBlockClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.nextblock.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'NextBlock',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'NextBlock',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.NextBlock;
  }
}

/**
 * Temporal SWQOS client - Time-based execution
 */
export class TemporalClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.temporal.trade';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = this.config.apiKey;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      if (result.error) {
        throw new TradeError(500, result.error);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Temporal',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Temporal',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Temporal;
  }
}

/**
 * Node1 SWQOS client - Premium node access
 */
export class Node1Client extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.node1.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      if (result.error) {
        throw new TradeError(500, result.error);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Node1',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Node1',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Node1;
  }
}

/**
 * FlashBlock SWQOS client - Flash block inclusion
 */
export class FlashBlockClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.flashblock.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['X-API-Key'] = this.config.apiKey;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      if (result.error) {
        throw new TradeError(500, result.error);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'FlashBlock',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'FlashBlock',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.FlashBlock;
  }
}

/**
 * BlockRazor SWQOS client - Block optimization
 */
export class BlockRazorClient extends SwqosClient {
  private endpoint: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.endpoint = config.url || 'http://ny.solana.blockrazor.xyz:443/v2/sendTransaction';
  }

  async submitTransaction(transaction: Buffer, _tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();
    const client = new SenderBlockRazorClient('', this.endpoint, this.config.apiKey);
    return submitViaSenderClient(
      'BlockRazor',
      startTime,
      transaction,
      () => client.sendTransaction(TradeType.Buy, transaction, false),
      this.updateStats.bind(this),
    );
  }

  getProviderType(): SwqosType {
    return SwqosType.BlockRazor;
  }
}

/**
 * Astralane SWQOS client - High-speed relay
 */
export class AstralaneClient extends SwqosClient {
  private endpoint: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.endpoint = config.url || 'http://ny.gateway.astralane.io/irisb';
  }

  async submitTransaction(transaction: Buffer, _tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();
    const client = new SenderAstralaneClient('', this.endpoint, this.config.apiKey);
    return submitViaSenderClient(
      'Astralane',
      startTime,
      transaction,
      () => client.sendTransaction(TradeType.Buy, transaction, false),
      this.updateStats.bind(this),
    );
  }

  getProviderType(): SwqosType {
    return SwqosType.Astralane;
  }
}

/**
 * Stellium SWQOS client - Premium infrastructure
 */
export class StelliumClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.stellium.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Stellium',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Stellium',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Stellium;
  }
}

/**
 * Lightspeed SWQOS client - Ultra-low latency
 */
export class LightspeedClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.lightspeed.trade';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Lightspeed',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Lightspeed',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Lightspeed;
  }
}

/**
 * Soyas SWQOS client - MEV protection
 */
export class SoyasClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.soyas.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Soyas',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Soyas',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Soyas;
  }
}

/**
 * Speedlanding SWQOS client - Fast inclusion
 */
export class SpeedlandingClient extends SwqosClient {
  private endpoint: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.endpoint = config.url || 'nyc.speedlanding.trade:17778';
  }

  async submitTransaction(transaction: Buffer, _tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();
    const client = new SenderSpeedlandingClient('', this.endpoint, this.config.apiKey);
    return submitViaSenderClient(
      'Speedlanding',
      startTime,
      transaction,
      () => client.sendTransaction(TradeType.Buy, transaction, false),
      this.updateStats.bind(this),
    );
  }

  getProviderType(): SwqosType {
    return SwqosType.Speedlanding;
  }
}

/**
 * Solami SWQOS client - Rust v4.0.21 parity provider
 */
export class SolamiClient extends SwqosClient {
  private endpoint: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.endpoint = config.url || 'beam.solami.dev:11000';
  }

  async submitTransaction(transaction: Buffer, _tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();
    const client = new SenderSolamiClient('', this.endpoint, this.config.apiKey);
    return submitViaSenderClient(
      'Solami',
      startTime,
      transaction,
      () => client.sendTransaction(TradeType.Buy, transaction, false),
      this.updateStats.bind(this),
    );
  }

  getProviderType(): SwqosType {
    return SwqosType.Solami;
  }
}

/**
 * Helius SWQOS client - Enhanced RPC
 */
export class HeliusClient extends SwqosClient {
  private apiUrl: string;

  private static readonly DEFAULT_ENDPOINTS: Record<SwqosRegion, string> = {
    [SwqosRegion.NewYork]: 'https://api.helius-rpc.com',
    [SwqosRegion.Frankfurt]: 'https://api.helius-rpc.com',
    [SwqosRegion.Amsterdam]: 'https://api.helius-rpc.com',
    [SwqosRegion.Dublin]: 'https://api.helius-rpc.com',
    [SwqosRegion.Tokyo]: 'https://api.helius-rpc.com',
    [SwqosRegion.SLC]: 'https://api.helius-rpc.com',
    [SwqosRegion.London]: 'https://api.helius-rpc.com',
    [SwqosRegion.LosAngeles]: 'https://api.helius-rpc.com',
    [SwqosRegion.Singapore]: 'https://api.helius-rpc.com',
    [SwqosRegion.Default]: 'https://api.helius-rpc.com',
  };

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || HeliusClient.DEFAULT_ENDPOINTS[config.region || SwqosRegion.Default];
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [encoded, { encoding: 'base64' }],
      };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(this.apiUrl, payload, headers)) as any;

      if (result.error) {
        throw new TradeError(result.error.code || 500, result.error.message);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.result,
        provider: 'Helius',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Helius',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Helius;
  }
}

/**
 * Triton SWQOS client - High-performance RPC
 */
export class TritonClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.triton.one';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Triton',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Triton',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Triton;
  }
}

/**
 * QuickNode SWQOS client - Enterprise RPC
 */
export class QuickNodeClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.quicknode.com';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'QuickNode',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'QuickNode',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.QuickNode;
  }
}

/**
 * Syndica SWQOS client - Premium infrastructure
 */
export class SyndicaClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.syndica.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Syndica',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Syndica',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Syndica;
  }
}

/**
 * Figment SWQOS client - Enterprise staking RPC
 */
export class FigmentClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.figment.io';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Figment',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Figment',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Figment;
  }
}

/**
 * Alchemy SWQOS client - Web3 infrastructure
 */
export class AlchemyClient extends SwqosClient {
  private apiUrl: string;

  constructor(config: SwqosConfig) {
    super(config);
    this.apiUrl = config.url || 'https://api.alchemy.com';
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = { transaction: encoded, tip };

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const result = (await this.post(`${this.apiUrl}/api/v1/submit`, payload, headers)) as any;

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.signature,
        provider: 'Alchemy',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Alchemy',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Alchemy;
  }
}

/**
 * Default SWQOS client - Standard RPC fallback
 */
export class DefaultClient extends SwqosClient {
  private rpcUrl: string;

  constructor(config: SwqosConfig, rpcUrl: string) {
    super(config);
    this.rpcUrl = rpcUrl;
  }

  async submitTransaction(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    await this.rateLimitCheck();
    const startTime = Date.now();

    try {
      const encoded = transaction.toString('base64');
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [encoded, { encoding: 'base64' }],
      };

      const result = (await this.post(this.rpcUrl, payload)) as any;

      if (result.error) {
        throw new TradeError(result.error.code || 500, result.error.message);
      }

      const latencyMs = Date.now() - startTime;
      this.updateStats(true, latencyMs);

      return {
        success: true,
        signature: result.result,
        provider: 'Default',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStats(false, latencyMs, errorMsg);

      return {
        success: false,
        provider: 'Default',
        latencyMs,
        error: errorMsg,
      };
    }
  }

  getProviderType(): SwqosType {
    return SwqosType.Default;
  }
}

// ===== Factory =====

/**
 * Factory for creating SWQOS clients
 */
export class SwqosClientFactory {
  private static readonly CLIENT_MAP: Partial<Record<SwqosType, new (config: SwqosConfig) => SwqosClient>> = {
    [SwqosType.Jito]: SenderBackedProviderClient,
    [SwqosType.Bloxroute]: SenderBackedProviderClient,
    [SwqosType.ZeroSlot]: SenderBackedProviderClient,
    [SwqosType.Temporal]: SenderBackedProviderClient,
    [SwqosType.Node1]: SenderBackedProviderClient,
    [SwqosType.FlashBlock]: SenderBackedProviderClient,
    [SwqosType.BlockRazor]: BlockRazorClient,
    [SwqosType.Astralane]: AstralaneClient,
    [SwqosType.Stellium]: SenderBackedProviderClient,
    [SwqosType.Lightspeed]: SenderBackedProviderClient,
    [SwqosType.Soyas]: SenderBackedProviderClient,
    [SwqosType.Speedlanding]: SpeedlandingClient,
    [SwqosType.Helius]: SenderBackedProviderClient,
    [SwqosType.Solami]: SolamiClient,
    [SwqosType.Default]: DefaultClient as any,
  };

  /**
   * Create SWQOS client based on config type
   */
  static createClient(config: SwqosConfig): SwqosClient {
    if (isSwqosTypeBlacklisted(config.swqosType as any)) {
      throw new TradeError(
        400,
        `SWQOS type is blacklisted by Rust v4.0.21 parity: ${config.swqosType}`
      );
    }
    const ClientClass = this.CLIENT_MAP[config.swqosType];
    if (!ClientClass) {
      throw new TradeError(400, `Unknown SWQOS type: ${config.swqosType}`);
    }
    return new ClientClass(config);
  }

  /**
   * Get list of supported provider types
   */
  static getSupportedTypes(): SwqosType[] {
    return Object.keys(this.CLIENT_MAP) as SwqosType[];
  }
}

// ===== Manager =====

/**
 * Manager for multiple SWQOS clients
 */
export class SwqosManager {
  private clients: Map<SwqosType, SwqosClient> = new Map();
  private fallbackOrder: SwqosType[] = [];

  /**
   * Add a SWQOS client
   */
  addClient(client: SwqosClient): this {
    this.clients.set(client.config.swqosType, client);
    if (!this.fallbackOrder.includes(client.config.swqosType)) {
      this.fallbackOrder.push(client.config.swqosType);
    }
    return this;
  }

  /**
   * Remove a SWQOS client
   */
  removeClient(swqosType: SwqosType): this {
    this.clients.delete(swqosType);
    const index = this.fallbackOrder.indexOf(swqosType);
    if (index > -1) {
      this.fallbackOrder.splice(index, 1);
    }
    return this;
  }

  /**
   * Get SWQOS client by type
   */
  getClient(swqosType: SwqosType): SwqosClient | undefined {
    return this.clients.get(swqosType);
  }

  /**
   * Get all enabled clients
   */
  getAllClients(): SwqosClient[] {
    return Array.from(this.clients.values()).filter(c => c.isEnabled());
  }

  /**
   * Get client with best performance stats
   */
  getBestClient(): SwqosClient | undefined {
    const enabled = this.getAllClients();
    if (enabled.length === 0) {
      return undefined;
    }

    // Sort by success rate and latency
    const score = (client: SwqosClient): number => {
      const stats = client.getStats();
      if (stats.requests === 0) {
        return 0;
      }
      const successRate = stats.successes / stats.requests;
      // Higher success rate and lower latency = better score
      return (successRate * 1000) / (stats.avgLatencyMs + 1);
    };

    return enabled.reduce((best, current) =>
      score(current) > score(best) ? current : best
    );
  }

  /**
   * Set fallback order for providers
   */
  setFallbackOrder(order: SwqosType[]): void {
    this.fallbackOrder = order.filter(t => this.clients.has(t));
  }

  /**
   * Submit with automatic fallback
   */
  async submitWithFallback(transaction: Buffer, tip = 0): Promise<TransactionResult> {
    for (const swqosType of this.fallbackOrder) {
      const client = this.clients.get(swqosType);
      if (!client || !client.isEnabled()) {
        continue;
      }

      const result = await client.submitTransaction(transaction, tip);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      provider: 'fallback',
      latencyMs: 0,
      error: 'All providers failed',
    };
  }

  /**
   * Submit transaction to all enabled providers
   */
  async submitToAll(transaction: Buffer, tip = 0): Promise<{
    results: TransactionResult[];
    total: number;
    successful: number;
  }> {
    const clients = this.getAllClients();
    const promises = clients.map(client => client.submitTransaction(transaction, tip));

    const results = await Promise.all(promises);

    return {
      results,
      total: promises.length,
      successful: results.filter(r => r.success).length,
    };
  }

  /**
   * Submit bundle to all providers that support it
   */
  async submitBundleToAll(
    transactions: Buffer[],
    tip = 0
  ): Promise<{
    results: TransactionResult[];
    total: number;
    successful: number;
  }> {
    const clients = this.getAllClients();
    const promises = clients.map(client => client.submitBundle(transactions, tip));

    const results = await Promise.all(promises);

    return {
      results,
      total: promises.length,
      successful: results.filter(r => r.success).length,
    };
  }

  /**
   * Get stats for all clients
   */
  getAllStats(): Map<SwqosType, ClientStats> {
    const stats = new Map<SwqosType, ClientStats>();
    for (const [type, client] of this.clients) {
      stats.set(type, client.getStats());
    }
    return stats;
  }

  /**
   * Get aggregated stats across all clients
   */
  getAggregatedStats(): {
    totalRequests: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
    avgLatencyMs: number;
    activeProviders: number;
  } {
    let totalRequests = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalLatency = 0;

    for (const client of this.clients.values()) {
      const stats = client.getStats();
      totalRequests += stats.requests;
      totalSuccesses += stats.successes;
      totalFailures += stats.failures;
      totalLatency += stats.avgLatencyMs;
    }

    const clientCount = this.clients.size;

    return {
      totalRequests,
      totalSuccesses,
      totalFailures,
      successRate: totalRequests > 0 ? totalSuccesses / totalRequests : 0,
      avgLatencyMs: clientCount > 0 ? totalLatency / clientCount : 0,
      activeProviders: this.getAllClients().length,
    };
  }
}
