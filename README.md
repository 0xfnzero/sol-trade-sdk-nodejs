# Sol Trade SDK for Node.js

<p align="center">
    <strong>A high-performance Node.js SDK for low-latency Solana DEX trading</strong>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/sol-trade-sdk">
        <img src="https://img.shields.io/npm/v/sol-trade-sdk.svg" alt="npm">
    </a>
    <a href="https://www.npmjs.com/package/sol-trade-sdk">
        <img src="https://img.shields.io/node/v/sol-trade-sdk.svg" alt="Node Version">
    </a>
    <a href="LICENSE">
        <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
    </a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana">
    <img src="https://img.shields.io/badge/DEX-4B8BBE?style=for-the-badge&logo=bitcoin&logoColor=white" alt="DEX Trading">
</p>

<p align="center">
    <a href="README_CN.md">中文</a> |
    <a href="https://fnzero.dev/">Website</a> |
    <a href="https://t.me/fnzero_group">Telegram</a> |
    <a href="https://discord.gg/vuazbGkqQE">Discord</a>
</p>

---

A comprehensive, high-performance TypeScript SDK for Solana DEX trading with support for multiple protocols and MEV providers.

## Features

- **Multiple DEX Support**: PumpFun, PumpSwap, Bonk, Raydium AMM V4, Raydium CPMM, Meteora DAMM V2
- **SWQoS Integration**: Multiple MEV providers for transaction submission
- **High Performance**: LRU/TTL/Sharded caching, connection pooling, parallel execution
- **Low Latency**: Optimized for sub-second trade execution
- **Security First**: Integer overflow protection, secure key storage, input validation
- **Zero-RPC Hot Path**: All RPC calls happen BEFORE trading execution
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Modular Design**: Use only what you need

## Installation

```bash
npm install sol-trade-sdk
# or
yarn add sol-trade-sdk
# or
pnpm add sol-trade-sdk
```

## Quick Start

### Basic Trading

```typescript
import {
  GasFeeStrategy,
  TradeExecutor,
  SwqosType,
  TradeType,
} from 'sol-trade-sdk';

// Create gas strategy
const gasStrategy = new GasFeeStrategy();
gasStrategy.setGlobalFeeStrategy(200000, 200000, 100000, 100000, 0.001, 0.001);

// Create trade executor
const executor = new TradeExecutor({
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  swqosConfigs: [{ type: SwqosType.Jito }],
});

// Execute trade
const result = await executor.execute(TradeType.Buy, transactionBuffer);
console.log(`Transaction signature: ${result.signature}`);
```

### PumpFun Trading

```typescript
import { PumpFunInstructionBuilder } from 'sol-trade-sdk/instruction/pumpfun';
import { getBuyTokenAmountFromSolAmount } from 'sol-trade-sdk/calc/pumpfun';

// Calculate tokens received for SOL input
const tokens = getBuyTokenAmountFromSolAmount(
  1_073_000_000_000_000, // virtualTokenReserves
  30_000_000_000,         // virtualSolReserves
  793_000_000_000_000,    // realTokenReserves
  true,                   // hasCreator
  1_000_000_000           // amount (1 SOL)
);

// Build buy instructions
const builder = new PumpFunInstructionBuilder();
const instructions = builder.buildBuyInstructions({
  payer: payerPubkey,
  outputMint: tokenMint,
  inputAmount: 1_000_000_000,
  slippageBasisPoints: 500, // 5%
  bondingCurve: bondingCurvePubkey,
  creatorVault: creatorVaultPubkey,
  associatedBondingCurve: abcPubkey,
});
```

### Hot Path Execution (Zero-RPC Trading)

```typescript
import { HotPathExecutor, HotPathState } from 'sol-trade-sdk/hotpath';

// Initialize hot path state with pre-fetched data
const state = new HotPathState();
await state.prefetchBlockhash(rpcClient);
await state.cacheAccount(tokenAccountPubkey);

// Execute without any RPC calls during trading
const executor = new HotPathExecutor(state);
const result = await executor.executeTrade(transaction);
```

### Trading with Factory

```typescript
import {
  TradeExecutorFactory,
  TradingClient,
  DexType,
} from 'sol-trade-sdk/trading';

// Create factory with base executor
const factory = new TradeExecutorFactory(baseExecutor);

// Get DEX-specific executor
const pumpfunExecutor = factory.getExecutor(DexType.PumpFun);

// Create trading client
const client = new TradingClient(factory);

// Execute buy on PumpFun
const result = await client.buy(DexType.PumpFun, params);
console.log(`Result: ${result.signature}`);
```

## Usage Examples Summary

