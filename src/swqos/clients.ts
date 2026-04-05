/**
 * SWQOS Clients for Sol Trade SDK
 * Implements various SWQOS (Solana Write Queue Operating System) providers.
 */

import { Connection, PublicKey, Transaction, SendOptions } from '@solana/web3.js';
import { SwqosType, SwqosRegion, TradeType, TradeError } from '../index';

// ===== Constants =====

export const MIN_TIP_JITO = 0.001;
export const MIN_TIP_BLOXROUTE = 0.0003;
export const MIN_TIP_ZERO_SLOT = 0.0001;
export const MIN_TIP_TEMPORAL = 0.0001;
export const MIN_TIP_FLASH_BLOCK = 0.0001;
export const MIN_TIP_BLOCK_RAZOR = 0.0001;
export const MIN_TIP_NODE1 = 0.0001;
export const MIN_TIP_ASTRALANE = 0.0001;
export const MIN_TIP_HELIUS = 0.000005;
export const MIN_TIP_DEFAULT = 0.0;

// Jito endpoints by region
export const JITO_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'amsterdam.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Frankfurt]: 'frankfurt.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Amsterdam]: 'amsterdam.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Tokyo]: 'tokyo.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Singapore]: 'amsterdam.mainnet.block-engine.jito.wtf',
};

// ===== SWQOS Client Interface =====

export interface SwqosClient {
  sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string>;

  sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]>;

  getTipAccount(): string;
  getSwqosType(): SwqosType;
  minTipSol(): number;
}

// ===== HTTP Client Base =====

abstract class BaseClient implements SwqosClient {
  abstract getTipAccount(): string;
  abstract getSwqosType(): SwqosType;
  abstract minTipSol(): number;
  abstract sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string>;

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    const signatures: string[] = [];
    for (const tx of transactions) {
      const sig = await this.sendTransaction(tradeType, tx, waitConfirmation);
      signatures.push(sig);
    }
    return signatures;
  }

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
}

// ===== Jito Client =====

export class JitoClient extends BaseClient {
  private tipAccount = '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmBUvrNei';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['X-Jito-Auth-Token'] = this.authToken;
    }

    const url = `https://${this.endpoint}/api/v1/bundles`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return result.result;
  }

  getTipAccount(): string {
    return this.tipAccount;
  }

  getSwqosType(): SwqosType {
    return SwqosType.Jito;
  }

  minTipSol(): number {
    return MIN_TIP_JITO;
  }
}

// ===== Bloxroute Client =====

export class BloxrouteClient extends BaseClient {
  private tipAccount = 'HWeXY6GuqP3i2vMPUgwt4XPq5LqSvdkfF3R6dQ5ciPfo';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded],
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `https://${this.endpoint}/api/v2/submit`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.reason) {
      throw new TradeError(500, result.reason);
    }

    return result.signature;
  }

  getTipAccount(): string {
    return this.tipAccount;
  }

  getSwqosType(): SwqosType {
    return SwqosType.Bloxroute;
  }

  minTipSol(): number {
    return MIN_TIP_BLOXROUTE;
  }
}

// ===== ZeroSlot Client =====

export class ZeroSlotClient extends BaseClient {
  private tipAccount = 'zeroslotH4gNdW3DyUr3QYjE3QiPYq78mi4jh7U3YyHY';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = { transaction: encoded };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const url = `https://${this.endpoint}/api/v1/submit`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(500, result.error);
    }

    return result.signature;
  }

  getTipAccount(): string {
    return this.tipAccount;
  }

  getSwqosType(): SwqosType {
    return SwqosType.ZeroSlot;
  }

  minTipSol(): number {
    return MIN_TIP_ZERO_SLOT;
  }
}

// ===== Temporal Client =====

export class TemporalClient extends BaseClient {
  private tipAccount = 'temporalGxiRP8dLKPhUT6vJ6Qnq1RmqNGW8mVu8mPTwogbNX7j';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = { transaction: encoded };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `https://${this.endpoint}/api/v1/submit`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(500, result.error);
    }

    return result.signature;
  }

  getTipAccount(): string {
    return this.tipAccount;
  }

  getSwqosType(): SwqosType {
    return SwqosType.Temporal;
  }

  minTipSol(): number {
    return MIN_TIP_TEMPORAL;
  }
}

// ===== FlashBlock Client =====

export class FlashBlockClient extends BaseClient {
  private tipAccount = 'flashblockHjE4frLuq8iFzboHy5AW8VZMo7mDhjt4VhV';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = { transaction: encoded };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['X-API-Key'] = this.authToken;
    }

    const url = `https://${this.endpoint}/api/v1/submit`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(500, result.error);
    }

    return result.signature;
  }

  getTipAccount(): string {
    return this.tipAccount;
  }

  getSwqosType(): SwqosType {
    return SwqosType.FlashBlock;
  }

  minTipSol(): number {
    return MIN_TIP_FLASH_BLOCK;
  }
}

// ===== Helius Client =====

