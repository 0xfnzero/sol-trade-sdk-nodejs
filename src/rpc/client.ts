/**
 * High-Performance RPC Client for Sol Trade SDK
 * Provides async methods for Solana RPC communication.
 */

import { TTLCache, ShardedCache } from '../cache/cache';

// ===== Types =====

interface RPCConfig {
  endpoint: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  maxConnections?: number;
}

interface AccountInfo {
  lamports: number;
  data: Buffer;
  owner: string;
  executable: boolean;
  rentEpoch: number;
}

interface BlockhashResult {
  blockhash: string;
  lastValidBlockHeight: number;
}

interface SignatureStatus {
  slot: number;
  confirmations?: number;
  err?: any;
  confirmationStatus: string;
}

interface SimulateResult {
  err?: any;
  accounts?: AccountInfo[];
  unitsConsumed: number;
  returnData?: {
    data: Buffer;
    programId: string;
  };
}

// ===== RPC Error =====

export class RPCError extends Error {
  constructor(public code: number, message: string) {
    super(`RPC Error ${code}: ${message}`);
    this.name = 'RPCError';
  }
}

// ===== Async RPC Client =====

/**
 * High-performance async RPC client.
 */
export class AsyncRPCClient {
  private requestId = 0;
  private requestsCount = 0;
  private errorCount = 0;
  private totalLatency = 0;

  // Caches
  private blockhashCache = new TTLCache<string, string>(2000);
  private accountCache = new ShardedCache<string, Buffer>(16, 500, 10000);

  constructor(private config: RPCConfig) {}

  private async makeRequest<T>(method: string, params: any[] = []): Promise<T> {
    this.requestId++;
    this.requestsCount++;

    const payload = {
      jsonrpc: '2.0',
      id: this.requestId,
      method,
      params,
    };

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();

      if (data.error) {
        this.errorCount++;
        throw new RPCError(
          data.error.code || -1,
          data.error.message || 'Unknown error'
        );
      }

      return data.result as T;
    } catch (error) {
      this.errorCount++;
      if (error instanceof RPCError) throw error;
      throw new RPCError(-1, error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.totalLatency += Date.now() - startTime;
    }
  }

  // ===== Core Methods =====

  async getBalance(pubkey: string, commitment: string = 'confirmed'): Promise<number> {
    const result = await this.makeRequest<{ value: number }>('getBalance', [
      pubkey,
      { commitment },
    ]);
    return result.value;
  }

  async getAccountInfo(
    pubkey: string,
    encoding: string = 'base64',
    commitment: string = 'confirmed'
  ): Promise<AccountInfo | null> {
    // Check cache
    const cached = this.accountCache.get(pubkey);
    if (cached) {
      return {
        lamports: 0,
        data: cached,
        owner: '',
        executable: false,
        rentEpoch: 0,
      };
    }

    const result = await this.makeRequest<{ value: any }>('getAccountInfo', [
      pubkey,
      { encoding, commitment },
    ]);

    if (!result.value) {
      return null;
    }

    const data = result.value.data;
    let rawData: Buffer;

    if (Array.isArray(data) && data[0]) {
      rawData = Buffer.from(data[0], 'base64');
    } else {
      rawData = Buffer.alloc(0);
    }

    this.accountCache.set(pubkey, rawData);

    return {
      lamports: result.value.lamports || 0,
      data: rawData,
      owner: result.value.owner || '',
      executable: result.value.executable || false,
      rentEpoch: result.value.rentEpoch || 0,
    };
  }

  async getMultipleAccounts(
    pubkeys: string[],
    encoding: string = 'base64',
    commitment: string = 'confirmed'
  ): Promise<(AccountInfo | null)[]> {
    const result = await this.makeRequest<{ value: any[] }>('getMultipleAccounts', [
      pubkeys,
      { encoding, commitment },
    ]);

    return (result.value || []).map((value: any) => {
      if (!value) return null;

      const data = value.data;
      let rawData: Buffer;

      if (Array.isArray(data) && data[0]) {
        rawData = Buffer.from(data[0], 'base64');
      } else {
        rawData = Buffer.alloc(0);
      }

      return {
        lamports: value.lamports || 0,
        data: rawData,
        owner: value.owner || '',
        executable: value.executable || false,
        rentEpoch: value.rentEpoch || 0,
      };
    });
  }

  async getLatestBlockhash(commitment: string = 'confirmed'): Promise<BlockhashResult> {
    // Check cache
    const cached = this.blockhashCache.get('latest');
    if (cached) {
      return {
        blockhash: cached,
        lastValidBlockHeight: 0,
      };
    }

    const result = await this.makeRequest<BlockhashResult>('getLatestBlockhash', [
      { commitment },
    ]);

    this.blockhashCache.set('latest', result.blockhash);

    return {
      blockhash: result.blockhash,
      lastValidBlockHeight: result.lastValidBlockHeight,
    };
  }

  async getSignatureStatuses(
    signatures: string[],
    searchTransactionHistory: boolean = false
  ): Promise<(SignatureStatus | null)[]> {
    const result = await this.makeRequest<{ value: any[] }>('getSignatureStatuses', [
      signatures,
      { searchTransactionHistory },
    ]);

    return (result.value || []).map((value: any) => {
      if (!value) return null;

      return {
        slot: value.slot || 0,
        confirmations: value.confirmations,
        err: value.err,
        confirmationStatus: value.confirmationStatus || 'processed',
      };
    });
  }

  async sendTransaction(
    transaction: Buffer,
    options: {
      skipPreflight?: boolean;
      preflightCommitment?: string;
    } = {}
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    return this.makeRequest<string>('sendTransaction', [
      encoded,
      {
        encoding: 'base64',
        skipPreflight: options.skipPreflight || false,
        preflightCommitment: options.preflightCommitment || 'confirmed',
      },
    ]);
  }

  async simulateTransaction(
    transaction: Buffer,
    options: {
      sigVerify?: boolean;
    } = {}
  ): Promise<SimulateResult> {
    const encoded = transaction.toString('base64');

    const result = await this.makeRequest<{ value: any }>('simulateTransaction', [
      encoded,
      {
        encoding: 'base64',
        sigVerify: options.sigVerify || false,
      },
    ]);

    return {
      err: result.value?.err,
      accounts: result.value?.accounts,
      unitsConsumed: result.value?.unitsConsumed || 0,
      returnData: result.value?.returnData,
    };
  }

  // ===== Utility Methods =====

  async waitForConfirmation(
    signature: string,
    timeout: number = 30000,
    pollInterval: number = 1000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const statuses = await this.getSignatureStatuses([signature]);
      const status = statuses[0];

      if (status) {
        if (status.confirmationStatus === 'finalized') {
          return true;
        }
        if (status.err) {
          return false;
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  getStats(): { requests: number; errors: number; avgLatencyMs: number } {
    return {
      requests: this.requestsCount,
      errors: this.errorCount,
      avgLatencyMs: this.requestsCount > 0
        ? this.totalLatency / this.requestsCount
        : 0,
    };
  }
}
