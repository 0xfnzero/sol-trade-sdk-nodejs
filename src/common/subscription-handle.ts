/**
 * Subscription handle utilities for Sol Trade SDK
 * Provides subscription management for accounts, programs, and signatures.
 */

import { PublicKey, Connection, Commitment } from '@solana/web3.js';

// ===== Subscription State =====

/**
 * Subscription state enum
 */
export enum SubscriptionState {
  Pending = 'pending',
  Active = 'active',
  Paused = 'paused',
  Error = 'error',
  Closed = 'closed',
}

// ===== Subscription Configuration =====

/**
 * Base subscription configuration
 */
export interface SubscriptionConfig {
  commitment?: Commitment;
  encoding?: 'base58' | 'base64' | 'base64+zstd' | 'jsonParsed';
}

/**
 * Account subscription configuration
 */
export interface AccountSubscriptionConfig extends SubscriptionConfig {
  publicKey: PublicKey;
}

/**
 * Program subscription configuration
 */
export interface ProgramSubscriptionConfig extends SubscriptionConfig {
  programId: PublicKey;
  filters?: ProgramAccountFilter[];
}

/**
 * Program account filter
 */
export interface ProgramAccountFilter {
  memcmp?: {
    offset: number;
    bytes: string;
  };
  dataSize?: number;
}

/**
 * Signature subscription configuration
 */
export interface SignatureSubscriptionConfig extends SubscriptionConfig {
  signature: string;
}

// ===== Subscription Handle =====

/**
 * Subscription handle for managing a single subscription
 */
export class SubscriptionHandle {
  private state: SubscriptionState = SubscriptionState.Pending;
  private subscriptionId?: number;
  private error?: Error;
  private lastUpdate?: Date;
  private updateCount: number = 0;

  private _unsubscribeFn?: () => Promise<void>;

  constructor(
    private type: 'account' | 'program' | 'signature',
    private config: AccountSubscriptionConfig | ProgramSubscriptionConfig | SignatureSubscriptionConfig,
    unsubscribeFn?: () => Promise<void>
  ) {
    this._unsubscribeFn = unsubscribeFn;
  }

  /**
   * Get subscription type
   */
  getType(): 'account' | 'program' | 'signature' {
    return this.type;
  }

  /**
   * Get subscription configuration
   */
  getConfig(): AccountSubscriptionConfig | ProgramSubscriptionConfig | SignatureSubscriptionConfig {
    return this.config;
  }

  /**
   * Get current subscription state
   */
  getState(): SubscriptionState {
    return this.state;
  }

  /**
   * Set subscription state
   */
  setState(state: SubscriptionState): void {
    this.state = state;
  }

  /**
   * Get subscription ID from connection
   */
  getSubscriptionId(): number | undefined {
    return this.subscriptionId;
  }

  /**
   * Set subscription ID
   */
  setSubscriptionId(id: number): void {
    this.subscriptionId = id;
  }

  /**
   * Get last error
   */
  getError(): Error | undefined {
    return this.error;
  }

  /**
   * Set error state
   */
  setError(error: Error): void {
    this.error = error;
    this.state = SubscriptionState.Error;
  }

  /**
   * Record an update
   */
  recordUpdate(): void {
    this.lastUpdate = new Date();
    this.updateCount++;
  }

  /**
   * Get last update timestamp
   */
  getLastUpdate(): Date | undefined {
    return this.lastUpdate;
  }

  /**
   * Get total update count
   */
  getUpdateCount(): number {
    return this.updateCount;
  }

  /**
   * Check if subscription is active
   */
  isActive(): boolean {
    return this.state === SubscriptionState.Active;
  }

  /**
   * Check if subscription is closed
   */
  isClosed(): boolean {
    return this.state === SubscriptionState.Closed;
  }

  /**
   * Set the unsubscribe function
   */
  setUnsubscribeFn(fn: () => Promise<void>): void {
    this._unsubscribeFn = fn;
  }

  /**
   * Unsubscribe from this subscription
   */
  async unsubscribe(): Promise<void> {
    if (this.state === SubscriptionState.Closed) {
      return;
    }

    try {
      if (this._unsubscribeFn) {
        await this._unsubscribeFn();
      }
      this.state = SubscriptionState.Closed;
    } catch (error) {
      this.setError(error as Error);
      throw error;
    }
  }
}

// ===== Subscription Manager =====

/**
 * Subscription manager for handling multiple subscriptions
 */
export class SubscriptionManager {
  private subscriptions: Map<string, SubscriptionHandle> = new Map();
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Generate a unique subscription key
   */
  private generateKey(type: string, identifier: string): string {
    return `${type}:${identifier}`;
  }