export class HeliusClient extends BaseClient {
  private tipAccount = 'heliusH4gNdW3DyUr3QYjE3QiPYq78mi4jh7U3YyHY';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private apiKey?: string,
    private swqosOnly: boolean = false
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const result = (await this.post(this.endpoint, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return result.result;
  }

  getTipAccount(): string {
    return this.tipAccount;
  }

  getSwqosType(): SwqosType {
    return SwqosType.Helius;
  }

  minTipSol(): number {
    return this.swqosOnly ? MIN_TIP_HELIUS : 0.0002;
  }
}

// ===== Default RPC Client =====

export class DefaultClient extends BaseClient {
  constructor(private rpcUrl: string) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const result = (await this.post(this.rpcUrl, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return result.result;
  }

  getTipAccount(): string {
    return '';
  }

  getSwqosType(): SwqosType {
    return SwqosType.Default;
  }

  minTipSol(): number {
    return MIN_TIP_DEFAULT;
  }
}

// ===== Additional Clients =====

export class Node1Client extends BaseClient {
  private tipAccount = 'node1H4gNdW3DyUr3QYjE3QiPYq78mi4jh7U3YyHY';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(tradeType: TradeType, transaction: Buffer): Promise<string> {
    const encoded = transaction.toString('base64');
    const payload = { transaction: encoded };
    const headers: Record<string, string> = {};
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const result = (await this.post(`https://${this.endpoint}/api/v1/submit`, payload, headers)) as any;
    if (result.error) throw new TradeError(500, result.error);
    return result.signature;
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Node1; }
  minTipSol(): number { return MIN_TIP_NODE1; }
}

export class BlockRazorClient extends BaseClient {
  private tipAccount = 'blockrazorH4gNdW3DyUr3QYjE3QiPYq78mi4jh7U3YyHY';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(tradeType: TradeType, transaction: Buffer): Promise<string> {
    const encoded = transaction.toString('base64');
    const payload = { transaction: encoded };
    const headers: Record<string, string> = {};
    if (this.authToken) headers['X-API-Key'] = this.authToken;

    const result = (await this.post(`https://${this.endpoint}/api/v1/submit`, payload, headers)) as any;
    if (result.error) throw new TradeError(500, result.error);
    return result.signature;
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.BlockRazor; }
  minTipSol(): number { return MIN_TIP_BLOCK_RAZOR; }
}

export class AstralaneClient extends BaseClient {
  private tipAccount = 'astralaneH4gNdW3DyUr3QYjE3QiPYq78mi4jh7U3YyHY';

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(tradeType: TradeType, transaction: Buffer): Promise<string> {
    const encoded = transaction.toString('base64');
    const payload = { transaction: encoded };
    const headers: Record<string, string> = {};
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const result = (await this.post(`https://${this.endpoint}/api/v1/submit`, payload, headers)) as any;
    if (result.error) throw new TradeError(500, result.error);
    return result.signature;
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Astralane; }
  minTipSol(): number { return MIN_TIP_ASTRALANE; }
}

// ===== Client Factory =====

export interface SwqosClientConfig {
  type: SwqosType;
  region?: SwqosRegion;
  customUrl?: string;
  apiKey?: string;
}

export class ClientFactory {
  static createClient(config: SwqosClientConfig, rpcUrl: string): SwqosClient {
    switch (config.type) {
      case SwqosType.Jito:
        const endpoint = config.customUrl || JITO_ENDPOINTS[config.region || SwqosRegion.Amsterdam];
        return new JitoClient(rpcUrl, endpoint, config.apiKey);

      case SwqosType.Bloxroute:
        return new BloxrouteClient(
          rpcUrl,
          config.customUrl || 'api.bloxroute.com',
          config.apiKey
        );

      case SwqosType.ZeroSlot:
        return new ZeroSlotClient(
          rpcUrl,
          config.customUrl || 'api.zeroslot.com',
          config.apiKey
        );

      case SwqosType.Temporal:
        return new TemporalClient(
          rpcUrl,
          config.customUrl || 'api.temporal.com',
          config.apiKey
        );

      case SwqosType.FlashBlock:
        return new FlashBlockClient(
          rpcUrl,
          config.customUrl || 'api.flashblock.com',
          config.apiKey
        );

      case SwqosType.Helius:
        return new HeliusClient(
          rpcUrl,
          config.customUrl || rpcUrl,
          config.apiKey,
          false
        );

      case SwqosType.Node1:
        return new Node1Client(
          rpcUrl,
          config.customUrl || 'api.node1.com',
          config.apiKey
        );

      case SwqosType.BlockRazor:
        return new BlockRazorClient(
          rpcUrl,
          config.customUrl || 'api.blockrazor.com',
          config.apiKey
        );

      case SwqosType.Astralane:
        return new AstralaneClient(
          rpcUrl,
          config.customUrl || 'api.astralane.com',
          config.apiKey
        );

      case SwqosType.Default:
      default:
        return new DefaultClient(rpcUrl);
    }
  }
}

// ===== Convenience Function =====

export function createSwqosClient(
  swqosType: SwqosType,
  rpcUrl: string,
  authToken?: string,
  region?: SwqosRegion,
  customUrl?: string
): SwqosClient {
  const config: SwqosClientConfig = {
    type: swqosType,
    region,
    customUrl,
    apiKey: authToken,
  };
  return ClientFactory.createClient(config, rpcUrl);
}
