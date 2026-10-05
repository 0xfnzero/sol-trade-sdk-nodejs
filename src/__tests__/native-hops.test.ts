import { it, expect } from "vitest";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  buildRaydiumClmmSwapV2,
  buildWhirlpoolSwapV2,
  buildMeteoraDlmmSwap2,
} from "../instruction/native_hops";
import golden from "./fixtures/hops_rust_5_0_6.json";
const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const args = {
  amount: 1000n,
  other_amount_threshold: 500n,
  sqrt_price_limit: 0n,
  amount_specified_is_input: true,
};
for (const c of golden.cases)
  it(c.name + " accounts and bytes match Rust", () => {
    let ix: TransactionInstruction;
    if (c.name.startsWith("clmm")) {
      const pda = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_tick_array_bitmap_extension"), pk(3).toBuffer()],
        new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"),
      )[0];
      ix = buildRaydiumClmmSwapV2(
        {
          payer: pk(1),
          amm_config: pk(2),
          pool_state: pk(3),
          input_token_account: pk(4),
          output_token_account: pk(5),
          input_vault: pk(6),
          output_vault: pk(7),
          observation_state: pk(8),
          token_program: pk(9),
          token_program_2022: pk(10),
          input_vault_mint: pk(11),
          output_vault_mint: pk(12),
          tick_arrays: c.name.includes("bitmap")
            ? [pk(13), pda, pk(14)]
            : [pk(13), pk(14)],
        },
        { ...args, sqrt_price_limit: 4295048017n },
      );
    } else if (c.name.startsWith("whirlpool")) {
      const [, supp, dir] = c.name.split("_");
      ix = buildWhirlpoolSwapV2(
        {
          token_program_a: pk(1),
          token_program_b: pk(2),
          token_authority: pk(3),
          whirlpool: pk(4),
          mint_a: pk(5),
          mint_b: pk(6),
          owner_a: pk(7),
          vault_a: pk(8),
          owner_b: pk(9),
          vault_b: pk(10),
          tick_arrays:
            supp === "true"
              ? [pk(11), pk(12), pk(13), pk(14)]
              : [pk(11), pk(12), pk(13)],
        },
        { ...args, a_to_b: dir === "true" },
      );
    } else
      ix = buildMeteoraDlmmSwap2(
        {
          lb_pair: pk(1),
          reserve_x: pk(2),
          reserve_y: pk(3),
          user_token_in: pk(4),
          user_token_out: pk(5),
          token_x_mint: pk(6),
          token_y_mint: pk(7),
          oracle: pk(8),
          user: pk(9),
          token_x_program: pk(10),
          token_y_program: pk(11),
          bin_arrays: [pk(13), pk(14)],
          bitmap_extension: c.name.includes("bitmap") ? pk(12) : undefined,
        },
        1000n,
        500n,
      );
    expect(ix.programId.toBase58()).toBe(c.program);
    expect([...ix.data]).toEqual(c.data);
    expect(
      ix.keys.map((a) => ({
        pubkey: a.pubkey.toBase58(),
        is_signer: a.isSigner,
        is_writable: a.isWritable,
      })),
    ).toEqual(c.accounts);
  });