  /**
   * Subscribe to account changes
   */
  async subscribeAccount(
    config: AccountSubscriptionConfig,
    callback: (accountInfo: any, context: any) => void
  ): Promise<SubscriptionHandle> {
    const key = this.generateKey('account', config.publicKey.toBase58());

    // Unsubscribe existing if any
    if (this.subscriptions.has(key)) {
      await this.subscriptions.get(key)!.unsubscribe();
    }

    const handle = new SubscriptionHandle('account', config);
    handle.setState(SubscriptionState.Active);

    const subscriptionId = this.connection.onAccountChange(
      config.publicKey,
      (accountInfo, context) => {
        handle.recordUpdate();
        callback(accountInfo, context);
      },
      config.commitment ?? 'confirmed'
    );

    handle.setSubscriptionId(subscriptionId);
    handle.setUnsubscribeFn(async () => {
      await this.connection.removeAccountChangeListener(subscriptionId);
    });

    this.subscriptions.set(key, handle);
    return handle;
  }

  /**
   * Subscribe to program account changes
   */
  async subscribeProgram(
    config: ProgramSubscriptionConfig,
    callback: (keyedAccountInfo: any, context: any) => void
  ): Promise<SubscriptionHandle> {
    const key = this.generateKey('program', config.programId.toBase58());

    // Unsubscribe existing if any
    if (this.subscriptions.has(key)) {
      await this.subscriptions.get(key)!.unsubscribe();
    }

    const handle = new SubscriptionHandle('program', config);
    handle.setState(SubscriptionState.Active);

    const filters = config.filters?.map(f => ({
      memcmp: f.memcmp,
      dataSize: f.dataSize,
    }));

    const subscriptionId = this.connection.onProgramAccountChange(
      config.programId,
      (keyedAccountInfo, context) => {
        handle.recordUpdate();
        callback(keyedAccountInfo, context);
      },
      config.commitment ?? 'confirmed',
      filters
    );

    handle.setSubscriptionId(subscriptionId);
    handle.setUnsubscribeFn(async () => {
      await this.connection.removeProgramAccountChangeListener(subscriptionId);
    });

    this.subscriptions.set(key, handle);
    return handle;
  }

  /**
   * Subscribe to signature status changes
   */
  async subscribeSignature(
    config: SignatureSubscriptionConfig,
    callback: (signatureResult: any, context: any) => void
  ): Promise<SubscriptionHandle> {
    const key = this.generateKey('signature', config.signature);

    // Unsubscribe existing if any
    if (this.subscriptions.has(key)) {
      await this.subscriptions.get(key)!.unsubscribe();
    }

    const handle = new SubscriptionHandle('signature', config);
    handle.setState(SubscriptionState.Active);

    const subscriptionId = this.connection.onSignature(
      config.signature,
      (signatureResult, context) => {
        handle.recordUpdate();
        callback(signatureResult, context);
      },
      config.commitment ?? 'confirmed'
    );

    handle.setSubscriptionId(subscriptionId);
    handle.setUnsubscribeFn(async () => {
      await this.connection.removeSignatureListener(subscriptionId);
    });

    this.subscriptions.set(key, handle);
    return handle;
  }

  /**
   * Subscribe to slot changes
   */
  async subscribeSlot(callback: (slotInfo: any) => void): Promise<SubscriptionHandle> {
    const key = this.generateKey('slot', 'global');

    // Unsubscribe existing if any
    if (this.subscriptions.has(key)) {
      await this.subscriptions.get(key)!.unsubscribe();
    }

    const config: SubscriptionConfig = {};
    const handle = new SubscriptionHandle('slot' as any, config as any);
    handle.setState(SubscriptionState.Active);

    const subscriptionId = this.connection.onSlotChange((slotInfo) => {
      handle.recordUpdate();
      callback(slotInfo);
    });

    handle.setSubscriptionId(subscriptionId);
    handle.setUnsubscribeFn(async () => {
      await this.connection.removeSlotChangeListener(subscriptionId);
    });

    this.subscriptions.set(key, handle);
    return handle;
  }

  /**
   * Subscribe to root changes
   */
  async subscribeRoot(callback: (root: number) => void): Promise<SubscriptionHandle> {
    const key = this.generateKey('root', 'global');

    // Unsubscribe existing if any
    if (this.subscriptions.has(key)) {
      await this.subscriptions.get(key)!.unsubscribe();
    }

    const config: SubscriptionConfig = {};
    const handle = new SubscriptionHandle('signature', config as SignatureSubscriptionConfig);
    handle.setState(SubscriptionState.Active);

    const subscriptionId = this.connection.onRootChange((root) => {
      handle.recordUpdate();
      callback(root);
    });

    handle.setSubscriptionId(subscriptionId);
    handle.setUnsubscribeFn(async () => {
      await this.connection.removeRootChangeListener(subscriptionId);
    });

    this.subscriptions.set(key, handle);
    return handle;
  }

  /**
   * Get a subscription by key
   */
  getSubscription(key: string): SubscriptionHandle | undefined {
    return this.subscriptions.get(key);
  }

