# Sol Trade SDK for Node.js

<p align="center">
    <strong>高性能 Node.js SDK，用于低延迟 Solana DEX 交易</strong>
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
    <a href="README.md">English</a> |
    <a href="https://fnzero.dev/">官网</a> |
    <a href="https://t.me/fnzero_group">Telegram</a> |
    <a href="https://discord.gg/vuazbGkqQE">Discord</a>
</p>

---

## 📦 SDK 版本

本 SDK 提供多种语言版本：

| 语言 | 仓库 | 描述 |
|------|------|------|
| **Node.js** | [sol-trade-sdk-nodejs](https://github.com/0xfnzero/sol-trade-sdk-nodejs) | TypeScript/JavaScript，Node.js 支持 |
| **Python** | [sol-trade-sdk-python](https://github.com/0xfnzero/sol-trade-sdk-python) | 原生 async/await 支持 |
| **Go** | [sol-trade-sdk-golang](https://github.com/0xfnzero/sol-trade-sdk-golang) | 并发安全，goroutine 支持 |

---

一个全面的高性能 TypeScript SDK，用于 Solana DEX 交易，支持多种协议和 MEV 提供商。

## 特性

- **多 DEX 支持**: PumpFun、PumpSwap、Bonk、Raydium AMM V4、Raydium CPMM、Meteora DAMM V2
- **SWQoS 集成**: 多个 MEV 提供商用于交易提交
- **高性能**: LRU/TTL/分片缓存、连接池、并行执行
- **低延迟**: 针对亚秒级交易执行优化
- **安全优先**: 整数溢出保护、安全密钥存储、输入验证
- **零-RPC 热路径**: 所有 RPC 调用在交易执行前完成
- **类型安全**: 完整的 TypeScript 支持和全面的类型定义
- **模块化设计**: 按需使用

## 安装

```bash
npm install sol-trade-sdk
# 或
yarn add sol-trade-sdk
# 或
pnpm add sol-trade-sdk
```

## 快速开始

### 基本交易

```typescript
import {
  GasFeeStrategy,
  TradeExecutor,
  SwqosType,
  TradeType,
} from 'sol-trade-sdk';

// 创建 Gas 策略
const gasStrategy = new GasFeeStrategy();
gasStrategy.setGlobalFeeStrategy(200000, 200000, 100000, 100000, 0.001, 0.001);

// 创建交易执行器
const executor = new TradeExecutor({
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  swqosConfigs: [{ type: SwqosType.Jito }],
});

// 执行交易
const result = await executor.execute(TradeType.Buy, transactionBuffer);
console.log(`交易签名: ${result.signature}`);
```

### PumpFun 交易

```typescript
import { PumpFunInstructionBuilder } from 'sol-trade-sdk/instruction/pumpfun';
import { getBuyTokenAmountFromSolAmount } from 'sol-trade-sdk/calc/pumpfun';

// 计算输入 SOL 可获得的代币数量
const tokens = getBuyTokenAmountFromSolAmount(
  1_073_000_000_000_000, // virtualTokenReserves
  30_000_000_000,         // virtualSolReserves
  793_000_000_000_000,    // realTokenReserves
  true,                   // hasCreator
  1_000_000_000           // amount (1 SOL)
);

// 构建买入指令
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

### 热路径执行（零-RPC 交易）

```typescript
import { HotPathExecutor, HotPathState } from 'sol-trade-sdk/hotpath';

// 使用预取数据初始化热路径状态
const state = new HotPathState();
await state.prefetchBlockhash(rpcClient);
await state.cacheAccount(tokenAccountPubkey);

// 在交易期间无需任何 RPC 调用即可执行
const executor = new HotPathExecutor(state);
const result = await executor.executeTrade(transaction);
```

### 使用工厂模式交易

```typescript
import {
  TradeExecutorFactory,
  TradingClient,
  DexType,
} from 'sol-trade-sdk/trading';

// 使用基础执行器创建工厂
const factory = new TradeExecutorFactory(baseExecutor);

// 获取 DEX 特定执行器
const pumpfunExecutor = factory.getExecutor(DexType.PumpFun);

// 创建交易客户端
const client = new TradingClient(factory);

// 在 PumpFun 上执行买入
const result = await client.buy(DexType.PumpFun, params);
console.log(`结果: ${result.signature}`);
```

## 安全特性

```typescript
import {
  SecureKeyStorage,
  validateRpcUrl,
  validateAmount,
  validatePubkey,
} from 'sol-trade-sdk/security';

// 带 AES-256-GCM 加密的安全密钥存储
const storage = SecureKeyStorage.fromKeyPair(keypair, '可选密码');
storage.unlock((kp) => {
  const signature = kp.sign(message);
  return signature;
});
storage.clear(); // 安全内存清除

// 输入验证
validateRpcUrl('https://api.mainnet-beta.solana.com');
validateAmount(1_000_000_000, 'amount', { allowZero: false });
validatePubkey(pubkeyString, 'tokenMint');
```

## 地址查找表

```typescript
import {
  fetchAddressLookupTableAccount,
  AddressLookupTableCache,
} from 'sol-trade-sdk/address-lookup';

// 从链上获取 ALT
const alt = await fetchAddressLookupTableAccount(rpc, altAddress);
console.log(`ALT 包含 ${alt.addresses.length} 个地址`);

// 使用缓存提高性能
const cache = new AddressLookupTableCache(rpc);
await cache.prefetch([altAddress1, altAddress2, altAddress3]);
const cached = cache.get(altAddress1);
```

## 子路径导入

```typescript
// 导入特定模块
import { LRUCache } from 'sol-trade-sdk/cache';
import { calculatePumpFunBuy } from 'sol-trade-sdk/calc';
import { JitoClient } from 'sol-trade-sdk/swqos';
import { HotPathExecutor } from 'sol-trade-sdk/hotpath';
import { SecureKeyStorage } from 'sol-trade-sdk/security';
import { TradeExecutorFactory } from 'sol-trade-sdk/trading';
```

## 架构

| 模块 | 描述 |
|------|------|
| `address-lookup` | 带缓存的地址查找表支持 |
| `cache` | LRU、TTL 和分片缓存 |
| `calc` | 带 `math/bits` 溢出保护的所有 DEX AMM 计算 |
| `common` | 核心类型、Gas 策略、联合曲线 |
| `execution` | 分支优化、预取 |
| `hotpath` | 零-RPC 热路径执行 |
| `instruction` | 所有 DEX 的指令构建器 |
| `middleware` | 指令中间件系统 |
| `pool` | 连接池和工作池 |
| `rpc` | 高性能 RPC 客户端 |
| `security` | 安全密钥存储、验证器 |
| `seed` | 所有协议的 PDA 派生 |
| `swqos` | MEV 提供商客户端（19 个提供商） |
| `trading` | 带工厂的高性能交易执行器 |

## 支持的协议

### PumpFun
- 带创建者费用支持的联合曲线计算
- 买卖指令构建
- 联合曲线和关联账户的 PDA 派生

### PumpSwap
- 带 LP/协议/创建者费用的池计算
- 买卖指令构建
- Mayhem 模式支持

### Bonk
- 虚拟/真实储备计算
- 协议费用处理

### Raydium
- 恒定乘积的 AMM V4 计算
- CPMM 计算
- 权限 PDA 派生

### Meteora
- DAMM V2 交换计算
- 池 PDA 派生

## 中间件系统

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

// 将中间件应用于指令
const processed = manager.applyMiddlewaresProcessProtocolInstructions(
  instructions,
  'PumpFun',
  true // isBuy
);
```

## 环境要求

- Node.js >= 18.0.0
- TypeScript >= 5.3.0 (开发环境)

## 脚本

```bash
# 构建
npm run build

# 开发
npm run dev

# 测试
npm test

# 代码检查
npm run lint

# 类型检查
npm run typecheck
```

## 许可证

MIT License

## 联系方式

- 官方网站: https://fnzero.dev/
- 项目仓库: https://github.com/0xfnzero/sol-trade-sdk-nodejs
- Telegram 群组: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE
