/**
 * Middleware trait definitions.
 * Based on sol-trade-sdk Rust implementation.
 */

import { TransactionInstruction, PublicKey, AccountMeta } from '@solana/web3.js';

/**
 * Instruction middleware interface
 * Used to modify, add or remove instructions before transaction execution
 */
export interface InstructionMiddleware {
  /** Middleware name */
  name(): string;

  /**
   * Process protocol instructions
   * @param protocolInstructions - Current instruction list
   * @param protocolName - Protocol name
   * @param isBuy - Whether the transaction is a buy transaction
   * @returns Modified instruction list
   */
  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[];

  /**
   * Process full instructions
   * @param fullInstructions - Current instruction list
   * @param protocolName - Protocol name
   * @param isBuy - Whether the transaction is a buy transaction
   * @returns Modified instruction list
   */
  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[];

  /** Clone middleware */
  clone(): InstructionMiddleware;
}

/**
 * Middleware manager
 */
export class MiddlewareManager {
  private middlewares: InstructionMiddleware[] = [];

  /**
   * Create new middleware manager
   */
  constructor() {}

  /**
   * Add middleware
   */
  addMiddleware(middleware: InstructionMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Apply all middlewares to process protocol instructions
   */
  applyMiddlewaresProcessProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    let result = protocolInstructions;
    for (const middleware of this.middlewares) {
      result = middleware.processProtocolInstructions(result, protocolName, isBuy);
      if (result.length === 0) {
        break;
      }
    }
    return result;
  }

  /**
   * Apply all middlewares to process full instructions
   */
  applyMiddlewaresProcessFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    let result = fullInstructions;
    for (const middleware of this.middlewares) {
      result = middleware.processFullInstructions(result, protocolName, isBuy);
      if (result.length === 0) {
        break;
      }
    }
    return result;
  }

  /**
   * Clone the manager
   */
  clone(): MiddlewareManager {
    const cloned = new MiddlewareManager();
    for (const mw of this.middlewares) {
      cloned.middlewares.push(mw.clone());
    }
    return cloned;
  }

  /**
   * Create manager with common middlewares
   */
  static withCommonMiddlewares(): MiddlewareManager {
    return new MiddlewareManager().addMiddleware(new LoggingMiddleware());
  }
}

/**
 * Logging middleware - Records instruction information
 */
export class LoggingMiddleware implements InstructionMiddleware {
  name(): string {
    return 'LoggingMiddleware';
  }

  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    console.log(`-------------------[${this.name()}]-------------------`);
    console.log('process_protocol_instructions');
    console.log(`[${this.name()}] Instruction count: ${protocolInstructions.length}`);
    console.log(`[${this.name()}] Protocol name: ${protocolName}\n`);
    console.log(`[${this.name()}] Is buy: ${isBuy}`);
    for (let i = 0; i < protocolInstructions.length; i++) {
      const ix = protocolInstructions[i];
      console.log(`Instruction ${i + 1}:`);
      console.log(`  ProgramID: ${ix.programId.toBase58()}`);
      console.log(`  Accounts: ${ix.keys.length}`);
      console.log(`  Data length: ${ix.data.length}\n`);
    }
    return protocolInstructions;
  }

  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    console.log(`-------------------[${this.name()}]-------------------`);
    console.log('process_full_instructions');
    console.log(`[${this.name()}] Instruction count: ${fullInstructions.length}`);
    console.log(`[${this.name()}] Protocol name: ${protocolName}\n`);
    console.log(`[${this.name()}] Is buy: ${isBuy}`);
    for (let i = 0; i < fullInstructions.length; i++) {
      const ix = fullInstructions[i];
      console.log(`Instruction ${i + 1}:`);
      console.log(`  ProgramID: ${ix.programId.toBase58()}`);
      console.log(`  Accounts: ${ix.keys.length}`);
      console.log(`  Data length: ${ix.data.length}\n`);
    }
    return fullInstructions;
  }

  clone(): InstructionMiddleware {
    return new LoggingMiddleware();
  }
}
