<div align="center">
    <h1>🚀 Sol Trade SDK for Node.js</h1>
    <h3><em>全面的 TypeScript SDK，用于无缝 Solana DEX 交易</em></h3>
</div>

<p align="center">
    <strong>一个面向低延迟 Solana DEX 交易机器人的高性能 TypeScript SDK。该 SDK 以速度和效率为核心设计，支持与 PumpFun、Pump AMM（PumpSwap）、Bonk、Meteora DAMM v2、Raydium AMM v4 以及 Raydium CPMM 进行无缝、高吞吐量的交互，适用于对延迟高度敏感的交易策略。</strong>
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
    <a href="https://fnzero.dev/">官网</a> |
    <a href="https://t.me/fnzero_group">Telegram</a> |
    <a href="https://discord.gg/vuazbGkqQE">Discord</a>
</p>

> ☕ **支持本项目**
>
> 本 SDK 完全免费且开源。但维护和持续更新需要消耗大量 AI 算力与 Token。如果这个 SDK 对您的开发有帮助，欢迎每月捐赠任意数量的 SOL，您的支持将帮助这个项目持续运行！
>
> **捐赠钱包：** `6oW7AXz1yRb57pYSxysuXnMs2aR1ha5rzGzReZ1MjPV8`

## 📋 目录