  /**
   * Get all subscriptions
   */
  getAllSubscriptions(): SubscriptionHandle[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscriptions by type
   */
  getSubscriptionsByType(type: 'account' | 'program' | 'signature'): SubscriptionHandle[] {
    return this.getAllSubscriptions().filter((sub) => sub.getType() === type);
  }

  /**
   * Unsubscribe from a specific subscription
   */
  async unsubscribe(key: string): Promise<void> {
    const handle = this.subscriptions.get(key);
    if (handle) {
      await handle.unsubscribe();
      this.subscriptions.delete(key);
    }
  }

  /**
   * Unsubscribe from all subscriptions
   */
  async unsubscribeAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [key, handle] of this.subscriptions) {
      promises.push(
        handle.unsubscribe().then(() => {
          this.subscriptions.delete(key);
        })
      );
    }
    await Promise.all(promises);
  }

  /**
   * Get subscription statistics
   */
  getStats(): {
    total: number;
    active: number;
    pending: number;
    paused: number;
    error: number;
    closed: number;
    totalUpdates: number;
  } {
    const subs = this.getAllSubscriptions();
    return {
      total: subs.length,
      active: subs.filter((s) => s.getState() === SubscriptionState.Active).length,
      pending: subs.filter((s) => s.getState() === SubscriptionState.Pending).length,
      paused: subs.filter((s) => s.getState() === SubscriptionState.Paused).length,
      error: subs.filter((s) => s.getState() === SubscriptionState.Error).length,
      closed: subs.filter((s) => s.getState() === SubscriptionState.Closed).length,
      totalUpdates: subs.reduce((sum, s) => sum + s.getUpdateCount(), 0),
    };
  }
}

// ===== Convenience Classes =====

/**
 * Account subscription helper
 */
export class AccountSubscription {
  private handle?: SubscriptionHandle;

  constructor(
    private manager: SubscriptionManager,
    private publicKey: PublicKey
  ) {}

  /**
   * Subscribe to account changes
   */
  async subscribe(
    callback: (accountInfo: any, context: any) => void,
    commitment?: Commitment
  ): Promise<SubscriptionHandle> {
    this.handle = await this.manager.subscribeAccount(
      { publicKey: this.publicKey, commitment },
      callback
    );
    return this.handle;
  }

  /**
   * Unsubscribe from account changes
   */
  async unsubscribe(): Promise<void> {
    if (this.handle) {
      await this.handle.unsubscribe();
      this.handle = undefined;
    }
  }

  /**
   * Check if subscribed
   */
  isSubscribed(): boolean {
    return this.handle?.isActive() ?? false;
  }
}

/**
 * Program subscription helper
 */
export class ProgramSubscription {
  private handle?: SubscriptionHandle;

  constructor(
    private manager: SubscriptionManager,
    private programId: PublicKey
  ) {}

  /**
   * Subscribe to program account changes
   */
  async subscribe(
    callback: (keyedAccountInfo: any, context: any) => void,
    filters?: ProgramAccountFilter[],
    commitment?: Commitment
  ): Promise<SubscriptionHandle> {
    this.handle = await this.manager.subscribeProgram(
      { programId: this.programId, filters, commitment },
      callback
    );
    return this.handle;
  }

  /**
   * Unsubscribe from program changes
   */
  async unsubscribe(): Promise<void> {
    if (this.handle) {
      await this.handle.unsubscribe();
      this.handle = undefined;
    }
  }

  /**
   * Check if subscribed
   */
  isSubscribed(): boolean {
    return this.handle?.isActive() ?? false;
  }
}

/**
 * Signature subscription helper
 */
export class SignatureSubscription {
  private handle?: SubscriptionHandle;

  constructor(
    private manager: SubscriptionManager,
    private signature: string
  ) {}

  /**
   * Subscribe to signature status changes
   */
  async subscribe(
    callback: (signatureResult: any, context: any) => void,
    commitment?: Commitment
  ): Promise<SubscriptionHandle> {
    this.handle = await this.manager.subscribeSignature(
      { signature: this.signature, commitment },
      callback
    );
    return this.handle;
  }

  /**
   * Unsubscribe from signature changes
   */
  async unsubscribe(): Promise<void> {
    if (this.handle) {
      await this.handle.unsubscribe();
      this.handle = undefined;
    }
  }

  /**
   * Check if subscribed
   */
  isSubscribed(): boolean {
    return this.handle?.isActive() ?? false;
  }
}

// ===== Factory Functions =====

/**
 * Create a subscription manager
 */
export function createSubscriptionManager(connection: Connection): SubscriptionManager {
  return new SubscriptionManager(connection);
}

/**
 * Create an account subscription
 */
export function createAccountSubscription(
  manager: SubscriptionManager,
  publicKey: PublicKey
): AccountSubscription {
  return new AccountSubscription(manager, publicKey);
}

/**
 * Create a program subscription
 */
export function createProgramSubscription(
  manager: SubscriptionManager,
  programId: PublicKey
): ProgramSubscription {
  return new ProgramSubscription(manager, programId);
}

/**
 * Create a signature subscription
 */
export function createSignatureSubscription(
  manager: SubscriptionManager,
  signature: string
): SignatureSubscription {
  return new SignatureSubscription(manager, signature);
}
