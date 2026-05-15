import { ComputeBudgetProgram } from '@solana/web3.js';
import { LoggingMiddleware, MiddlewareManager, ValidationMiddleware } from 'sol-trade-sdk';

async function main() {
  const manager = new MiddlewareManager()
    .addMiddleware(new ValidationMiddleware(32, 1_024))
    .addMiddleware(new LoggingMiddleware());

  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: 180_000 })];
  const processed = manager.applyMiddlewaresProcessProtocolInstructions(instructions, 'PumpFun', true);
  console.log('Middleware processed instructions:', processed.length);
}

main().catch(console.error);
