# Sol Trade SDK for TypeScript

<p align="center">
    <strong>A high-performance TypeScript SDK for low-latency Solana DEX trading</strong>
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
- **SWQoS Integration**: Jito, Bloxroute, ZeroSlot, Temporal, FlashBlock, Helius, and more
- **High Performance**: LRU/TTL/Sharded caching, connection pooling, parallel execution
- **Low Latency**: Optimized for sub-second trade execution
- **Security First**: Integer overflow protection, cryptographically secure randomness
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

## Subpath Imports

```typescript
// Import specific modules
import { LRUCache } from 'sol-trade-sdk/cache';
import { calculatePumpFunBuy } from 'sol-trade-sdk/calc';
import { JitoClient } from 'sol-trade-sdk/swqos';
```

## Security Features

```typescript
import { randomBytes } from 'crypto';

// Cryptographically secure randomness for fee recipient selection
const randomIndex = randomBytes(1)[0] % MAYHEM_FEE_RECIPIENTS.length;

// Integer overflow protection in calculations
import { calculateFee } from 'sol-trade-sdk/calc';
const fee = calculateFee(amount, feeBasisPoints); // Throws on overflow
```

## Architecture

| Module | Description |
|--------|-------------|
| `cache` | LRU, TTL, and sharded caches |
| `calc` | AMM calculations for all DEXes with overflow protection |
| `hotpath` | Zero-RPC hot path execution |
| `instruction` | Instruction builders with secure randomness |
| `pool` | Connection and worker pools |
| `rpc` | High-performance RPC clients |
| `seed` | PDA derivation for all protocols |
| `swqos` | MEV provider clients |
| `trading` | High-performance trade executor |

## Supported Protocols

### PumpFun
- Bonding curve calculations
- Buy/Sell instruction building
- PDA derivation

### PumpSwap
- Pool calculations
- Fee breakdown (LP, protocol, curve)
- Instruction building

### Raydium
- AMM V4 calculations
- CPMM calculations
- Authority PDA derivation

### Meteora
- DAMM V2 support
- Pool PDA derivation

## SWQoS Providers

| Provider | Min Tip | Features |
|----------|---------|----------|
| Jito | 0.001 SOL | Bundle support, gRPC |
| Bloxroute | 0.0003 SOL | High reliability |
| ZeroSlot | 0.0001 SOL | Low latency |
| Temporal | 0.0001 SOL | Fast confirmation |
| FlashBlock | 0.0001 SOL | Competitive pricing |
| Helius | 0.000005 SOL | SWQoS-only mode |

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
- Project Repository: https://github.com/sol-trade-sdk/sol-trade-sdk-ts
- Telegram Group: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE
