# Sol Trade SDK for TypeScript

<p align="center">
    <strong>高性能 TypeScript SDK，用于低延迟 Solana DEX 交易</strong>
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

一个全面的高性能 TypeScript SDK，用于 Solana DEX 交易，支持多种协议和 MEV 提供商。

## 特性

- **多 DEX 支持**: PumpFun、PumpSwap、Bonk、Raydium AMM V4、Raydium CPMM、Meteora DAMM V2
- **SWQoS 集成**: Jito、Bloxroute、ZeroSlot、Temporal、FlashBlock、Helius 等
- **高性能**: LRU/TTL/分片缓存、连接池、并行执行
- **低延迟**: 针对亚秒级交易执行优化
- **安全优先**: 整数溢出保护、加密安全随机数
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

## 子路径导入

```typescript
// 导入特定模块
import { LRUCache } from 'sol-trade-sdk/cache';
import { calculatePumpFunBuy } from 'sol-trade-sdk/calc';
import { JitoClient } from 'sol-trade-sdk/swqos';
```

## 安全特性

```typescript
import { randomBytes } from 'crypto';

// 加密安全随机数用于费用接收方选择
const randomIndex = randomBytes(1)[0] % MAYHEM_FEE_RECIPIENTS.length;

// 计算中的整数溢出保护
import { calculateFee } from 'sol-trade-sdk/calc';
const fee = calculateFee(amount, feeBasisPoints); // 溢出时抛出异常
```

## 架构

| 模块 | 描述 |
|------|------|
| `cache` | LRU、TTL 和分片缓存 |
| `calc` | 所有 DEX 的 AMM 计算，带溢出保护 |
| `hotpath` | 零-RPC 热路径执行 |
| `instruction` | 带安全随机数的指令构建器 |
| `pool` | 连接池和工作池 |
| `rpc` | 高性能 RPC 客户端 |
| `seed` | 所有协议的 PDA 派生 |
| `swqos` | MEV 提供商客户端 |
| `trading` | 高性能交易执行器 |

## 支持的协议

### PumpFun
- 联合曲线计算
- 买卖指令构建
- PDA 派生

### PumpSwap
- 池计算
- 费用分解 (LP、协议、曲线)
- 指令构建

### Raydium
- AMM V4 计算
- CPMM 计算
- 权限 PDA 派生

### Meteora
- DAMM V2 支持
- 池 PDA 派生

## SWQoS 提供商

| 提供商 | 最低小费 | 特性 |
|----------|---------|----------|
| Jito | 0.001 SOL | 捆绑支持、gRPC |
| Bloxroute | 0.0003 SOL | 高可靠性 |
| ZeroSlot | 0.0001 SOL | 低延迟 |
| Temporal | 0.0001 SOL | 快速确认 |
| FlashBlock | 0.0001 SOL | 有竞争力的价格 |
| Helius | 0.000005 SOL | 仅 SWQoS 模式 |

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
- 项目仓库: https://github.com/sol-trade-sdk/sol-trade-sdk-ts
- Telegram 群组: https://t.me/fnzero_group
- Discord: https://discord.gg/vuazbGkqQE
