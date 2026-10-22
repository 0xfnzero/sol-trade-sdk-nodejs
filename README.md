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
    <a href="#license">
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

Current version: **9.0.1**. Read the [migration notes](RELEASE_NOTES.md) before upgrading; see the [changelog](CHANGELOG.md) for historical changes.

## Contents

Pump.fun defaults to V3 with per-request V1/V2/V3 overrides. See [version configuration, multi-hop examples and simulation limits](docs/PUMPFUN_VERSIONS.md).

- [SDK Versions and Related SDKs](#sdk-versions-and-related-sdks)
- [Installation](#installation)
- [What This SDK Is For](#what-this-sdk-is-for)
- [Features](#features)
- [Usage Examples](#usage-examples)
- [Documentation](#documentation)
- [PumpSwap cached routes](#pumpswap-custom-quotes-and-cache-only-route-preparation)

<a id="sdk-versions-and-related-sdks"></a>

## 📦 SDK Versions and Related SDKs

Repositories are versioned independently; follow each SDK’s installation guide for compatible dependencies.

| Language | Repository | Purpose | Version |
|----------|------------|-------------|---------|
| Rust | [sol-parser-sdk](https://github.com/0xfnzero/sol-parser-sdk) | DEX transaction and account event parsing | `v0.9.1` |
| Node.js | [sol-parser-sdk-nodejs](https://github.com/0xfnzero/sol-parser-sdk-nodejs) | DEX transaction and account event parsing | `v0.9.1` |
| Python | [sol-parser-sdk-python](https://github.com/0xfnzero/sol-parser-sdk-python) | DEX transaction and account event parsing | `v0.9.1` |
| Go | [sol-parser-sdk-golang](https://github.com/0xfnzero/sol-parser-sdk-golang) | DEX transaction and account event parsing | `v0.9.1` |
| Rust | [sol-trade-sdk](https://github.com/0xfnzero/sol-trade-sdk) | Transaction building, signing and multi-channel submission | `v9.0.1` |
| Node.js | [sol-trade-sdk-nodejs](https://github.com/0xfnzero/sol-trade-sdk-nodejs) | Transaction building, signing and multi-channel submission | `v9.0.1` |
| Python | [sol-trade-sdk-python](https://github.com/0xfnzero/sol-trade-sdk-python) | Transaction building, signing and multi-channel submission | `v9.0.1` |
| Go | [sol-trade-sdk-golang](https://github.com/0xfnzero/sol-trade-sdk-golang) | Transaction building, signing and multi-channel submission | `v9.0.1` |
| Rust | [sol-shred-sdk](https://github.com/0xfnzero/sol-shred-sdk) | Raw shred decoding and ShredStream instruction events | `v6.0.1` |
| Rust | [solana-streamer](https://github.com/0xfnzero/solana-streamer) | gRPC / ShredStream subscriptions and event streaming | `v5.0.0` |
| Rust | [sol-trade-router-sdk](https://github.com/0xfnzero/sol-trade-router-sdk) | On-chain multi-hop router and client SDK | `v0.3.0` |

<a id="installation"></a>

## Installation

```sh
npm install sol-trade-sdk@9.0.1
```

To run repository examples or contribute, clone the source:

```sh
git clone https://github.com/0xfnzero/sol-trade-sdk-nodejs
cd sol-trade-sdk-nodejs
npm install
npm run build
```

See [the example index](examples/README.md) for configuration and offline versus live workflows.

<a id="what-this-sdk-is-for"></a>

## What This SDK Is For

`sol-trade-sdk-nodejs` brings the FnZero Solana trading SDK to TypeScript and Node.js. It is built for JavaScript/TypeScript trading bots, copy-trading services, sniper bots, backend automation, and DEX integrations that need low-latency transaction construction with Rust SDK behavior parity.

| Area | Coverage |
|------|----------|
| DEX protocols | PumpFun, PumpSwap, Bonk, Meteora DAMM v2, Raydium AMM v4, Raydium CPMM |
| Submit lanes | Default Solana RPC plus Jito, ZeroSlot, Temporal, Bloxroute, FlashBlock, BlockRazor, Node1, Astralane, Stellium, Lightspeed, Soyas, Speedlanding, Helius, and Solami; NextBlock remains Rust-blacklisted by default |
| Trading workflows | `buySimple` / `sellSimple`, legacy buy/sell params, copy trading, sniper trading, address lookup tables, durable nonce, middleware, shared infrastructure |
| Runtime | Node.js 18+, TypeScript, npm/yarn/pnpm projects |

<a id="features"></a>

## ✨ Features

1. **PumpFun Trading**: Unified `buy`, `sell`, and `buy_exact_quote_in` flow with automatic legacy or V2 instruction selection for SOL and USDC quote pools
2. **PumpSwap Trading**: Support for PumpSwap pool trading operations
3. **Bonk Trading**: Support for Bonk trading operations
4. **Raydium CPMM Trading**: Support for Raydium CPMM (Constant Product Market Maker) trading operations
5. **Raydium AMM V4 Trading**: Support for Raydium AMM V4 (Automated Market Maker) trading operations
6. **Meteora DAMM V2 Trading**: Support for Meteora DAMM V2 (Dynamic AMM) trading operations
7. **Multiple MEV Protection**: Support for the Rust v5.0.2 SWQoS set, including Jito, ZeroSlot, Temporal, Bloxroute, FlashBlock, BlockRazor, Node1, Astralane, Stellium, Lightspeed, Soyas, Speedlanding, Helius, Solami, LunarLander, Glaive, and Default RPC
8. **Concurrent Trading**: Submit through every configured SWQoS provider plus the default RPC lane; the first accepted result can return early while slower routes continue submitting
9. **Unified Trading Interface**: Use unified trading protocol types for trading operations, including Rust-parity `buySimple` / `sellSimple` intent params
10. **Middleware System**: Support for custom instruction middleware to modify, add, or remove instructions before transaction execution
11. **Shared Infrastructure**: Share expensive RPC and SWQoS clients across multiple wallets for reduced resource usage
12. **Hot-Path RPC Boundary**: Trade execution uses caller-supplied blockhash or durable nonce and never queries RPC for blockhash, account, or balance data

<a id="usage-examples"></a>

## 🛠️ Usage Examples

### 📋 Trading workflow

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

Temporal uses HTTP/3 QUIC first and Binary Batch HTTP as its default fallback. BlockRazor uses gRPC `SendBinaryTransaction` first and JSON HTTP as fallback. Astralane uses persistent QUIC first and Binary HTTP as fallback. Explicit transport settings force one protocol; a custom URL without a transport remains an explicit HTTP route.

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

### Example index

See the [example index](examples/README.md) for workflows, commands and configuration requirements.

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

<a id="cashback-support-pumpfun-pumpswap"></a>

## 💰 Cashback Support (PumpFun / PumpSwap)

PumpFun and PumpSwap support **cashback** for eligible tokens: part of the trading fee can be returned to the user. The SDK **must know** whether the token has cashback enabled so that buy/sell instructions include the correct accounts.

- **When params come from RPC**: If you use `PumpFunParams.fromMintByRpc` or `PumpSwapParams.fromPoolAddressByRpc`, the SDK reads `isCashbackCoin` from chain—no extra step.
- **When params come from decoded events**: If you build params from already-decoded trade events (for example from a parser service), you **must** pass the cashback flag into the SDK:
  - **PumpFun**: Set `isCashbackCoin` when building params from decoded events.
  - **PumpSwap**: Set `isCashbackCoin` field when constructing params manually.

<a id="mev-protection-services"></a>

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

<a id="project-structure"></a>

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

<a id="important-notes"></a>

## ⚠️ Important Notes

1. Test thoroughly before using on mainnet
2. Properly configure private keys and API tokens
3. Pay attention to slippage settings to avoid transaction failures
4. Monitor balances and transaction fees
5. Comply with relevant laws and regulations

<a id="api-compatibility"></a>

## API compatibility

Full cross-language API parity is still in progress. See the [API migration guide](docs/USAGE.md#api-compatibility) for public behavior and support boundaries, and the examples directory for usage.


Live parser-to-trade integration uses Yellowstone **gRPC**. See [gRPC cache integration and language examples](docs/USAGE.md#grpc-cache). Quoting and construction read cached state without hot-path RPC.


See [cached_damm_v2](examples/cached_damm_v2.ts) for single-hop DAMM v2 cached preparation and explicit simulation. Callers supply a minimum output; expected net receipts remain unknown. Native SOL and existing WSOL settle through different accounts. Reading PumpFun configuration alone does not provide complete fee quotes or a cached factory.

<a id="optional-per-route-minimum-tip"></a>

## Optional per-route minimum tip

Each SWQOS route can optionally set a minimum tip in SOL, accepting decimals such as `0.0001` (internally rounded to whole lamports). Buy/sell fee lanes below this threshold are skipped before building the route tip instruction, signing or submitting its transaction. Equality is accepted. Omitting the option preserves existing behavior; zero accepts non-negative tips. This limit applies independently of the existing `check_min_tip` / `checkMinTip` option, whose behavior is preserved. Other eligible routes, including default RPC, still participate.

```typescript
const provider: SwqosConfig = {
  type: SwqosType.Jito,
  apiKey: 'your_uuid',
  region: SwqosRegion.Frankfurt,
  minTipSol: 0.0001, // SOL; omit to preserve existing behavior
};
```

<a id="pumpswap-custom-quotes-and-cache-only-route-preparation"></a>

## PumpSwap custom quotes and cache-only route preparation

See [reported 3007 failure and synchronized fixes](docs/PUMPSWAP_REPORTED_FAILURE.md)
for creator validation, explicit fee recipients and readonly volume accounts.

`buildBuyInstructions` / `buildSellInstructions` in `instruction/pumpswap` accept
`inputMint`, `outputMint`, and optional endpoint token programs. Supply both mints:
these select the actual quote-to-base buy or base-to-quote sell instruction,
including custom Token-2022 quotes. A SOL request against a custom quote pool
requires a conversion route. Creator vault authority/quote ATA and token programs
are validated locally; high-level trades retain supplied creator and fee context.
Direct builders require `coinCreator` and complete execution accounts. Enrich
incomplete parser log events from a verified pool snapshot before building.
Cache preparation reads and validates the complete creator identity from the
captured pool state.

`preparePumpSwapTrade(request, orderedHints)` freezes an explicit path;
`searchPumpSwapTrade(request, {pool, tokenMint, assetMint, conversionPools})`
chooses the largest final protected output from supplied cached conversion pools.
Buy and Sell are prepared independently. Each following leg spends only the
preceding protected credit; intermediate surplus may remain in token accounts.
Search defaults to two conversion hops and 128 visited nodes, with limits of
32 supplied hints, three conversion hops and 4096 nodes. Budget exhaustion rejects
the search rather than returning an incomplete result. Ties prefer fewer hops,
then raw pool public-key bytes. Invalid candidate routes are reported separately.
There is no network pool discovery, split routing or packet-cost ranking.

Call `trade.buildSigned({context, recentBlockhash, signers, version, ...})` to build
a complete signed transaction offline. Version 0 supports caller-provided ALTs,
durable nonce, compute budget, explicit tip and middleware, with a 1232-byte packet
limit. Version 1 uses the existing native V1 serializer (4096-byte limit; no ALTs).
A prepared quote rejects epoch changes and excess slot age. Native SOL uses an
explicit temporary WSOL account; supply a unique seed and cached rent. The SDK
does not fetch blockhash/rent/ALTs, simulate, confirm or broadcast during this path.
Cashback quotes lacking verified fee context and active transfer-fee quotes fail
closed. Cache slot age is a bound, not proof of fork consistency or execution.

Repeatable native TypeScript fixture replay and signature verification:

```bash
npx tsx examples/pumpswap_cached_prepare.ts
npx vitest run tests/pumpswap_preparation.test.ts
npm run typecheck:examples
```

The example replays captured TTWO/USDC/WSOL account bytes without RPC and signs
independent buy/sell conversion transactions. These are offline quote, wire and
signature tests, not claims of fresh mainnet prices, BPF bank execution or measured
production latency. Existing generic candidate-route APIs retain their first
executable route behavior; use the dedicated PumpSwap search for output ranking.

Actual local SBF execution, using pinned deployed programs and captured accounts:

```bash
npx tsx examples/pumpswap_offline_bank.ts
npx vitest run tests/pumpswap_offline_bank.test.ts
```

This separate example executes independent direct buys/sells with static keys and
ALTs plus full SOL → USDC → TTWO → target routes and their reverse. It checks
success, excessive-minimum rollback, invalid signatures/ALTs, simulation/send
state equality and deterministic fresh-bank repetition without RPC. See
[fixture provenance and configuration](examples/pumpswap_bank/README.md); program
and account captures come from different historical slots, and wallet funding is
synthetic. Optional configuration measures local prepare/sign overhead separately;
it does not measure production latency.

<a id="repeatable-local-hot-path-benchmark"></a>

## Repeatable local hot-path benchmark

```sh
npx tsx examples/hotpath_benchmark.ts
# Optional: pass the path to your edited JSON configuration
npx tsx examples/hotpath_benchmark.ts examples/hotpath_benchmark.json
```

The checked-in JSON config controls warmup, sample count and batch size. Fixture
loading and setup occur before timing; timed loops perform no RPC or network I/O.
The fixed workloads measure three-hop PumpSwap preparation, route search and
prepared V1 transaction building/signing separately.
Output reports p50/p95/p99 of batch-normalized microseconds per transaction, a
checksum and runtime metadata. These local CPU distributions include scheduling
and GC effects; they measure neither provider/network latency nor production
landing speed. Compare warmed runs with the same runtime, config and host load.

<a id="documentation"></a>

## Documentation

- [Release and migration](RELEASE_NOTES.md)
- [Usage guide](docs/USAGE.md)
- [Examples](examples/README.md)
- [Cross-language support and boundaries](docs/cross-language-sync.md)


<a id="license"></a>

## 📄 License

MIT License

<a id="contact"></a>

## 💬 Contact

- Official Website: https://fnzero.dev/
- Project Repository: https://github.com/0xfnzero/sol-trade-sdk-nodejs
- Telegram Group: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE


Shared stock bridges: 33 official stock/ETF mints and 58 pools. See [eleven-SDK catalog and routing alignment](docs/STOCK_BRIDGE_SYNC.md) for configuration, USDC routing and cache-only boundaries.
