<div align="center">
    <h1>🚀 Sol Trade SDK for Node.js</h1>
    <h3><em>A comprehensive TypeScript SDK for seamless Solana DEX trading</em></h3>
</div>

<p align="center">
    <strong>A high-performance TypeScript SDK for low-latency Solana DEX trading bots. Built for speed and efficiency, it enables seamless, high-throughput interaction with PumpFun, Pump AMM (PumpSwap), Bonk, Meteora DAMM v2, Raydium AMM v4, and Raydium CPMM for latency-critical trading strategies.</strong>
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
    <a href="https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/README_CN.md">中文</a> |
    <a href="https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/README.md">English</a> |
    <a href="https://fnzero.dev/">Website</a> |
    <a href="https://t.me/fnzero_group">Telegram</a> |
    <a href="https://discord.gg/vuazbGkqQE">Discord</a>
</p>

> ☕ **Support This Project**
>
> This SDK is completely free and open source. However, maintaining and continuously updating it requires significant AI computing resources and token consumption. If this SDK helps with your development, consider making a monthly SOL donation — any amount is appreciated and helps keep this project alive!
>
> **Donation Wallet:** `6oW7AXz1yRb57pYSxysuXnMs2aR1ha5rzGzReZ1MjPV8`

## 📋 Table of Contents

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [🛠️ Usage Examples](#️-usage-examples)
  - [📋 Example Usage](#-example-usage)
  - [⚡ Trading Parameters](#-trading-parameters)
  - [📊 Usage Examples Summary Table](#-usage-examples-summary-table)
  - [⚙️ SWQoS Service Configuration](#️-swqos-service-configuration)
  - [🔧 Middleware System](#-middleware-system)
  - [🔍 Address Lookup Tables](#-address-lookup-tables)
  - [🔍 Nonce Cache](#-nonce-cache)
- [💰 Cashback Support (PumpFun / PumpSwap)](#-cashback-support-pumpfun--pumpswap)
- [🛡️ MEV Protection Services](#️-mev-protection-services)
- [📁 Project Structure](#-project-structure)
- [📄 License](#-license)
- [💬 Contact](#-contact)
- [⚠️ Important Notes](#️-important-notes)

---

## 📦 SDK Versions

This SDK is available in multiple languages:

| Language | Repository | Description |
|----------|------------|-------------|
| **Rust** | [sol-trade-sdk](https://github.com/0xfnzero/sol-trade-sdk) | Ultra-low latency with zero-copy optimization |
| **Node.js** | [sol-trade-sdk-nodejs](https://github.com/0xfnzero/sol-trade-sdk-nodejs) | TypeScript/JavaScript for Node.js |
| **Python** | [sol-trade-sdk-python](https://github.com/0xfnzero/sol-trade-sdk-python) | Async/await native support |
| **Go** | [sol-trade-sdk-golang](https://github.com/0xfnzero/sol-trade-sdk-golang) | Concurrent-safe with goroutine support |

## What This SDK Is For

`sol-trade-sdk-nodejs` brings the FnZero Solana trading SDK to TypeScript and Node.js. It is built for JavaScript/TypeScript trading bots, copy-trading services, sniper bots, backend automation, and DEX integrations that need low-latency transaction construction with Rust SDK behavior parity.

| Area | Coverage |
|------|----------|
| DEX protocols | PumpFun, PumpSwap, Bonk, Meteora DAMM v2, Raydium AMM v4, Raydium CPMM |
| Submit lanes | Default Solana RPC plus Jito, Nextblock, ZeroSlot, Temporal, Bloxroute, FlashBlock, BlockRazor, Node1, Astralane, Solami, and other SWQoS providers |
| Trading workflows | `buySimple` / `sellSimple`, legacy buy/sell params, copy trading, sniper trading, address lookup tables, durable nonce, middleware, shared infrastructure |
| Runtime | Node.js 18+, TypeScript, npm/yarn/pnpm projects |

## 🔖 Current Release

**npm package:** `sol-trade-sdk@0.1.3`

This release refreshes PumpFun V2 and USDC quote-pool handling, keeps the default RPC submit lane active alongside SWQoS lanes, and aligns Raydium CPMM fixed-output swaps with the on-chain `swap_base_out` instruction. Trade execution requires a caller-supplied `recentBlockhash` or durable nonce; hot-path execution does not query RPC for blockhash, account, or balance data.

## Rust v4.0.21 Parity

This SDK now tracks the Rust SDK `v4.0.21` public behavior for high-level trade intent APIs and SWQoS provider coverage. New code can use `buySimple` / `sellSimple` with `AccountPolicy`, `BuyAmount`, and `SellAmount`; these convert to the existing `buy` / `sell` params without removing the legacy API. SWQoS coverage includes the Rust `Solami` type and defaults (`beam.solami.dev:11000`, min tip `0.0001 SOL`); live Solami submit uses the main QUIC client path and requires the same base58 Solana keypair api token model as Rust. Explicit SWQoS routes still keep the default RPC lane appended. Legacy extended provider classes such as `Triton`, `QuickNode`, `Syndica`, `Figment`, and `Alchemy` are kept only for source compatibility and are not part of Rust `v4.0.21` trading provider parity.

## ✨ Features

1. **PumpFun Trading**: Unified `buy`, `sell`, and `buy_exact_quote_in` flow with automatic legacy or V2 instruction selection for SOL and USDC quote pools
2. **PumpSwap Trading**: Support for PumpSwap pool trading operations
3. **Bonk Trading**: Support for Bonk trading operations
4. **Raydium CPMM Trading**: Support for Raydium CPMM (Concentrated Pool Market Maker) trading operations
5. **Raydium AMM V4 Trading**: Support for Raydium AMM V4 (Automated Market Maker) trading operations
6. **Meteora DAMM V2 Trading**: Support for Meteora DAMM V2 (Dynamic AMM) trading operations
7. **Multiple MEV Protection**: Support for Jito, Nextblock, ZeroSlot, Temporal, Bloxroute, FlashBlock, BlockRazor, Node1, Astralane and other services
8. **Concurrent Trading**: Submit through every configured SWQoS provider plus the default RPC lane; the first accepted result can return early while slower routes continue submitting
9. **Unified Trading Interface**: Use unified trading protocol types for trading operations, including Rust-parity `buySimple` / `sellSimple` intent params
10. **Middleware System**: Support for custom instruction middleware to modify, add, or remove instructions before transaction execution
11. **Shared Infrastructure**: Share expensive RPC and SWQoS clients across multiple wallets for reduced resource usage
12. **Hot-Path RPC Boundary**: Trade execution uses caller-supplied blockhash or durable nonce and never queries RPC for blockhash, account, or balance data

## 📦 Installation

### Direct Clone (Recommended)

Clone this project to your project directory:

```bash
cd your_project_root_directory
git clone https://github.com/0xfnzero/sol-trade-sdk-nodejs
```

Install dependencies and build:

```bash
cd sol-trade-sdk-nodejs
npm install
npm run build
```

Add to your `package.json`:

```json
{
  "dependencies": {
    "sol-trade-sdk": "./sol-trade-sdk-nodejs"
  }
}
```

### Use NPM

```bash
npm install sol-trade-sdk@0.1.3
# or
yarn add sol-trade-sdk@0.1.3
# or
pnpm add sol-trade-sdk@0.1.3
```

## 🛠️ Usage Examples

### 📋 Example Usage

For the high-level intent API, see [Simple Trading](examples/simple_trading.ts). It shows `createSimpleBuyParams`, `BuyAmount.WithMaxInput`, `AccountPolicy.Auto`, and the conversion to legacy `TradeBuyParams`.

#### 1. Create TradingClient Instance

You can refer to [Example: Create TradingClient Instance](examples/trading_client.ts).

**Method 1: Simple (single wallet)**
```typescript
import { TradingClient, TradeConfig, SwqosConfig, SwqosRegion } from 'sol-trade-sdk';

// Wallet
const payer = Keypair.fromSecretKey(/* your keypair */);

// RPC URL
const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=xxxxxx";

// Multiple SWQoS services can be configured
const swqosConfigs: SwqosConfig[] = [
  { type: 'Default', rpcUrl },
  { type: 'Jito', uuid: "your_uuid", region: SwqosRegion.Frankfurt },
  { type: 'Bloxroute', apiToken: "your_api_token", region: SwqosRegion.Frankfurt },
  { type: 'Astralane', apiKey: "your_api_key", region: SwqosRegion.Frankfurt },
];

// Create TradeConfig instance
const tradeConfig = new TradeConfig(rpcUrl, swqosConfigs);

// Create TradingClient
const client = new TradingClient(payer, tradeConfig);
```

**Method 2: Shared infrastructure (multiple wallets)**

For multi-wallet scenarios, create the infrastructure once and share it across wallets.
See [Example: Shared Infrastructure](examples/shared_infrastructure.ts).

```typescript
import { TradingInfrastructure, InfrastructureConfig } from 'sol-trade-sdk';

// Create infrastructure once (expensive)
const infraConfig = new InfrastructureConfig(rpcUrl, swqosConfigs);
const infrastructure = new TradingInfrastructure(infraConfig);

// Create multiple clients sharing the same infrastructure (fast)
const client1 = TradingClient.fromInfrastructure(payer1, infrastructure);
const client2 = TradingClient.fromInfrastructure(payer2, infrastructure);
```

#### 2. Configure Gas Fee Strategy

```typescript
import { GasFeeStrategy } from 'sol-trade-sdk';

// Create GasFeeStrategy instance
const gasFeeStrategy = new GasFeeStrategy();
// Set global strategy
gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);
```

#### 3. Build Trading Parameters

```typescript
import {
  AccountPolicy,
  BuyAmount,
  DexType,
  TradeTokenType,
  createSimpleBuyParams,
  simpleBuyParamsToTradeBuyParams,
  withSimpleBuyAccountPolicy,
  withSimpleBuySlippage,
} from 'sol-trade-sdk';

const simple = withSimpleBuyAccountPolicy(
  withSimpleBuySlippage(
    createSimpleBuyParams(
      DexType.PumpSwap,
      TradeTokenType.WSOL,
      mintPubkey,
      BuyAmount.WithMaxInput(buySolAmount),
      { type: 'PumpSwap', params: pumpSwapParams },
      recentBlockhash,
      gasFeeStrategy
    ),
    500
  ),
  AccountPolicy.Auto
);

const buyParams = simpleBuyParamsToTradeBuyParams(simple);
```

#### 4. Execute Trading

```typescript
const result = await client.buy(buyParams);
console.log(`Transaction signature: ${result.signature}`);
```

### ⚡ Trading Parameters

For comprehensive information about all trading parameters including `TradeBuyParams` and `TradeSellParams`, see the Trading Parameters documentation.

#### About ShredStream

When using shred to subscribe to events, due to the nature of shreds, you cannot get complete information about transaction events.
Please ensure that the parameters your trading logic depends on are available in shreds when using them.

### 📊 Usage Examples Summary Table

| Description | Run Command | Source Code |
|-------------|-------------|-------------|
| Create and configure TradingClient instance | `npx ts-node examples/trading_client.ts` | [examples/trading_client.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/trading_client.ts) |
| Share infrastructure across multiple wallets | `npx ts-node examples/shared_infrastructure.ts` | [examples/shared_infrastructure.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/shared_infrastructure.ts) |
| PumpFun token sniping trading | `npx ts-node examples/pumpfun_sniper_trading.ts` | [examples/pumpfun_sniper_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpfun_sniper_trading.ts) |
| PumpFun token copy trading | `npx ts-node examples/pumpfun_copy_trading.ts` | [examples/pumpfun_copy_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpfun_copy_trading.ts) |
| PumpSwap trading operations | `npx ts-node examples/pumpswap_trading.ts` | [examples/pumpswap_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpswap_trading.ts) |
| PumpSwap direct trading (via RPC) | `npx ts-node examples/pumpswap_direct_trading.ts` | [examples/pumpswap_direct_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpswap_direct_trading.ts) |
| Raydium CPMM trading operations | `npx ts-node examples/raydium_cpmm_trading.ts` | [examples/raydium_cpmm_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/raydium_cpmm_trading.ts) |
| Raydium AMM V4 trading operations | `npx ts-node examples/raydium_amm_v4_trading.ts` | [examples/raydium_amm_v4_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/raydium_amm_v4_trading.ts) |
| Meteora DAMM V2 trading operations | `npx ts-node examples/meteora_damm_v2_trading.ts` | [examples/meteora_damm_v2_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/meteora_damm_v2_trading.ts) |
| Bonk token sniping trading | `npx ts-node examples/bonk_sniper_trading.ts` | [examples/bonk_sniper_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/bonk_sniper_trading.ts) |
| Bonk token copy trading | `npx ts-node examples/bonk_copy_trading.ts` | [examples/bonk_copy_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/bonk_copy_trading.ts) |
| Custom instruction middleware example | `npx ts-node examples/middleware_system.ts` | [examples/middleware_system.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/middleware_system.ts) |
| Address lookup table example | `npx ts-node examples/address_lookup.ts` | [examples/address_lookup.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/address_lookup.ts) |
| Nonce cache (durable nonce) example | `npx ts-node examples/nonce_cache.ts` | [examples/nonce_cache.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/nonce_cache.ts) |
| Wrap/unwrap SOL to/from WSOL example | `npx ts-node examples/wsol_wrapper.ts` | [examples/wsol_wrapper.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/wsol_wrapper.ts) |
| Seed trading example | `npx ts-node examples/seed_trading.ts` | [examples/seed_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/seed_trading.ts) |
| Gas fee strategy example | `npx ts-node examples/gas_fee_strategy.ts` | [examples/gas_fee_strategy.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/gas_fee_strategy.ts) |
| Hot path trading (zero-RPC) | `npx ts-node examples/hot_path_trading.ts` | [examples/hot_path_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/hot_path_trading.ts) |

### ⚙️ SWQoS Service Configuration

When configuring SWQoS services, note the different parameter requirements for each service:

- **Jito**: The first parameter is UUID (if no UUID, pass an empty string `""`)
- **Other MEV services**: The first parameter is the API Token

#### Custom URL Support

Each SWQoS service supports an optional custom URL parameter:

```typescript
// Using custom URL
const jitoConfig: SwqosConfig = {
  type: 'Jito',
  uuid: "your_uuid",
  region: SwqosRegion.Frankfurt,
  customUrl: "https://custom-jito-endpoint.com"
};

// Using default regional endpoint
const bloxrouteConfig: SwqosConfig = {
  type: 'Bloxroute',
  apiToken: "your_api_token",
  region: SwqosRegion.NewYork
};
```

**URL Priority Logic**:
- If a custom URL is provided, it will be used instead of the regional endpoint
- If no custom URL is provided, the system will use the default endpoint for the specified region
- This allows for maximum flexibility while maintaining backward compatibility

When using multiple MEV services, you need to use `Durable Nonce`. You need to use the `fetchNonceInfo` function to get the latest `nonce` value, and use it as the `durableNonce` when trading.

---

### 🔧 Middleware System

The SDK provides a powerful middleware system that allows you to modify, add, or remove instructions before transaction execution. Middleware executes in the order they are added:

```typescript
import { MiddlewareManager, ValidationMiddleware, TimerMiddleware } from 'sol-trade-sdk';

const manager = new MiddlewareManager()
  .addMiddleware(new FirstMiddleware())   // Executes first
  .addMiddleware(new SecondMiddleware())  // Executes second
  .addMiddleware(new ThirdMiddleware());  // Executes last
```

### 🔍 Address Lookup Tables

Address Lookup Tables (ALT) allow you to optimize transaction size and reduce fees by storing frequently used addresses in a compact table format.

```typescript
import { fetchAddressLookupTableAccount, AddressLookupTableCache } from 'sol-trade-sdk';

// Fetch ALT from chain
const alt = await fetchAddressLookupTableAccount(rpc, altAddress);
console.log(`ALT contains ${alt.addresses.length} addresses`);

// Use cache for performance
const cache = new AddressLookupTableCache(rpc);
await cache.prefetch([altAddress1, altAddress2, altAddress3]);
const cached = cache.get(altAddress1);
```

### 🔍 Durable Nonce

Use Durable Nonce to implement transaction replay protection and optimize transaction processing.

```typescript
import { fetchNonceInfo, NonceCache } from 'sol-trade-sdk';

// Fetch nonce info
const nonceInfo = await fetchNonceInfo(rpc, nonceAccount);
```

## 💰 Cashback Support (PumpFun / PumpSwap)

PumpFun and PumpSwap support **cashback** for eligible tokens: part of the trading fee can be returned to the user. The SDK **must know** whether the token has cashback enabled so that buy/sell instructions include the correct accounts.

- **When params come from RPC**: If you use `PumpFunParams.fromMintByRpc` or `PumpSwapParams.fromPoolAddressByRpc`, the SDK reads `isCashbackCoin` from chain—no extra step.
- **When params come from decoded events**: If you build params from already-decoded trade events (for example from a parser service), you **must** pass the cashback flag into the SDK:
  - **PumpFun**: Set `isCashbackCoin` when building params from decoded events.
  - **PumpSwap**: Set `isCashbackCoin` field when constructing params manually.

## 🛡️ MEV Protection Services

You can apply for a key through the official website: [Community Website](https://fnzero.dev/swqos)

- **Jito**: High-performance block space
- **ZeroSlot**: Zero-latency transactions
- **Temporal**: Time-sensitive transactions
- **Bloxroute**: Blockchain network acceleration
- **FlashBlock**: High-speed transaction execution with API key authentication
- **BlockRazor**: High-speed transaction execution with API key authentication
- **Node1**: High-speed transaction execution with API key authentication
- **Astralane**: Blockchain network acceleration

## 📁 Project Structure

```
src/
├── common/           # Common functionality and tools
├── constants/        # Constant definitions
├── instruction/      # Instruction building
│   └── utils/        # Instruction utilities
├── swqos/            # MEV service clients
├── trading/          # Unified trading engine
│   ├── common/       # Common trading tools
│   ├── core/         # Core trading engine
│   ├── middleware/   # Middleware system
│   └── factory.ts    # Trading factory
├── utils/            # Utility functions
│   ├── calc/         # Amount calculation utilities
│   └── price/        # Price calculation utilities
└── index.ts          # Main library file
```

## 📄 License

MIT License

## 💬 Contact

- Official Website: https://fnzero.dev/
- Project Repository: https://github.com/0xfnzero/sol-trade-sdk-nodejs
- Telegram Group: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE

## ⚠️ Important Notes

1. Test thoroughly before using on mainnet
2. Properly configure private keys and API tokens
3. Pay attention to slippage settings to avoid transaction failures
4. Monitor balances and transaction fees
5. Comply with relevant laws and regulations
