import { it, expect, vi } from "vitest";
import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  AddressLookupTableAccount,
  TransactionMessage,
  SystemProgram,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  MiddlewareManager,
  type InstructionMiddleware,
} from "../src/middleware/traits";
import { replayPumpSwapFixture } from "../examples/pumpswap_cached_prepare";
import {
  preparePumpSwapTrade,
  searchPumpSwapTrade,
} from "../src/trading/pumpswap_preparation";
import {
  PoolTradeHint,
  AccountCacheSnapshot,
} from "../src/trading/subscription_cache";
import {
  buildBuyInstructions,
  buildSellInstructions,
  getCoinCreatorVaultAuthority,
  getCoinCreatorVaultAta,
  getUserVolumeAccumulatorQuoteAta,
  getUserVolumeAccumulatorPDA,
  PUMPSWAP_BUY_DISCRIMINATOR,
  PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR,
  PUMPSWAP_SELL_DISCRIMINATOR,
} from "../src/instruction/pumpswap";
import {
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  WSOL_TOKEN_ACCOUNT,
} from "../src/constants";
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
it("replays captured TTWO SOL conversion independently with real signatures and no RPC", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw Error("RPC forbidden");
  });
  try {
    const f = replayPumpSwapFixture();
    for (const r of f.results) {
      const p = r.result.trade.preview;
      expect(p.legs).toHaveLength(3);
      for (let i = 1; i < p.legs.length; i++)
        expect(p.legs[i]!.amountIn).toBe(p.legs[i - 1]!.minimumNetAmountOut);
      const message = r.built.wire.subarray(0, -64),
        sig = r.built.wire.subarray(-64);
      expect(message[0]).toBe(129);
      expect(
        nacl.sign.detached.verify(message, sig, f.payer.publicKey.toBytes()),
      ).toBe(true);
      expect(r.result.routesEvaluated).toBe(1);
      expect(p.minimumNetAmountOut).toBe(
        r.tradeType === "Buy" ? 47932572n : 19264527n,
      );
      const again = searchPumpSwapTrade(
        {
          snapshot: f.snapshot,
          context: f.context,
          unixTimestamp: 1792302906n,
          payer: f.payer.publicKey,
          amount: p.legs[0]!.amountIn,
          tradeType: r.tradeType,
          slippageBps: 100,
        },
        f.search,
      );
      expect(again.trade.preview.minimumNetAmountOut).toBe(
        p.minimumNetAmountOut,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
it("prepared quote is immutable and rejects age, epoch and missing signer", () => {
  const f = replayPumpSwapFixture(),
    t = f.results[0]!.result.trade,
    initial = t.preview.minimumNetAmountOut;
  t.preview.swapInstructions[0]!.data.fill(0);
  (t.preview.legs as unknown[]).pop();
  expect(t.preview.legs.length).toBe(3);
  expect(t.preview.minimumNetAmountOut).toBe(initial);
  expect(() =>
    t.validateFreshness({ ...f.context, slot: f.context.slot + 1n }),
  ).toThrow(/stale/);
  expect(() =>
    t.validateFreshness({ ...f.context, epoch: f.context.epoch + 1n }),
  ).toThrow(/epoch/);
  expect(() =>
    t.buildSigned({
      context: f.context,
      version: 1,
      recentBlockhash: key(1).toBase58(),
      signers: [],
    }),
  ).toThrow(/signer/i);
});
it("search bounds include dead branches and reject conflicts before partial results", () => {
  const f = replayPumpSwapFixture(),
    request = {
      snapshot: f.snapshot,
      context: f.context,
      unixTimestamp: 1792302906n,
      payer: f.payer.publicKey,
      amount: 10000000n,
      tradeType: "Buy" as const,
    };
  expect(() =>
    searchPumpSwapTrade(request, { ...f.search, maximumSearchNodes: 1 }),
  ).toThrow(/budget/);
  expect(() =>
    searchPumpSwapTrade(request, {
      ...f.search,
      conversionPools: [
        ...f.search.conversionPools,
        new PoolTradeHint(f.search.conversionPools[0]!.pool, key(3), key(4)),
      ],
    }),
  ).toThrow(/Conflicting/);
  const s = searchPumpSwapTrade(request, {
    ...f.search,
    conversionPools: [
      ...f.search.conversionPools,
      ...f.search.conversionPools.map(
        (h: PoolTradeHint) =>
          new PoolTradeHint(h.pool, h.outputMint, h.inputMint),
      ),
    ],
  });
  expect(s.routesEvaluated).toBe(1);
  expect(() =>
    searchPumpSwapTrade(request, {
      ...f.search,
      conversionPools: Array(33).fill(f.search.conversionPools[0]),
    }),
  ).toThrow(/bounds/);
});
it("direct custom quote selects opcode by endpoint mints rather than buy/sell label", () => {
  const creator = key(7),
    base = key(2),
    quote = key(3),
    p = {
      pool: key(1),
      baseMint: base,
      quoteMint: quote,
      poolBaseTokenAccount: key(4),
      poolQuoteTokenAccount: key(5),
      poolBaseTokenReserves: 1000000n,
      poolQuoteTokenReserves: 500000n,
      virtualQuoteReserves: 0n,
      coinCreator: creator,
      coinCreatorVaultAuthority: getCoinCreatorVaultAuthority(creator),
      coinCreatorVaultAta: getCoinCreatorVaultAta(
        creator,
        quote,
        TOKEN_PROGRAM_2022,
      ),
      baseTokenProgram: TOKEN_PROGRAM,
      quoteTokenProgram: TOKEN_PROGRAM_2022,
      isMayhemMode: false,
      isCashbackCoin: false,
    };
  for (const build of [buildBuyInstructions, buildSellInstructions])
    for (const buy of [true, false]) {
      const ix = build({
        payer: key(9),
        protocolParams: p,
        inputAmount: 10000n,
        slippageBasisPoints: 100n,
        inputMint: buy ? quote : base,
        outputMint: buy ? base : quote,
        createOutputMintAta: false,
      }).at(-1)!;
      expect(ix.data.subarray(0, 8)).toEqual(
        buy
          ? PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR
          : PUMPSWAP_SELL_DISCRIMINATOR,
      );
    }
  for (const build of [buildBuyInstructions, buildSellInstructions])
    for (const quoteIn of [true, false]) {
      const ix = build({
        payer: key(9),
        protocolParams: {
          ...p,
          isCashbackCoin: true,
          cashbackFeeBasisPoints: 5n,
        },
        inputAmount: 10000n,
        slippageBasisPoints: 100n,
        inputMint: quoteIn ? quote : base,
        outputMint: quoteIn ? base : quote,
        createOutputMintAta: false,
      }).at(-1)!;
      const quoteAta = getUserVolumeAccumulatorQuoteAta(
        key(9),
        quote,
        TOKEN_PROGRAM_2022,
      );
      expect(ix.keys.filter((k) => k.pubkey.equals(quoteAta))).toHaveLength(1);
      expect(
        ix.keys.filter((k) =>
          k.pubkey.equals(getUserVolumeAccumulatorPDA(key(9))),
        ),
      ).toHaveLength(1);
    }
  const args = {
    payer: key(9),
    protocolParams: p,
    inputAmount: 10000n,
    slippageBasisPoints: 100n,
    inputMint: quote,
    outputMint: base,
  };
  expect(()=>buildBuyInstructions({...args,protocolParams:{...p,coinCreator:undefined}})).toThrow(/complete pool snapshot/);
  expect(()=>buildSellInstructions({...args,protocolParams:{...p,coinCreator:undefined}})).toThrow(/complete pool snapshot/);
  expect(() =>
    buildBuyInstructions({ ...args, inputMint: WSOL_TOKEN_ACCOUNT }),
  ).toThrow(/endpoint/);
  expect(() =>
    buildBuyInstructions({ ...args, inputTokenProgram: TOKEN_PROGRAM }),
  ).toThrow(/program/);
  expect(() =>
    buildBuyInstructions({
      ...args,
      protocolParams: { ...p, coinCreatorVaultAuthority: key(19) },
    }),
  ).toThrow(/authority/);
  expect(() =>
    buildBuyInstructions({
      ...args,
      protocolParams: {
        ...p,
        coinCreatorVaultAta: getCoinCreatorVaultAta(
          creator,
          WSOL_TOKEN_ACCOUNT,
          TOKEN_PROGRAM,
        ),
      },
    }),
  ).toThrow(/ATA/);
});
it("builds V0 with caller ALTs, nonce, tip and middleware, checks packet size", () => {
  const f = replayPumpSwapFixture(),
    t = f.results[0]!.result.trade;
  const options = {
    context: f.context,
    recentBlockhash: key(1).toBase58(),
    signers: [f.payer],
    version: 0 as const,
  };
  expect(() => t.buildSigned(options)).toThrow();
  const keys = [
    ...new Map(
      [...t.preview.setupInstructions, ...t.preview.swapInstructions]
        .flatMap((ix) => [
          ix.programId,
          ...ix.keys.filter((k) => !k.isSigner).map((k) => k.pubkey),
        ])
        .map((k) => [k.toBase58(), k]),
    ).values(),
  ];
  const lookup = new AddressLookupTableAccount({
    key: key(21),
    state: {
      deactivationSlot: (1n << 64n) - 1n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: keys,
    },
  });
  const nonce = Keypair.fromSeed(new Uint8Array(32).fill(17));
  const calls: string[] = [];
  const middleware: InstructionMiddleware = {
    name: () => "offline-test",
    clone: () => middleware,
    processProtocolInstructions(ixs, name, buy) {
      calls.push(`protocol:${name}:${buy}`);
      return ixs;
    },
    processFullInstructions(ixs, name, buy) {
      calls.push(`full:${name}:${buy}`);
      return ixs;
    },
  };
  const middlewareManager = new MiddlewareManager().addMiddleware(middleware);
  const built = t.buildSigned({
    ...options,
    middlewareManager,
    signers: [f.payer, nonce],
    lookupTables: [lookup],
    durableNonce: {
      account: key(22),
      authority: nonce.publicKey,
      hash: key(23).toBase58(),
    },
    tipAccount: key(24),
    tipLamports: 1000n,
  });
  const tx = VersionedTransaction.deserialize(built.wire);
  expect(tx.message.recentBlockhash).toBe(key(23).toBase58());
  expect(tx.message.addressTableLookups.length).toBe(1);
  expect(tx.signatures.length).toBe(2);
  for (let i = 0; i < 2; i++)
    expect(
      nacl.sign.detached.verify(
        tx.message.serialize(),
        tx.signatures[i]!,
        tx.message.staticAccountKeys[i]!.toBytes(),
      ),
    ).toBe(true);
  const decompiled = TransactionMessage.decompile(tx.message, {
    addressLookupTableAccounts: [lookup],
  });
  expect(decompiled.instructions[0]!.data.readUInt32LE()).toBe(4);
  expect(
    decompiled.instructions[1]!.programId.equals(SystemProgram.programId),
  ).toBe(true);
  expect(built.requiredNativeLamports).toBe(1000n);
  expect(calls).toEqual(["protocol:PumpSwap:true", "full:PumpSwap:true"]);
  const breaking = new MiddlewareManager().addMiddleware({
    ...middleware,
    processFullInstructions: (ixs) => ixs.slice(1),
  });
  expect(() =>
    t.buildSigned({
      ...options,
      lookupTables: [lookup],
      signers: [f.payer, nonce],
      durableNonce: {
        account: key(22),
        authority: nonce.publicKey,
        hash: key(23).toBase58(),
      },
      middlewareManager: breaking,
    }),
  ).toThrow(/nonce advance/);
  expect(() =>
    t.buildSigned({
      ...options,
      lookupTables: [lookup],
      signers: [{ publicKey: f.payer.publicKey, secretKey: nonce.secretKey }],
    }),
  ).toThrow(/key mismatch/);
});
it("ranks protected output before hop count and uses deterministic pool bytes on ties", () => {
  const f = replayPumpSwapFixture(),
    request = {
      snapshot: f.snapshot,
      context: f.context,
      unixTimestamp: 1792302906n,
      payer: f.payer.publicKey,
      amount: 10000000n,
      tradeType: "Buy" as const,
    },
    anchor = f.search.pool;
  const quote = f.snapshot.pumpSwap(
    new PoolTradeHint(
      anchor,
      f.search.tokenMint,
      new PublicKey("TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo"),
    ),
    f.context,
  ).pool.quoteMint;
  const poolA = key(90),
    poolB = key(91),
    asset = WSOL_TOKEN_ACCOUNT,
    realGet = f.snapshot.get.bind(f.snapshot),
    realPrepare = f.snapshot.preparePumpSwap.bind(f.snapshot);
  vi.spyOn(f.snapshot, "get").mockImplementation((address, ctx, owner) =>
    address.equals(poolA) || address.equals(poolB)
      ? {
          owner: new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"),
          data: new Uint8Array(),
          slot: ctx.slot,
          writeVersion: 0n,
        }
      : realGet(address, ctx, owner),
  );
  let bWins = true;
  vi.spyOn(f.snapshot, "preparePumpSwap").mockImplementation(
    (hint, ctx, payer, amount, slippage) => {
      if (!hint.pool.equals(poolA) && !hint.pool.equals(poolB))
        return realPrepare(hint, ctx, payer, amount, slippage);
      const instruction = realPrepare(
        new PoolTradeHint(anchor, quote, f.search.tokenMint),
        ctx,
        payer,
        amount,
        slippage,
      ).instruction;
      const out = hint.pool.equals(poolB) && bWins ? 2000000n : 1000000n;
      return {
        state: f.snapshot.pumpSwap(
          new PoolTradeHint(anchor, quote, f.search.tokenMint),
          ctx,
        ),
        quote: {
          amountIn: amount,
          amountOut: out,
          minimumAmountOut: out - out / 100n,
        },
        instruction,
      };
    },
  );
  const search = {
    ...f.search,
    conversionPools: [
      new PoolTradeHint(poolB, asset, quote),
      new PoolTradeHint(poolA, asset, quote),
    ],
  };
  expect(
    searchPumpSwapTrade(
      request,
      search,
    ).trade.preview.legs[0]!.hint.pool.equals(poolB),
  ).toBe(true);
  bWins = false;
  expect(
    searchPumpSwapTrade(
      request,
      search,
    ).trade.preview.legs[0]!.hint.pool.equals(poolA),
  ).toBe(true);
  const rejected = searchPumpSwapTrade(request, {
    ...search,
    conversionPools: [
      ...search.conversionPools,
      new PoolTradeHint(key(92), asset, quote),
    ],
  });
  expect(rejected.routesEvaluated).toBe(3);
  expect(rejected.rejectedRoutes).toHaveLength(1);
});

it("explicit route preparation preserves direction and rejects a misplaced PumpSwap anchor", () => {
  const f = replayPumpSwapFixture(),
    buy = f.results[0]!.result.trade.preview;
  const request = {
    snapshot: f.snapshot,
    context: f.context,
    unixTimestamp: 1792302906n,
    payer: f.payer.publicKey,
    amount: buy.legs[0]!.amountIn,
    tradeType: "Buy" as const,
    slippageBps: 100,
  };
  const explicit = preparePumpSwapTrade(
    request,
    buy.legs.map((l) => l.hint),
  );
  expect(explicit.minimumNetAmountOut).toBe(47932572n);
  expect(() =>
    preparePumpSwapTrade(
      { ...request, tradeType: "Sell" },
      buy.legs.map((l) => l.hint),
    ),
  ).toThrow(/anchor/);
  expect(() => preparePumpSwapTrade(request, [])).toThrow(/anchor/);
});

it("matches Rust Go Python golden protected outputs for identical mainnet capture inputs", () => {
  const f = replayPumpSwapFixture();
  for (const tradeType of ["Buy", "Sell"] as const) {
    const trade = searchPumpSwapTrade(
      {
        snapshot: f.snapshot,
        context: f.context,
        unixTimestamp: 1792302906n,
        payer: f.payer.publicKey,
        amount: tradeType === "Buy" ? 1000000n : 1000000000n,
        tradeType,
        slippageBps: 100,
      },
      f.search,
    ).trade;
    expect(trade.preview.legs.map((l) => l.minimumNetAmountOut)).toEqual(
      tradeType === "Buy"
        ? [102110n, 491n, 47932572n]
        : [9924n, 2017142n, 19264527n],
    );
    for (const ix of trade.preview.swapInstructions)
      if (
        ix.data.subarray(0, 8).equals(PUMPSWAP_BUY_EXACT_QUOTE_IN_DISCRIMINATOR)
      ) {
        expect(ix.data.length).toBe(25);
        expect(ix.data[24]).toBe(1);
      }
  }
});