| Description | File | Run Command |
|-------------|------|-------------|
| Create and configure TradingClient instance | [trading_client.ts](examples/trading_client.ts) | `npx ts-node examples/trading_client.ts` |
| Share infrastructure across multiple wallets | [shared_infrastructure.ts](examples/shared_infrastructure.ts) | `npx ts-node examples/shared_infrastructure.ts` |
| PumpFun token sniping trading | [pumpfun_sniper_trading.ts](examples/pumpfun_sniper_trading.ts) | `npx ts-node examples/pumpfun_sniper_trading.ts` |
| PumpFun token copy trading | [pumpfun_copy_trading.ts](examples/pumpfun_copy_trading.ts) | `npx ts-node examples/pumpfun_copy_trading.ts` |
| PumpSwap trading operations | [pumpswap_trading.ts](examples/pumpswap_trading.ts) | `npx ts-node examples/pumpswap_trading.ts` |
| PumpSwap direct trading (via RPC) | [pumpswap_direct_trading.ts](examples/pumpswap_direct_trading.ts) | `npx ts-node examples/pumpswap_direct_trading.ts` |
| Raydium CPMM trading operations | [raydium_cpmm_trading.ts](examples/raydium_cpmm_trading.ts) | `npx ts-node examples/raydium_cpmm_trading.ts` |
| Raydium AMM V4 trading operations | [raydium_amm_v4_trading.ts](examples/raydium_amm_v4_trading.ts) | `npx ts-node examples/raydium_amm_v4_trading.ts` |
| Meteora DAMM V2 trading operations | [meteora_damm_v2_trading.ts](examples/meteora_damm_v2_trading.ts) | `npx ts-node examples/meteora_damm_v2_trading.ts` |
| Bonk token sniping trading | [bonk_sniper_trading.ts](examples/bonk_sniper_trading.ts) | `npx ts-node examples/bonk_sniper_trading.ts` |
| Bonk token copy trading | [bonk_copy_trading.ts](examples/bonk_copy_trading.ts) | `npx ts-node examples/bonk_copy_trading.ts` |
| Custom instruction middleware example | [middleware_system.ts](examples/middleware_system.ts) | `npx ts-node examples/middleware_system.ts` |
| Address lookup table example | [address_lookup.ts](examples/address_lookup.ts) | `npx ts-node examples/address_lookup.ts` |
| Nonce cache (durable nonce) example | [nonce_cache.ts](examples/nonce_cache.ts) | `npx ts-node examples/nonce_cache.ts` |
| Wrap/unwrap SOL to/from WSOL example | [wsol_wrapper.ts](examples/wsol_wrapper.ts) | `npx ts-node examples/wsol_wrapper.ts` |
| Seed trading example | [seed_trading.ts](examples/seed_trading.ts) | `npx ts-node examples/seed_trading.ts` |
| Gas fee strategy example | [gas_fee_strategy.ts](examples/gas_fee_strategy.ts) | `npx ts-node examples/gas_fee_strategy.ts` |

## Security Features

```typescript
import {
  SecureKeyStorage,
  validateRpcUrl,
  validateAmount,
  validatePubkey,
} from 'sol-trade-sdk/security';

// Secure key storage with AES-256-GCM encryption
const storage = SecureKeyStorage.fromKeyPair(keypair, 'optional_password');
storage.unlock((kp) => {
  const signature = kp.sign(message);
  return signature;
});
storage.clear(); // Secure memory clearing

// Input validation
validateRpcUrl('https://api.mainnet-beta.solana.com');
validateAmount(1_000_000_000, 'amount', { allowZero: false });
validatePubkey(pubkeyString, 'tokenMint');
```

## Address Lookup Tables

```typescript
import {
  fetchAddressLookupTableAccount,
  AddressLookupTableCache,
} from 'sol-trade-sdk/address-lookup';

// Fetch ALT from chain
const alt = await fetchAddressLookupTableAccount(rpc, altAddress);
console.log(`ALT contains ${alt.addresses.length} addresses`);

// Use cache for performance
const cache = new AddressLookupTableCache(rpc);
await cache.prefetch([altAddress1, altAddress2, altAddress3]);
const cached = cache.get(altAddress1);
```

## Subpath Imports

```typescript
// Import specific modules
import { LRUCache } from 'sol-trade-sdk/cache';
import { calculatePumpFunBuy } from 'sol-trade-sdk/calc';
import { JitoClient } from 'sol-trade-sdk/swqos';
import { HotPathExecutor } from 'sol-trade-sdk/hotpath';
import { SecureKeyStorage } from 'sol-trade-sdk/security';
import { TradeExecutorFactory } from 'sol-trade-sdk/trading';
```

## Architecture

| Module | Description |
|--------|-------------|
| `address-lookup` | Address Lookup Table support with caching |
| `cache` | LRU, TTL, and sharded caches |
| `calc` | AMM calculations for all DEXes with overflow protection |
| `common` | Core types, gas strategies, bonding curves |
| `execution` | Branch optimization, prefetching |
| `hotpath` | Zero-RPC hot path execution |
| `instruction` | Instruction builders for all DEXes |
| `middleware` | Instruction middleware system |
| `pool` | Connection and worker pools |
| `rpc` | High-performance RPC clients |
| `security` | Secure key storage, validators |
| `seed` | PDA derivation for all protocols |
| `swqos` | MEV provider clients (19 providers) |
| `trading` | High-performance trade executor with factory |

## Supported Protocols

### PumpFun
- Bonding curve calculations with creator fee support
- Buy/Sell instruction building
- PDA derivation for bonding curve and associated accounts

### PumpSwap
- Pool calculations with LP/protocol/creator fees
- Buy/Sell instruction building
- Mayhem mode support

### Bonk
- Virtual/real reserve calculations
- Protocol fee handling

### Raydium
- AMM V4 calculations with constant product
- CPMM calculations
- Authority PDA derivation

### Meteora
- DAMM V2 swap calculations
- Pool PDA derivation

## Middleware System

```typescript
import {
  MiddlewareManager,
  ValidationMiddleware,
  TimerMiddleware,
  MetricsMiddleware,
} from 'sol-trade-sdk/middleware';

const manager = new MiddlewareManager();
manager.addMiddleware(new ValidationMiddleware({ maxInstructions: 100 }));
manager.addMiddleware(new TimerMiddleware());
manager.addMiddleware(new MetricsMiddleware());

// Apply middlewares to instructions
const processed = manager.applyMiddlewaresProcessProtocolInstructions(
  instructions,
  'PumpFun',
  true // isBuy
);
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.3.0 (for development)

## Scripts

```bash
# Build
npm run build

# Development
npm run dev

# Test
npm test

# Lint
npm run lint

# Type check
npm run typecheck
```

## License

MIT License

## Contact

- Official Website: https://fnzero.dev/
- Project Repository: https://github.com/0xfnzero/sol-trade-sdk-nodejs
- Telegram Group: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE
