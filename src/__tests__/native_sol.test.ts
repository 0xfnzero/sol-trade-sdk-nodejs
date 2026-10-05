import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  SubscriptionAccountCache,
  PoolTradeHint,
} from "../trading/subscription_cache";
import { settleCachedRouteWithNativeSol } from "../trading/native_sol";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  WSOL_MINT,
} from "../common/spl-token";
function prepare(direction: string, venue = "whirlpool") {
  const v = JSON.parse(
      readFileSync(
        new URL(
          "../../examples/fixtures/" +
            (venue === "dlmm" ? "dlmm_" : "") +
            "sol_route_" +
            direction +
            "_mainnet_20261002.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    cache = new SubscriptionAccountCache();
  for (const a of v.accounts)
    cache.update(new PublicKey(a.pubkey), {
      owner: new PublicKey(a.owner),
      data: Buffer.from(a.data, "base64"),
      slot: BigInt(a.slot),
      writeVersion: BigInt(a.write_version),
    });
  const payer = new PublicKey(v.payer),
    route = cache.snapshot().prepareRoute(
      v.legs.map(
        (h: any) =>
          new PoolTradeHint(
            new PublicKey(h.pool),
            new PublicKey(h.input_mint),
            new PublicKey(h.output_mint),
          ),
      ),
      { slot: BigInt(v.read_slot), epoch: BigInt(v.epoch), maximumSlotAge: 0n },
      BigInt(v.unix_timestamp),
      payer,
      BigInt(v.amount),
      100,
      8,
    );
  return { v, payer, route };
}
for (const kind of ["count", "swap", "protection", "credit", "zero"])
  it(`SOL rejects modified route ${kind}`, () => {
    const {v,payer,route: original} = prepare("buy");
    let route = {...original, legs: original.legs.map(l=>({...l})), swapInstructions:[...original.swapInstructions]};
    if (kind === "count") route.swapInstructions.pop();
    if (kind === "swap") route.swapInstructions.reverse();
    if (kind === "protection") route.minimumNetAmountOut++;
    if (kind === "credit") route.legs[1]!.amountIn=route.legs[0]!.minimumNetAmountOut+1n;
    if (kind === "zero") route.legs[0]!.amountIn=0n;
    expect(()=>settleCachedRouteWithNativeSol(route,payer,v.temporary_wsol_seed,BigInt(v.rent_lamports),true,false)).toThrow();
  });
for (const venue of ["whirlpool", "dlmm"])
  for (const direction of ["buy", "sell"])
    it(`SOL three-hop ${venue} ${direction}`, () => {
      const { v, payer, route } = prepare(direction, venue),
        old = getAssociatedTokenAddressSync(
          WSOL_MINT,
          payer,
          true,
          TOKEN_PROGRAM_ID,
        ),
        before = route.swapInstructions.map((ix) =>
          ix.keys.map((k) => k.pubkey.toBase58()),
        );
      const n = settleCachedRouteWithNativeSol(
        route,
        payer,
        v.temporary_wsol_seed,
        BigInt(v.rent_lamports),
        v.native_input,
        v.native_output,
      );
      expect(n.requiredLamports).toBe(
        BigInt(v.rent_lamports) +
          (direction === "buy" ? route.legs[0]!.amountIn : 0n),
      );
      expect(
        n.instructions
          .flatMap((ix) => ix.keys)
          .some((k) => k.pubkey.equals(old)),
      ).toBe(false);
      expect(n.instructions.at(-1)!.data).toEqual(Buffer.from([9]));
      expect(
        n.instructions.at(-1)!.keys[0]!.pubkey.equals(n.temporaryWsolAccount),
      ).toBe(true);
      expect(n.instructions[0]!.keys[0]!.isSigner).toBe(true);
      expect(n.instructions[1]!.data).toEqual(
        Buffer.concat([Buffer.from([18]), payer.toBuffer()]),
      );
      expect(n.instructions[2]!.data).toEqual(Buffer.from([17]));
      expect(String(route.minimumNetAmountOut)).toBe(
        v.expected.minimum_amount_out,
      );
      expect(route.legs).toHaveLength(3);
      for (let i = 1; i < 3; i++)
        expect(
          route.legs[i]!.amountIn <= route.legs[i - 1]!.minimumNetAmountOut,
        ).toBe(true);
      expect(
        route.swapInstructions.map((ix) =>
          ix.keys.map((k) => k.pubkey.toBase58()),
        ),
      ).toEqual(before);
      expect(
        route.swapInstructions
          .flatMap((ix) => ix.keys)
          .some((k) => k.pubkey.equals(old)),
      ).toBe(true);
      expect(
        route.swapInstructions.some(
          (ix) =>
            ix.programId.equals(TOKEN_PROGRAM_ID) &&
            ix.data.equals(Buffer.from([9])),
        ),
      ).toBe(false);
    });
for (const kind of [
  "empty_seed",
  "long_utf8",
  "surrogate",
  "rent",
  "overflow",
  "wrong_wallet",
  "both",
  "neither",
  "wrong_asset",
])
  it(`SOL rejects ${kind}`, () => {
    const { v, route } = prepare("buy");
    let payer = new PublicKey(v.payer),
      seed = v.temporary_wsol_seed,
      rent = BigInt(v.rent_lamports),
      input = true,
      output = false;
    if (kind === "empty_seed") seed = "";
    if (kind === "long_utf8") seed = "界".repeat(11);
    if (kind === "surrogate") seed = String.fromCharCode(0xd800);
    if (kind === "rent") rent = 0n;
    if (kind === "overflow") rent = (1n << 64n) - 1n;
    if (kind === "wrong_wallet") payer = PublicKey.default;
    if (kind === "both") output = true;
    if (kind === "neither") input = false;
    if (kind === "wrong_asset") {
      input = false;
      output = true;
    }
    expect(() =>
      settleCachedRouteWithNativeSol(route, payer, seed, rent, input, output),
    ).toThrow();
  });