- [✨ 项目特性](#-项目特性)
- [📦 安装](#-安装)
- [🛠️ 使用示例](#️-使用示例)
  - [📋 使用示例](#-使用示例)
  - [⚡ 交易参数](#-交易参数)
  - [📊 使用示例汇总表格](#-使用示例汇总表格)
  - [⚙️ SWQoS 服务配置说明](#️-swqos-服务配置说明)
  - [🔧 中间件系统说明](#-中间件系统说明)
  - [🔍 地址查找表](#-地址查找表)
  - [🔍 Nonce 缓存](#-nonce-缓存)
- [💰 Cashback 支持（PumpFun / PumpSwap）](#-cashback-支持pumpfun--pumpswap)
- [🛡️ MEV 保护服务](#️-mev-保护服务)
- [📁 项目结构](#-项目结构)
- [📄 许可证](#-许可证)
- [💬 联系方式](#-联系方式)
- [⚠️ 重要注意事项](#️-重要注意事项)

---

## 📦 SDK 版本

本 SDK 提供多种语言版本：

| 语言 | 仓库 | 描述 |
|------|------|------|
| **Rust** | [sol-trade-sdk](https://github.com/0xfnzero/sol-trade-sdk) | 超低延迟，零拷贝优化 |
| **Node.js** | [sol-trade-sdk-nodejs](https://github.com/0xfnzero/sol-trade-sdk-nodejs) | TypeScript/JavaScript，Node.js 支持 |
| **Python** | [sol-trade-sdk-python](https://github.com/0xfnzero/sol-trade-sdk-python) | 原生 async/await 支持 |
| **Go** | [sol-trade-sdk-golang](https://github.com/0xfnzero/sol-trade-sdk-golang) | 并发安全，goroutine 支持 |

## 这个 SDK 适合什么场景

`sol-trade-sdk-nodejs` 将 FnZero Solana 交易 SDK 带到 TypeScript 和 Node.js 生态，适合 JavaScript/TypeScript 交易机器人、跟单服务、狙击机器人、后端自动化和 DEX 集成场景，在保持 Rust SDK 行为对齐的同时提供低延迟交易构建能力。

| 方向 | 覆盖范围 |
|------|----------|
| DEX 协议 | PumpFun、PumpSwap、Bonk、Meteora DAMM v2、Raydium AMM v4、Raydium CPMM |
| 提交通道 | 默认 Solana RPC，以及 Jito、ZeroSlot、Temporal、Bloxroute、FlashBlock、BlockRazor、Node1、Astralane、Stellium、Lightspeed、Soyas、Speedlanding、Helius、Solami；NextBlock 默认仍按 Rust 黑名单跳过 |
| 交易流程 | `buySimple` / `sellSimple`、旧版 buy/sell 参数、跟单交易、狙击交易、地址查找表、durable nonce、中间件、共享基础设施 |
| 运行环境 | Node.js 18+、TypeScript、npm/yarn/pnpm 项目 |

## 🔖 当前版本

**npm package:** `sol-trade-sdk@0.1.3`

本版本刷新 PumpFun V2 与 USDC quote 池处理逻辑，确保默认 RPC 提交通道会和 SWQoS 通道一起发出，并将 Raydium CPMM fixed-output 交易对齐到链上 `swap_base_out` 指令。交易执行必须由调用方传入 `recentBlockhash` 或 durable nonce；热路径不会查询 RPC 获取 blockhash、账户或余额数据。

## Rust v4.0.21 对齐

本 SDK 现在按 Rust SDK `v4.0.21` 对齐高层交易 intent API 和 SWQoS provider 覆盖。新代码可以使用 `buySimple` / `sellSimple`，并通过 `AccountPolicy`、`BuyAmount`、`SellAmount` 描述意图；内部会转换到现有 `buy` / `sell` 参数，不移除旧 API。SWQoS 已包含 Rust 的 `Solami` 类型与默认配置（`beam.solami.dev:11000`，最小 tip `0.0001 SOL`）；真实 Solami 提交走主 QUIC client 路径，并需要和 Rust 相同的 base58 Solana keypair api token。配置显式 SWQoS 时仍会自动追加默认 RPC 通道。NextBlock 仍按 Rust parity 黑名单过滤，除非 Rust 后续改变该行为。`Triton`、`QuickNode`、`Syndica`、`Figment`、`Alchemy` 等历史 extended provider 类仅为源码兼容保留，不属于 Rust `v4.0.21` 交易 provider 对齐范围。

## ✨ 项目特性

1. **PumpFun 交易**: 统一 `buy`、`sell`、`buy_exact_quote_in` 流程，自动按 SOL 或 USDC quote 池选择旧版或 V2 链上指令
2. **PumpSwap 交易**: 支持 PumpSwap 池的交易操作
3. **Bonk 交易**: 支持 Bonk 的交易操作
4. **Raydium CPMM 交易**: 支持 Raydium CPMM (Concentrated Pool Market Maker) 的交易操作
5. **Raydium AMM V4 交易**: 支持 Raydium AMM V4 (Automated Market Maker) 的交易操作
6. **Meteora DAMM V2 交易**: 支持 Meteora DAMM V2 (Dynamic AMM) 的交易操作
7. **多种 MEV 保护**: 支持 Rust v4.0.21 SWQoS 集合，包括 Jito、ZeroSlot、Temporal、Bloxroute、FlashBlock、BlockRazor、Node1、Astralane、Stellium、Lightspeed、Soyas、Speedlanding、Helius、Solami 和默认 RPC
8. **并发交易**: 所有已配置的 SWQoS 通道和默认 RPC 通道都会发出提交；首个成功只影响返回，较慢通道会继续提交
9. **统一交易接口**: 使用统一的交易协议类型进行交易操作，并支持 Rust 对齐的 `buySimple` / `sellSimple` intent 参数
10. **中间件系统**: 支持自定义指令中间件，可在交易执行前对指令进行修改、添加或移除
11. **共享基础设施**: 多钱包可共享同一套 RPC 与 SWQoS 客户端，降低资源占用
12. **热路径 RPC 边界**: 交易执行使用调用方传入的 blockhash 或 durable nonce，不在热路径查询 blockhash、账户或余额

## 📦 安装

### 直接克隆（推荐）

将此项目克隆到您的项目目录：

```bash
cd your_project_root_directory
git clone https://github.com/0xfnzero/sol-trade-sdk-nodejs
```

安装依赖并构建：

```bash
cd sol-trade-sdk-nodejs
npm install
npm run build
```

在您的 `package.json` 中添加：

```json
{
  "dependencies": {
    "sol-trade-sdk": "./sol-trade-sdk-nodejs"
  }
}
```

### 使用 NPM

```bash
npm install sol-trade-sdk@0.1.3
# 或
yarn add sol-trade-sdk@0.1.3
# 或
pnpm add sol-trade-sdk@0.1.3
```

## 🛠️ 使用示例

### 📋 使用示例

高层 intent API 可参考 [Simple Trading](examples/simple_trading.ts)，示例展示 `createSimpleBuyParams`、`BuyAmount.WithMaxInput`、`AccountPolicy.Auto` 以及到旧版 `TradeBuyParams` 的转换。

#### 1. 创建 TradingClient 实例

您可以参考 [示例：创建 TradingClient 实例](examples/trading_client.ts)。

**方法一：简单方式（单钱包）**
```typescript
import { TradingClient, TradeConfig, SwqosConfig, SwqosRegion } from 'sol-trade-sdk';

// 钱包
const payer = Keypair.fromSecretKey(/* 您的密钥 */);

// RPC URL
const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=xxxxxx";

// 可配置多个 SWQoS 服务
const swqosConfigs: SwqosConfig[] = [
  { type: 'Default', rpcUrl },
  { type: 'Jito', uuid: "your_uuid", region: SwqosRegion.Frankfurt },
  { type: 'Bloxroute', apiToken: "your_api_token", region: SwqosRegion.Frankfurt },
  { type: 'Astralane', apiKey: "your_api_key", region: SwqosRegion.Frankfurt },
];

// 创建 TradeConfig 实例
const tradeConfig = new TradeConfig(rpcUrl, swqosConfigs);

// 创建 TradingClient
const client = new TradingClient(payer, tradeConfig);
```

**方法二：共享基础设施（多钱包）**

对于多钱包场景，创建一次基础设施并在钱包间共享。
参见 [示例：共享基础设施](examples/shared_infrastructure.ts)。

```typescript
import { TradingInfrastructure, InfrastructureConfig } from 'sol-trade-sdk';

// 创建一次基础设施（开销大）
const infraConfig = new InfrastructureConfig(rpcUrl, swqosConfigs);
const infrastructure = new TradingInfrastructure(infraConfig);

// 创建多个客户端共享同一基础设施（快速）
const client1 = TradingClient.fromInfrastructure(payer1, infrastructure);
const client2 = TradingClient.fromInfrastructure(payer2, infrastructure);
```

#### 2. 配置 Gas 费策略

```typescript
import { GasFeeStrategy } from 'sol-trade-sdk';

// 创建 GasFeeStrategy 实例
const gasFeeStrategy = new GasFeeStrategy();
// 设置全局策略
gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);
```

#### 3. 构建交易参数

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

#### 4. 执行交易

```typescript
const result = await client.buy(buyParams);
console.log(`交易签名: ${result.signature}`);
```

### ⚡ 交易参数

关于所有交易参数（包括 `TradeBuyParams` 和 `TradeSellParams`）的详细信息，请参阅交易参数文档。

#### 关于 ShredStream

使用 shred 订阅事件时，由于 shred 的特性，您无法获取交易事件的完整信息。
在使用时，请确保您的交易逻辑所依赖的参数在 shred 中可用。

### 📊 使用示例汇总表格

| 描述 | 运行命令 | 源码 |
|------|----------|------|
| 创建并配置 TradingClient 实例 | `npx ts-node examples/trading_client.ts` | [examples/trading_client.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/trading_client.ts) |
| 多钱包共享基础设施 | `npx ts-node examples/shared_infrastructure.ts` | [examples/shared_infrastructure.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/shared_infrastructure.ts) |
| PumpFun 代币狙击交易 | `npx ts-node examples/pumpfun_sniper_trading.ts` | [examples/pumpfun_sniper_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpfun_sniper_trading.ts) |
| PumpFun 代币跟单交易 | `npx ts-node examples/pumpfun_copy_trading.ts` | [examples/pumpfun_copy_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpfun_copy_trading.ts) |
| PumpSwap 交易操作 | `npx ts-node examples/pumpswap_trading.ts` | [examples/pumpswap_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpswap_trading.ts) |
| PumpSwap 直接交易（通过 RPC） | `npx ts-node examples/pumpswap_direct_trading.ts` | [examples/pumpswap_direct_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/pumpswap_direct_trading.ts) |
| Raydium CPMM 交易操作 | `npx ts-node examples/raydium_cpmm_trading.ts` | [examples/raydium_cpmm_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/raydium_cpmm_trading.ts) |
| Raydium AMM V4 交易操作 | `npx ts-node examples/raydium_amm_v4_trading.ts` | [examples/raydium_amm_v4_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/raydium_amm_v4_trading.ts) |
| Meteora DAMM V2 交易操作 | `npx ts-node examples/meteora_damm_v2_trading.ts` | [examples/meteora_damm_v2_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/meteora_damm_v2_trading.ts) |
| Bonk 代币狙击交易 | `npx ts-node examples/bonk_sniper_trading.ts` | [examples/bonk_sniper_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/bonk_sniper_trading.ts) |
| Bonk 代币跟单交易 | `npx ts-node examples/bonk_copy_trading.ts` | [examples/bonk_copy_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/bonk_copy_trading.ts) |
| 自定义指令中间件示例 | `npx ts-node examples/middleware_system.ts` | [examples/middleware_system.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/middleware_system.ts) |
| 地址查找表示例 | `npx ts-node examples/address_lookup.ts` | [examples/address_lookup.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/address_lookup.ts) |
| Nonce 缓存（持久 Nonce）示例 | `npx ts-node examples/nonce_cache.ts` | [examples/nonce_cache.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/nonce_cache.ts) |
| SOL 与 WSOL 互转示例 | `npx ts-node examples/wsol_wrapper.ts` | [examples/wsol_wrapper.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/wsol_wrapper.ts) |
| Seed 交易示例 | `npx ts-node examples/seed_trading.ts` | [examples/seed_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/seed_trading.ts) |
| Gas 费策略示例 | `npx ts-node examples/gas_fee_strategy.ts` | [examples/gas_fee_strategy.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/gas_fee_strategy.ts) |
| 热路径交易（零 RPC） | `npx ts-node examples/hot_path_trading.ts` | [examples/hot_path_trading.ts](https://github.com/0xfnzero/sol-trade-sdk-nodejs/blob/main/examples/hot_path_trading.ts) |

### ⚙️ SWQoS 服务配置说明

配置 SWQoS 服务时，请注意各服务的不同参数要求：

- **Jito**: 第一个参数是 UUID（如果没有 UUID，传空字符串 `""`）
- **其他 MEV 服务**: 第一个参数是 API Token

#### 自定义 URL 支持

每个 SWQoS 服务都支持可选的自定义 URL 参数：

```typescript
// 使用自定义 URL
const jitoConfig: SwqosConfig = {
  type: 'Jito',
  uuid: "your_uuid",
  region: SwqosRegion.Frankfurt,
  customUrl: "https://custom-jito-endpoint.com"
};

// 使用默认区域端点
const bloxrouteConfig: SwqosConfig = {
  type: 'Bloxroute',
  apiToken: "your_api_token",
  region: SwqosRegion.NewYork
};
```

**URL 优先级逻辑**:
- 如果提供了自定义 URL，将使用该 URL 而非区域端点
- 如果未提供自定义 URL，系统将使用指定区域的默认端点
- 这在保持向后兼容性的同时提供了最大的灵活性

使用多个 MEV 服务时，您需要使用 `Durable Nonce`。您需要使用 `fetchNonceInfo` 函数获取最新的 `nonce` 值，并在交易时将其作为 `durableNonce` 使用。

---

### 🔧 中间件系统说明

SDK 提供了强大的中间件系统，允许您在交易执行前修改、添加或移除指令。中间件按添加顺序执行：

```typescript
import { MiddlewareManager, ValidationMiddleware, TimerMiddleware } from 'sol-trade-sdk';

const manager = new MiddlewareManager()
  .addMiddleware(new FirstMiddleware())   // 最先执行
  .addMiddleware(new SecondMiddleware())  // 其次执行
  .addMiddleware(new ThirdMiddleware());  // 最后执行
```

### 🔍 地址查找表

地址查找表（ALT）允许您通过以紧凑的表格格式存储常用地址来优化交易大小并降低费用。

```typescript
import { fetchAddressLookupTableAccount, AddressLookupTableCache } from 'sol-trade-sdk';

// 从链上获取 ALT
const alt = await fetchAddressLookupTableAccount(rpc, altAddress);
console.log(`ALT 包含 ${alt.addresses.length} 个地址`);

// 使用缓存提高性能
const cache = new AddressLookupTableCache(rpc);
await cache.prefetch([altAddress1, altAddress2, altAddress3]);
const cached = cache.get(altAddress1);
```

### 🔍 Nonce 缓存

使用持久 Nonce 实现交易重放保护并优化交易处理。

```typescript
import { fetchNonceInfo, NonceCache } from 'sol-trade-sdk';

// 获取 nonce 信息
const nonceInfo = await fetchNonceInfo(rpc, nonceAccount);
```

## 💰 Cashback 支持（PumpFun / PumpSwap）

PumpFun 和 PumpSwap 为符合条件的代币支持 **cashback**：部分交易费用可以返还给用户。SDK **必须知道**代币是否启用了 cashback，以便买/卖指令包含正确的账户。

- **当参数来自 RPC 时**: 如果您使用 `PumpFunParams.fromMintByRpc` 或 `PumpSwapParams.fromPoolAddressByRpc`，SDK 会从链上读取 `isCashbackCoin`——无需额外步骤。
- **当参数来自已解码事件时**: 如果您从已解码的交易事件构建参数（例如外部解析服务输出），您**必须**将 cashback 标志传递给 SDK：
  - **PumpFun**: 从解析的事件构建参数时设置 `isCashbackCoin`。
  - **PumpSwap**: 手动构建参数时设置 `isCashbackCoin` 字段。

## 🛡️ MEV 保护服务

您可以通过官网申请密钥：[社区网站](https://fnzero.dev/swqos)

- **Jito**: 高性能区块空间
- **ZeroSlot**: 零延迟交易
- **Temporal**: 时间敏感交易
- **Bloxroute**: 区块链网络加速
- **FlashBlock**: 高速交易执行（API 密钥认证）
- **BlockRazor**: 高速交易执行（API 密钥认证）
- **Node1**: 高速交易执行（API 密钥认证）
- **Astralane**: 区块链网络加速

## 📁 项目结构

```
src/
├── common/           # 通用功能和工具
├── constants/        # 常量定义
├── instruction/      # 指令构建
│   └── utils/        # 指令工具
├── swqos/            # MEV 服务客户端
├── trading/          # 统一交易引擎
│   ├── common/       # 交易通用工具
│   ├── core/         # 核心交易引擎
│   ├── middleware/   # 中间件系统
│   └── factory.ts    # 交易工厂
├── utils/            # 工具函数
│   ├── calc/         # 金额计算工具
│   └── price/        # 价格计算工具
└── index.ts          # 主库文件
```

## 📄 许可证

MIT License

## 💬 联系方式

- 官方网站: https://fnzero.dev/
- 项目仓库: https://github.com/0xfnzero/sol-trade-sdk-nodejs
- Telegram 群组: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE

## ⚠️ 重要注意事项

1. 在主网使用前请充分测试
2. 正确配置私钥和 API Token
3. 注意滑点设置以避免交易失败
4. 监控余额和交易费用
5. 遵守相关法律法规
