/**
 * Middleware System Example
 *
 * This example demonstrates how to use the middleware system
 * to modify, add, or remove instructions before transaction execution.
 */

import {
  MiddlewareManager,
  ValidationMiddleware,
  LoggingMiddleware,
} from 'sol-trade-sdk/middleware';

async function main() {
  console.log('Middleware System Example');
  console.log('This example demonstrates how to use the middleware system');

  // Create middleware manager
  const manager = new MiddlewareManager();

  // Add validation middleware
  const validationMiddleware = new ValidationMiddleware({
    maxInstructions: 100,
    maxDataSize: 10000,
  });
  manager.addMiddleware(validationMiddleware);

  // Add logging middleware
  const loggingMiddleware = new LoggingMiddleware();
  manager.addMiddleware(loggingMiddleware);

  console.log('Middleware manager created with validation and logging middlewares');

  // In a real scenario, you would apply middlewares to instructions:
  // const processed = manager.applyMiddlewaresProcessProtocolInstructions(
  //   instructions,
  //   'PumpFun',
  //   true, // isBuy
  // );

  console.log('Middleware system example completed!');
}

main().catch(console.error);
