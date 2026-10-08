/** Direct conversion instructions, with explicit amounts and subscription accounts. */
import { AccountMeta, PublicKey, TransactionInstruction } from "@solana/web3.js";
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const CLMM = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const WHIRLPOOL = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const DLMM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const DLMM_EVENT = new PublicKey(
  "D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6",
);
export interface SwapV2Args {
  amount: bigint;
  other_amount_threshold: bigint;
  sqrt_price_limit: bigint;
  amount_specified_is_input: boolean;
}
function dataV2(args: SwapV2Args, length: number): Buffer {
  for (const n of [args.amount, args.other_amount_threshold])
    if (typeof n !== "bigint" || n < 0n || n >= 1n << 64n)
      throw new Error("Swap amount outside u64");
  if (
    typeof args.sqrt_price_limit !== "bigint" ||
    args.sqrt_price_limit < 0n ||
    args.sqrt_price_limit >= 1n << 128n
  )
    throw new Error("Sqrt price outside u128");
  if (typeof args.amount_specified_is_input !== "boolean")
    throw Error("Swap mode must be boolean");
  const d = Buffer.alloc(length);
  Buffer.from([43, 4, 237, 11, 26, 201, 30, 98]).copy(d);
  d.writeBigUInt64LE(args.amount, 8);
  d.writeBigUInt64LE(args.other_amount_threshold, 16);
  d.writeBigUInt64LE(args.sqrt_price_limit & ((1n << 64n) - 1n), 24);
  d.writeBigUInt64LE(args.sqrt_price_limit >> 64n, 32);
  d[40] = Number(args.amount_specified_is_input);
  return d;
}
function instruction(
  program: PublicKey,
  data: Buffer,
  keys: PublicKey[],
  signer: number,
  writable: (i: number) => boolean,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: program,
    data,
    keys: keys.map((pubkey, i) => ({
      pubkey,
      isSigner: i === signer,
      isWritable: writable(i),
    })),
  });
}
export interface RaydiumClmmSwapV2Accounts {
  payer: PublicKey;
  amm_config: PublicKey;
  pool_state: PublicKey;
  input_token_account: PublicKey;
  output_token_account: PublicKey;
  input_vault: PublicKey;
  output_vault: PublicKey;
  observation_state: PublicKey;
  token_program: PublicKey;
  token_program_2022: PublicKey;
  input_vault_mint: PublicKey;
  output_vault_mint: PublicKey;
  tick_array_bitmap_extension?: PublicKey;
  tick_arrays: readonly PublicKey[];
}
export function buildRaydiumClmmSwapV2(
  a: RaydiumClmmSwapV2Accounts,
  args: SwapV2Args,
): TransactionInstruction {
  const pda = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_tick_array_bitmap_extension"), a.pool_state.toBuffer()],
    CLMM,
  )[0];
  if (
    a.tick_array_bitmap_extension &&
    !a.tick_array_bitmap_extension.equals(pda)
  )
    throw Error("CLMM bitmap identity mismatch");
  const ticks = a.tick_arrays.filter((k) => !k.equals(pda));
  const bitmap =
    a.tick_array_bitmap_extension?.equals(pda) ||
    a.tick_arrays.some((k) => k.equals(pda));
  if (!ticks.length) throw new Error("CLMM requires at least one tick array");
  const keys = [
    a.payer,
    a.amm_config,
    a.pool_state,
    a.input_token_account,
    a.output_token_account,
    a.input_vault,
    a.output_vault,
    a.observation_state,
    a.token_program,
    a.token_program_2022,
    MEMO,
    a.input_vault_mint,
    a.output_vault_mint,
    ...(bitmap ? [pda] : []),
    ...ticks,
  ];
  return instruction(
    CLMM,
    dataV2(args, 41),
    keys,
    0,
    (i) => (i >= 2 && i <= 7) || i >= 13,
  );
}
export interface WhirlpoolSwapV2Accounts {
  token_program_a: PublicKey;
  token_program_b: PublicKey;
  token_authority: PublicKey;
  whirlpool: PublicKey;
  mint_a: PublicKey;
  mint_b: PublicKey;
  owner_a: PublicKey;
  vault_a: PublicKey;
  owner_b: PublicKey;
  vault_b: PublicKey;
  tick_arrays: readonly PublicKey[];
}
export function buildWhirlpoolSwapV2(
  a: WhirlpoolSwapV2Accounts,
  args: SwapV2Args & { a_to_b: boolean },
): TransactionInstruction {
  if (typeof args.a_to_b !== "boolean")
    throw Error("Swap direction must be boolean");
  if (a.tick_arrays.length < 3 || a.tick_arrays.length > 6)
    throw new Error("Whirlpool requires 3..6 tick arrays");
  const oracle = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), a.whirlpool.toBuffer()],
    WHIRLPOOL,
  )[0];
  const keys = [
    a.token_program_a,
    a.token_program_b,
    MEMO,
    a.token_authority,
    a.whirlpool,
    a.mint_a,
    a.mint_b,
    a.owner_a,
    a.vault_a,
    a.owner_b,
    a.vault_b,
    ...a.tick_arrays.slice(0, 3),
    oracle,
    ...a.tick_arrays.slice(3),
  ];
  const limit =
      args.sqrt_price_limit ||
      (args.a_to_b ? 4295048016n : 79226673515401279992447579055n),
    d = dataV2(
      { ...args, sqrt_price_limit: limit },
      a.tick_arrays.length > 3 ? 49 : 43,
    );
  d[41] = Number(args.a_to_b);
  if (a.tick_arrays.length > 3) {
    d[42] = 1;
    d.writeUInt32LE(1, 43);
    d[47] = 6;
    d[48] = a.tick_arrays.length - 3;
  }
  return instruction(WHIRLPOOL, d, keys, 3, (i) => i === 4 || i >= 7);
}
export interface MeteoraDlmmSwap2Accounts {
  lb_pair: PublicKey;
  bitmap_extension?: PublicKey;
  reserve_x: PublicKey;
  reserve_y: PublicKey;
  user_token_in: PublicKey;
  user_token_out: PublicKey;
  token_x_mint: PublicKey;
  token_y_mint: PublicKey;
  oracle: PublicKey;
  user: PublicKey;
  token_x_program: PublicKey;
  token_y_program: PublicKey;
  bin_arrays: readonly PublicKey[];
}
export function buildMeteoraDlmmSwap2(
  a: MeteoraDlmmSwap2Accounts,
  amountIn: bigint,
  minOut: bigint,
): TransactionInstruction {
  if (!a.bin_arrays.length)
    throw new Error("DLMM requires at least one bin array");
  for (const n of [amountIn, minOut])
    if (typeof n !== "bigint" || n < 0n || n >= 1n << 64n)
      throw new Error("Swap amount outside u64");
  const keys = [
    a.lb_pair,
    a.bitmap_extension ?? DLMM,
    a.reserve_x,
    a.reserve_y,
    a.user_token_in,
    a.user_token_out,
    a.token_x_mint,
    a.token_y_mint,
    a.oracle,
    DLMM,
    a.user,
    a.token_x_program,
    a.token_y_program,
    MEMO,
    DLMM_EVENT,
    DLMM,
    ...a.bin_arrays,
  ];
  const d = Buffer.alloc(28);
  Buffer.from([65, 75, 63, 76, 235, 91, 91, 136]).copy(d);
  d.writeBigUInt64LE(amountIn, 8);
  d.writeBigUInt64LE(minOut, 16);
  return instruction(
    DLMM,
    d,
    keys,
    10,
    (i) =>
      i === 0 ||
      (i === 1 && a.bitmap_extension !== undefined) ||
      (i >= 2 && i <= 5) ||
      i === 8 ||
      i >= 16,
  );
}

/** Low-level swap with resolved Hook metas; cached routes still fail closed.
 * Resolve separately for each transfer's actual source and destination. */
export function buildWhirlpoolSwapV2WithHooks(
  a: WhirlpoolSwapV2Accounts, args: SwapV2Args & { a_to_b: boolean },
  hookA: readonly AccountMeta[] = [], hookB: readonly AccountMeta[] = [],
): TransactionInstruction {
  const base = buildWhirlpoolSwapV2(a, args), slices: number[] = [], extras: AccountMeta[] = [];
  for (const [kind, metas] of [[0, hookA], [1, hookB], [6, base.keys.slice(15)]] as const) {
    if (metas.length > 255) throw Error('Whirlpool remaining slice exceeds u8');
    if (metas.length) { slices.push(kind, metas.length); extras.push(...metas); }
  }
  const info = slices.length ? Buffer.alloc(5 + slices.length) : Buffer.from([0]);
  if (slices.length) {info[0] = 1; info.writeUInt32LE(slices.length / 2, 1); Buffer.from(slices).copy(info, 5);}
  return new TransactionInstruction({programId: base.programId, data: Buffer.concat([base.data.subarray(0, 42), info]), keys: [...base.keys.slice(0, 15), ...extras]});
}
