/** Local execution of the SDK's TTWO transactions against pinned deployed programs. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  LiteSVM,
  Clock,
  FailedTransactionMetadata,
  SimulatedTransactionInfo,
} from "litesvm";
import { address, getTransactionDecoder, lamports } from "@solana/kit";
import {
  PublicKey,
  Keypair,
  AddressLookupTableAccount,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  AccountCacheSnapshot,
  PoolTradeHint,
} from "../src/trading/subscription_cache";
import {
  preparePumpSwapTrade,
  searchPumpSwapTrade,
  type PreparedPumpSwapTrade,
} from "../src/trading/pumpswap_preparation";
import {
  decodePoolPayload,
  PUMPSWAP_PROGRAM,
  buildBuyInstructions,
  buildSellInstructions,
  getCoinCreatorVaultAuthority,
  getCoinCreatorVaultAta,
  type PumpSwapParams,
} from "../src/instruction/pumpswap";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "../src/common/spl-token";
import {
  MiddlewareManager,
  type InstructionMiddleware,
} from "../src/middleware/traits";

interface FrozenAccount {
  owner: string;
  lamports: string;
  data_base64: string;
  executable: boolean;
  rent_epoch?: string;
}
interface DirectSnapshot {
  pool: string;
  slot: number;
  epoch: number;
  maximum_slot_age: number;
  accounts: {
    address: string;
    owner: string;
    data_base64: string;
    slot: number;
  }[];
}
interface RouteSnapshot extends DirectSnapshot {
  unix_timestamp: number;
  route_search: {
    pool: string;
    token_mint: string;
    asset_mint: string;
    conversion_pools: {
      pool: string;
      input_mint: string;
      output_mint: string;
    }[];
  };
}
interface Bundle {
  route_accounts: Record<string, FrozenAccount>;
  route_snapshot: RouteSnapshot;
  schema: number;
  clock: [number, number, number, number, number];
  programs: Record<string, string>;
  accounts: Record<string, FrozenAccount>;
  direct_snapshot: DirectSnapshot;
}
interface Config {
  include_routes?: boolean;
  run_bank?: boolean;
  snapshot: string;
  sha256: string;
  repetitions: number;
  programs: string;
  programs_manifest: string;
  benchmark_iterations?: number;
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "pumpswap_bank");
const wallet = Keypair.fromSeed(new Uint8Array(32).fill(42));
const key = (seed: number) => new PublicKey(new Uint8Array(32).fill(seed));
const canonical = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v,
  );
const native = (wire: Uint8Array) => getTransactionDecoder().decode(wire);
function assertSuccess(
  result: ReturnType<LiteSVM["sendTransaction"]> | null,
  label: string,
): void {
  assert(result !== null, `${label}: no transaction result`);
  if (result instanceof FailedTransactionMetadata)
    throw Error(
      `${label}: ${canonical(result.err())}\n${result.meta().logs().join("\n")}`,
    );
}
function prepare(bundle: Bundle, buy: boolean) {
  const f = bundle.direct_snapshot;
  const snapshot = new AccountCacheSnapshot(
    new Map(
      f.accounts.map((a) => [
        a.address,
        {
          owner: new PublicKey(a.owner),
          data: Buffer.from(a.data_base64, "base64"),
          slot: BigInt(a.slot),
          writeVersion: 0n,
        },
      ]),
    ),
  );
  const context = {
    slot: BigInt(f.slot),
    epoch: BigInt(f.epoch),
    maximumSlotAge: BigInt(f.maximum_slot_age),
  };
  const poolAddress = new PublicKey(f.pool),
    pool = decodePoolPayload(
      Buffer.from(
        snapshot.get(poolAddress, context, PUMPSWAP_PROGRAM).data,
      ).subarray(8),
    );
  assert(pool);
  const hint = new PoolTradeHint(
    poolAddress,
    buy ? pool.quoteMint : pool.baseMint,
    buy ? pool.baseMint : pool.quoteMint,
  );
  const state = snapshot.pumpSwap(hint, context),
    amount = buy ? 1000000n : 1000000000n;
  const request = {
    snapshot,
    context,
    unixTimestamp: BigInt(bundle.clock[4]),
    payer: wallet.publicKey,
    amount,
    tradeType: buy ? ("Buy" as const) : ("Sell" as const),
    slippageBps: 100,
  };
  const trade = preparePumpSwapTrade(request, [hint]);
  const params: PumpSwapParams = {
    pool: poolAddress,
    baseMint: pool.baseMint,
    quoteMint: pool.quoteMint,
    poolBaseTokenAccount: pool.poolBaseTokenAccount,
    poolQuoteTokenAccount: pool.poolQuoteTokenAccount,
    poolBaseTokenReserves: state.baseReserve,
    poolQuoteTokenReserves: state.quoteReserve,
    virtualQuoteReserves: pool.virtualQuoteReserves,
    coinCreator: pool.coinCreator,
    coinCreatorVaultAuthority: getCoinCreatorVaultAuthority(pool.coinCreator),
    coinCreatorVaultAta: getCoinCreatorVaultAta(
      pool.coinCreator,
      pool.quoteMint,
      state.quoteTokenProgram,
    ),
    baseTokenProgram: state.baseTokenProgram,
    quoteTokenProgram: state.quoteTokenProgram,
    isMayhemMode: pool.isMayhemMode,
    isCashbackCoin: pool.isCashbackCoin,
    feeBasisPoints: state.feeBasisPoints,
    protocolFeeRecipientOverride: state.protocolFeeRecipients.find(
      (p) => !p.equals(PublicKey.default),
    ),
    protocolExtraFeeRecipientOverride: state.buybackFeeRecipients.find(
      (p) => !p.equals(PublicKey.default),
    ),
  };
  const args = {
    payer: wallet.publicKey,
    protocolParams: params,
    inputAmount: amount,
    slippageBasisPoints: 100n,
    inputMint: hint.inputMint,
    outputMint: hint.outputMint,
    createInputMintAta: false,
    createOutputMintAta: false,
  };
  const direct = (buy ? buildBuyInstructions : buildSellInstructions)(args);
  const cached = trade.preview.swapInstructions[0]!;
  assert.equal(direct.length, 1);
  assert.deepEqual(direct[0]!.data, cached.data);
  assert.deepEqual(direct[0]!.keys, cached.keys);
  return { snapshot, context, hint, state, trade, request, direct };
}
function prepareConversion(bundle: Bundle, buy: boolean) {
  const f = bundle.route_snapshot,
    s = f.route_search;
  const snapshot = new AccountCacheSnapshot(
    new Map(
      f.accounts.map((a) => [
        a.address,
        {
          owner: new PublicKey(a.owner),
          data: Buffer.from(a.data_base64, "base64"),
          slot: BigInt(a.slot),
          writeVersion: 0n,
        },
      ]),
    ),
  );
  const context = {
    slot: BigInt(f.slot),
    epoch: BigInt(f.epoch),
    maximumSlotAge: BigInt(f.maximum_slot_age),
  };
  const search = {
    pool: new PublicKey(s.pool),
    tokenMint: new PublicKey(s.token_mint),
    assetMint: new PublicKey(s.asset_mint),
    conversionPools: s.conversion_pools.map(
      (h) =>
        new PoolTradeHint(
          new PublicKey(h.pool),
          new PublicKey(h.input_mint),
          new PublicKey(h.output_mint),
        ),
    ),
  };
  const request = {
    snapshot,
    context,
    unixTimestamp: BigInt(f.unix_timestamp),
    payer: wallet.publicKey,
    amount: buy ? 1000000n : 1000000000n,
    tradeType: buy ? ("Buy" as const) : ("Sell" as const),
    slippageBps: 100,
  };
  const trade = searchPumpSwapTrade(request, search).trade;
  const endpoints = [
    trade.preview.legs[0]!.hint.inputMint,
    trade.preview.legs.at(-1)!.hint.outputMint,
  ];
  return { snapshot, context, request, trade, endpoints };
}
function initialize(bundle: Bundle, buy: boolean, conversion: boolean) {
  const p = conversion ? prepareConversion(bundle, buy) : prepare(bundle, buy),
    bank = new LiteSVM()
      .withLogBytesLimit(100000n)
      .withSigverify(true)
      .withBlockhashCheck(true);
  const clock = conversion
    ? [
        bundle.route_snapshot.slot,
        0,
        bundle.route_snapshot.epoch,
        bundle.route_snapshot.epoch,
        bundle.route_snapshot.unix_timestamp,
      ]
    : bundle.clock;
  bank.setClock(
    new Clock(
      ...(clock.map(BigInt) as [bigint, bigint, bigint, bigint, bigint]),
    ),
  );
  for (const [program, code] of Object.entries(bundle.programs))
    bank.addProgram(address(program), Buffer.from(code, "base64"));
  const tracked = new Set<string>();
  for (const [pubkey, a] of Object.entries(
    conversion ? bundle.route_accounts : bundle.accounts,
  )) {
    const data = Buffer.from(a.data_base64, "base64");
    tracked.add(pubkey);
    bank.setAccount({
      address: address(pubkey),
      lamports: lamports(BigInt(a.lamports)),
      data,
      programAddress: address(a.owner),
      executable: a.executable,
      space: BigInt(data.length),
    });
  }
  assertSuccess(
    bank.airdrop(address(wallet.publicKey.toBase58()), lamports(500000000000n)),
    "wallet funding",
  );
  tracked.add(wallet.publicKey.toBase58());
  const route = p.trade.preview,
    endpoints = [
      route.legs[0]!.hint.inputMint,
      route.legs.at(-1)!.hint.outputMint,
    ].map((mint) => ({ mint, program: p.snapshot.get(mint, p.context).owner }));
  const atas = endpoints.map(({ mint, program }) =>
    getAssociatedTokenAddressSync(mint, wallet.publicKey, false, program),
  );
  // The pinned Token-2022 program initializes required extensions; only wallet balances are synthetic.
  const initializeIndexes = conversion ? (buy ? [] : [0]) : [0, 1];
  const ixs = initializeIndexes.map((i) =>
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      atas[i]!,
      wallet.publicKey,
      endpoints[i]!.mint,
      endpoints[i]!.program,
    ),
  );
  if (ixs.length) {
    const setup = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: bank.latestBlockhash(),
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
          ...ixs,
        ],
      }).compileToV0Message(),
    );
    setup.sign([wallet]);
    assertSuccess(
      bank.sendTransaction(native(setup.serialize())),
      "create synthetic wallet ATAs",
    );
  }
  for (const i of initializeIndexes) {
    const ata = atas[i]!,
      account = bank.getAccount(address(ata.toBase58()));
    assert(account.exists);
    const data = Buffer.from(account.data);
    data.writeBigUInt64LE(conversion ? p.request.amount : 1000000000000n, 64);
    bank.setAccount({ ...account, data });
    tracked.add(ata.toBase58());
  }
  return {
    ...p,
    bank,
    tracked,
    inputAta: atas[0]!,
    outputAta: atas[1]!,
    nativeInput: conversion && buy,
    nativeOutput: conversion && !buy,
  };
}
function addTable(
  bank: LiteSVM,
  trade: PreparedPumpSwapTrade,
  tracked: Set<string>,
): AddressLookupTableAccount {
  const preview = trade.preview,
    addresses = [
      ...new Map(
        [...preview.setupInstructions, ...preview.swapInstructions]
          .flatMap((ix) => [
            ix.programId,
            ...ix.keys.filter((k) => !k.isSigner).map((k) => k.pubkey),
          ])
          .map((k) => [k.toBase58(), k]),
      ).values(),
    ];
  const tableKey = key(118),
    header = Buffer.alloc(56);
  header.writeUInt32LE(1);
  header.writeBigUInt64LE((1n << 64n) - 1n, 4);
  const data = Buffer.concat([header, ...addresses.map((k) => k.toBuffer())]);
  bank.setAccount({
    address: address(tableKey.toBase58()),
    lamports: lamports(
      bank.minimumBalanceForRentExemption(BigInt(data.length)),
    ),
    data,
    programAddress: address("AddressLookupTab1e1111111111111111111111111"),
    executable: false,
    space: BigInt(data.length),
  });
  tracked.add(tableKey.toBase58());
  return new AddressLookupTableAccount({
    key: tableKey,
    state: {
      deactivationSlot: (1n << 64n) - 1n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      addresses,
    },
  });
}
function rejectMinimum(): MiddlewareManager {
  const middleware: InstructionMiddleware = {
    name: () => "excessive-minimum",
    clone: () => middleware,
    processProtocolInstructions(ixs) {
      for (const ix of ixs)
        if (ix.programId.equals(PUMPSWAP_PROGRAM))
          ix.data.writeBigUInt64LE((1n << 64n) - 1n, 16);
      return ixs;
    },
    processFullInstructions: (ixs) => ixs,
  };
  return new MiddlewareManager().addMiddleware(middleware);
}
export interface BankTrace {
  conversion: boolean;
  buy: boolean;
  alt: boolean;
  reject: boolean;
  wire: string;
  logs: readonly string[];
  output: string;
  units: string;
  state: string;
}
function execute(
  bundle: Bundle,
  buy: boolean,
  alt: boolean,
  reject: boolean,
  conversion = false,
): BankTrace {
  const p = initialize(bundle, buy, conversion),
    tables = alt ? [addTable(p.bank, p.trade, p.tracked)] : [];
  const built = p.trade.buildSigned({
    context: p.context,
    recentBlockhash: p.bank.latestBlockhash(),
    signers: [wallet],
    lookupTables: tables,
    computeUnitLimit: 1400000,
    nativeInput: p.nativeInput,
    nativeOutput: p.nativeOutput,
    temporaryWsolSeed: buy ? "bank-ttwo-buy" : "bank-ttwo-sell",
    rentLamports: p.bank.minimumBalanceForRentExemption(165n),
    middlewareManager: reject ? rejectMinimum() : undefined,
  });
  const tx = VersionedTransaction.deserialize(built.wire);
  for (const ix of built.instructions)
    for (const k of ix.keys) p.tracked.add(k.pubkey.toBase58());
  const state = () =>
    new Map(
      [...p.tracked].sort().map((k) => [k, p.bank.getAccount(address(k))]),
    );
  const before = state(),
    simulation = p.bank.simulateTransaction(native(built.wire));
  assert.deepEqual(state(), before, "simulation must be read-only");
  if (reject) {
    assert(
      simulation instanceof FailedTransactionMetadata,
      canonical(simulation),
    );
    assert(
      simulation
        .meta()
        .logs()
        .some((line) => /slippage/i.test(line)),
      simulation.meta().logs().join("\n"),
    );
  } else
    assert(
      simulation instanceof SimulatedTransactionInfo,
      simulation instanceof FailedTransactionMetadata
        ? simulation.meta().logs().join("\n")
        : "unexpected simulation result",
    );
  const sent = p.bank.sendTransaction(native(built.wire));
  assert.equal(sent instanceof FailedTransactionMetadata, reject);
  const after = state();
  let output = 0n;
  if (reject) {
    for (const [pubkey, account] of before)
      if (pubkey !== wallet.publicKey.toBase58())
        assert.deepEqual(
          after.get(pubkey),
          account,
          "failed trade leaked account writes",
        );
    const pre = before.get(wallet.publicKey.toBase58())!,
      post = after.get(wallet.publicKey.toBase58())!;
    assert(pre.exists && post.exists);
    assert.equal(pre.lamports - post.lamports, 5000n);
  } else {
    const balance = (map: typeof before, ata: PublicKey) => {
      const a = map.get(ata.toBase58());
      return a?.exists ? Buffer.from(a.data).readBigUInt64LE(64) : 0n;
    };
    const walletKey = wallet.publicKey.toBase58(),
      oldWallet = before.get(walletKey)!,
      newWallet = after.get(walletKey)!;
    assert(oldWallet.exists && newWallet.exists);
    const rentDelta = [...before].reduce((sum, [key, old]) => {
      const next = after.get(key)!;
      if (key === walletKey) return sum;
      return (
        sum +
        (!old.exists && next.exists
          ? next.lamports
          : old.exists && !next.exists
            ? -old.lamports
            : 0n)
      );
    }, 0n);
    if (p.nativeInput)
      assert.equal(
        oldWallet.lamports - newWallet.lamports - 5000n - rentDelta,
        p.request.amount,
      );
    else
      assert.equal(
        balance(before, p.inputAta) - balance(after, p.inputAta),
        p.request.amount,
      );
    output = p.nativeOutput
      ? newWallet.lamports - oldWallet.lamports + 5000n + rentDelta
      : balance(after, p.outputAta) - balance(before, p.outputAta);
    assert(output >= p.trade.minimumNetAmountOut);
    assert.equal(output, p.trade.preview.legs.at(-1)!.estimatedNetAmountOut);
    for (const account of (
      simulation as SimulatedTransactionInfo
    ).postAccounts())
      if (p.tracked.has(account.address))
        assert.deepEqual(
          after.get(account.address),
          account.lamports === 0n
            ? { address: account.address, exists: false }
            : { ...account, exists: true },
          "simulation/send post-state mismatch",
        );
  }
  const corrupt = Uint8Array.from(built.wire);
  corrupt[1] = corrupt[1]! ^ 1;
  const failed = p.bank.simulateTransaction(native(corrupt));
  assert(failed instanceof FailedTransactionMetadata);
  assert.equal(failed.err(), 11);
  assert.equal(failed.meta().logs().length, 0);
  assert.deepEqual(state(), after, "bad signature changed state");
  if (alt) {
    assert.equal(tx.message.addressTableLookups.length, 1);
    for (const side of ["writableIndexes", "readonlyIndexes"] as const) {
      const bad = VersionedTransaction.deserialize(built.wire);
      assert(bad.message.addressTableLookups[0]![side].length);
      bad.message.addressTableLookups[0]![side][0] = 255;
      bad.sign([wallet]);
      const result = p.bank.simulateTransaction(native(bad.serialize()));
      assert(result instanceof FailedTransactionMetadata);
      assert.equal(result.err(), 25);
      assert.deepEqual(state(), after);
    }
  }
  return {
    conversion,
    buy,
    alt,
    reject,
    wire: Buffer.from(built.wire).toString("base64"),
    logs: simulation.meta().logs(),
    output: output.toString(),
    units: simulation.meta().computeUnitsConsumed().toString(),
    state: canonical([...after]),
  };
}
/** Entire replay is local; program/account fixture loading happens before timing. */
export function runPumpSwapBank(configPath = resolve(ROOT, "config.json")) {
  const config: Config = JSON.parse(readFileSync(configPath, "utf8")),
    compressed = readFileSync(resolve(dirname(configPath), config.snapshot));
  assert.equal(
    createHash("sha256").update(compressed).digest("hex"),
    config.sha256,
  );
  const bundle: Bundle = JSON.parse(gunzipSync(compressed).toString());
  assert.equal(bundle.schema, 1);
  const manifest: { sha256: string; programs: Record<string, string> } =
    JSON.parse(
      readFileSync(
        resolve(dirname(configPath), config.programs_manifest),
        "utf8",
      ),
    );
  const programBytes = readFileSync(
    resolve(dirname(configPath), config.programs),
  );
  assert.equal(
    createHash("sha256").update(programBytes).digest("hex"),
    manifest.sha256,
  );
  const code: { schema: number; programs: Record<string, string> } = JSON.parse(
    gunzipSync(programBytes).toString(),
  );
  assert.equal(code.schema, 1);
  for (const [program, elf] of Object.entries(code.programs))
    assert.equal(
      createHash("sha256").update(Buffer.from(elf, "base64")).digest("hex"),
      manifest.programs[program],
    );
  bundle.programs = code.programs;
  assert(
    Number.isInteger(config.repetitions) &&
      config.repetitions >= 2 &&
      config.repetitions <= 10,
  );
  let baseline: BankTrace[] | undefined;
  if (config.run_bank !== false)
    for (let pass = 0; pass < config.repetitions; pass++) {
      const traces = [true, false].flatMap((buy) =>
        [false, true].flatMap((alt) =>
          [false, true].map((reject) => execute(bundle, buy, alt, reject)),
        ),
      );
      if (config.include_routes !== false)
        traces.push(
          ...[true, false].flatMap((buy) =>
            [false, true].map((reject) =>
              execute(bundle, buy, true, reject, true),
            ),
          ),
        );
      if (baseline)
        assert.deepEqual(
          traces,
          baseline,
          "fresh-bank repeat must be deterministic",
        );
      baseline = traces;
    }
  const count = config.benchmark_iterations ?? 0;
  assert(Number.isInteger(count) && count >= 0 && count <= 10000);
  let benchmark:
    | undefined
    | {
        iterations: number;
        prepareMicroseconds: number;
        buildMicroseconds: number;
      };
  if (count) {
    const p = prepare(bundle, true),
      options = {
        context: p.context,
        recentBlockhash: PublicKey.default.toBase58(),
        signers: [wallet],
        version: 1 as const,
      };
    const prepareStart = performance.now();
    for (let i = 0; i < count; i++) preparePumpSwapTrade(p.request, [p.hint]);
    const prepareTime = performance.now() - prepareStart;
    const buildStart = performance.now();
    for (let i = 0; i < count; i++) p.trade.buildSigned(options);
    benchmark = {
      iterations: count,
      prepareMicroseconds: (prepareTime * 1000) / count,
      buildMicroseconds: ((performance.now() - buildStart) * 1000) / count,
    };
  }
  return { traces: baseline ?? [], benchmark };
}
if (process.argv[1]?.endsWith("pumpswap_offline_bank.ts")) {
  const result = runPumpSwapBank(process.argv[2]);
  if (result.traces.length)
    console.log(
      `${result.traces.length} local TTWO signed bank scenarios passed all configured fresh-bank repetitions`,
    );
  if (result.benchmark)
    console.log(
      "Local prepare/build overhead only (bank/network excluded):",
      result.benchmark,
    );
}
