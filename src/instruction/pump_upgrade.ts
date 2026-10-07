/** Pump October 2026 compact trades and fee sweeps. Source: official IDL commit 8cda1fa. */
import {
  PublicKey,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
type Spec = {
  program: string;
  discriminator: number[];
  accounts: { name: string; writable?: boolean; signer?: boolean }[];
  args: number;
  partial_fill: boolean;
};
const SPECS: Record<string, Spec> = {
  pump_buy_v3: {
    program: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    discriminator: [7, 5, 29, 196, 245, 23, 101, 80],
    accounts: [
      { name: "global" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "base_token_program" },
      { name: "quote_token_program" },
      { name: "bonding_curve", writable: true },
      { name: "associated_base_bonding_curve", writable: true },
      { name: "associated_quote_bonding_curve", writable: true },
      { name: "user", writable: true, signer: true },
      { name: "associated_base_user", writable: true },
      { name: "associated_quote_user", writable: true },
      { name: "user_volume_accumulator", writable: true },
      { name: "fee_config" },
      { name: "buyback_fee_recipient", writable: true },
      { name: "system_program" },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 2,
    partial_fill: true,
  },
  pump_buy_exact_quote_in_v3: {
    program: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    discriminator: [225, 247, 80, 30, 213, 179, 132, 136],
    accounts: [
      { name: "global" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "base_token_program" },
      { name: "quote_token_program" },
      { name: "bonding_curve", writable: true },
      { name: "associated_base_bonding_curve", writable: true },
      { name: "associated_quote_bonding_curve", writable: true },
      { name: "user", writable: true, signer: true },
      { name: "associated_base_user", writable: true },
      { name: "associated_quote_user", writable: true },
      { name: "user_volume_accumulator", writable: true },
      { name: "fee_config" },
      { name: "buyback_fee_recipient", writable: true },
      { name: "system_program" },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 2,
    partial_fill: true,
  },
  pump_sell_v3: {
    program: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    discriminator: [28, 146, 222, 119, 38, 196, 105, 213],
    accounts: [
      { name: "global" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "base_token_program" },
      { name: "quote_token_program" },
      { name: "bonding_curve", writable: true },
      { name: "associated_base_bonding_curve", writable: true },
      { name: "associated_quote_bonding_curve", writable: true },
      { name: "user", writable: true, signer: true },
      { name: "associated_base_user", writable: true },
      { name: "associated_quote_user", writable: true },
      { name: "user_volume_accumulator", writable: true },
      { name: "fee_config" },
      { name: "buyback_fee_recipient", writable: true },
      { name: "system_program" },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 2,
    partial_fill: false,
  },
  pump_sweep_creator_fee: {
    program: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    discriminator: [32, 246, 191, 52, 8, 201, 73, 186],
    accounts: [
      { name: "payer", writable: true, signer: true },
      { name: "global" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "quote_token_program" },
      { name: "associated_token_program" },
      { name: "system_program" },
      { name: "bonding_curve", writable: true },
      { name: "associated_quote_bonding_curve", writable: true },
      { name: "recipient", writable: true },
      { name: "associated_quote_recipient", writable: true },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 0,
    partial_fill: false,
  },
  pump_sweep_protocol_fee: {
    program: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    discriminator: [8, 48, 190, 7, 182, 68, 183, 229],
    accounts: [
      { name: "payer", writable: true, signer: true },
      { name: "global" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "quote_token_program" },
      { name: "associated_token_program" },
      { name: "system_program" },
      { name: "bonding_curve", writable: true },
      { name: "associated_quote_bonding_curve", writable: true },
      { name: "recipient", writable: true },
      { name: "associated_quote_recipient", writable: true },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 0,
    partial_fill: false,
  },
  pump_amm_buy_v2: {
    program: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    discriminator: [184, 23, 238, 97, 103, 197, 211, 61],
    accounts: [
      { name: "pool", writable: true },
      { name: "user", writable: true, signer: true },
      { name: "global_config" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "user_base_token_account", writable: true },
      { name: "user_quote_token_account", writable: true },
      { name: "pool_base_token_account", writable: true },
      { name: "pool_quote_token_account", writable: true },
      { name: "base_token_program" },
      { name: "quote_token_program" },
      { name: "system_program" },
      { name: "user_volume_accumulator", writable: true },
      { name: "fee_config" },
      { name: "buyback_fee_recipient", writable: true },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 2,
    partial_fill: false,
  },
  pump_amm_buy_exact_quote_in_v2: {
    program: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    discriminator: [194, 171, 28, 70, 104, 77, 91, 47],
    accounts: [
      { name: "pool", writable: true },
      { name: "user", writable: true, signer: true },
      { name: "global_config" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "user_base_token_account", writable: true },
      { name: "user_quote_token_account", writable: true },
      { name: "pool_base_token_account", writable: true },
      { name: "pool_quote_token_account", writable: true },
      { name: "base_token_program" },
      { name: "quote_token_program" },
      { name: "system_program" },
      { name: "user_volume_accumulator", writable: true },
      { name: "fee_config" },
      { name: "buyback_fee_recipient", writable: true },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 2,
    partial_fill: false,
  },
  pump_amm_sell_v2: {
    program: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    discriminator: [93, 246, 130, 60, 231, 233, 64, 178],
    accounts: [
      { name: "pool", writable: true },
      { name: "user", writable: true, signer: true },
      { name: "global_config" },
      { name: "base_mint" },
      { name: "quote_mint" },
      { name: "user_base_token_account", writable: true },
      { name: "user_quote_token_account", writable: true },
      { name: "pool_base_token_account", writable: true },
      { name: "pool_quote_token_account", writable: true },
      { name: "base_token_program" },
      { name: "quote_token_program" },
      { name: "system_program" },
      { name: "user_volume_accumulator", writable: true },
      { name: "fee_config" },
      { name: "buyback_fee_recipient", writable: true },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 2,
    partial_fill: false,
  },
  pump_amm_multi_hop_swap: {
    program: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    discriminator: [43, 100, 73, 19, 233, 246, 111, 148],
    accounts: [
      { name: "user", writable: true, signer: true },
      { name: "user_in_token_account", writable: true },
      { name: "user_out_token_account", writable: true },
      { name: "global_config" },
      { name: "fee_config" },
      { name: "user_volume_accumulator", writable: true },
      { name: "buyback_fee_recipient", writable: true },
      { name: "token_program" },
      { name: "token_2022_program" },
      { name: "system_program" },
      { name: "event_authority" },
      { name: "program" },
      { name: "pump_program" },
      { name: "pump_global" },
      { name: "pump_fee_config" },
      { name: "pump_event_authority" },
    ],
    args: 2,
    partial_fill: false,
  },
  pump_amm_sweep_creator_fee: {
    program: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    discriminator: [32, 246, 191, 52, 8, 201, 73, 186],
    accounts: [
      { name: "payer", writable: true, signer: true },
      { name: "global_config" },
      { name: "pool", writable: true },
      { name: "quote_mint" },
      { name: "quote_token_program" },
      { name: "pool_quote_token_account", writable: true },
      { name: "recipient" },
      { name: "recipient_token_account", writable: true },
      { name: "system_program" },
      { name: "associated_token_program" },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 0,
    partial_fill: false,
  },
  pump_amm_sweep_protocol_fee: {
    program: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    discriminator: [8, 48, 190, 7, 182, 68, 183, 229],
    accounts: [
      { name: "payer", writable: true, signer: true },
      { name: "global_config" },
      { name: "pool", writable: true },
      { name: "quote_mint" },
      { name: "quote_token_program" },
      { name: "pool_quote_token_account", writable: true },
      { name: "recipient" },
      { name: "recipient_token_account", writable: true },
      { name: "system_program" },
      { name: "associated_token_program" },
      { name: "event_authority" },
      { name: "program" },
    ],
    args: 0,
    partial_fill: false,
  },
};
export type PumpUpgradeAccounts = Readonly<Record<string, PublicKey>>;
/** Bare instruction: required token accounts must already exist; no RPC or ATA creation. */
export function buildPumpUpgradeInstruction(
  name: string,
  accounts: PumpUpgradeAccounts,
  amounts: readonly bigint[] = [],
  partialFill?: boolean,
  remaining: readonly AccountMeta[] = [],
): TransactionInstruction {
  const s = SPECS[name];
  if (!s) throw new Error("Unsupported Pump upgrade instruction");
  if (
    amounts.length !== s.args ||
    amounts.some(
      (n) => typeof n !== "bigint" || n < 0n || n > 0xffffffffffffffffn,
    )
  )
    throw new Error("Invalid u64 arguments");
  if (amounts.length && amounts[0] === 0n)
    throw new Error("Input amount must be positive");
  if (
    name === "pump_amm_multi_hop_swap" &&
    (amounts[1] === 0n || remaining.length < 5 || remaining.length % 5 !== 0)
  )
    throw new Error("Invalid multi-hop route or minimum output");
  if (name !== "pump_amm_multi_hop_swap" && remaining.length)
    throw new Error("Compact trades and sweeps take no remaining accounts");
  if (
    partialFill !== undefined &&
    (!s.partial_fill || typeof partialFill !== "boolean")
  )
    throw new Error("Invalid partial fill");
  const keys = s.accounts.map((a) => {
    const k = accounts[a.name];
    if (!(k instanceof PublicKey))
      throw new Error("Missing account: " + a.name);
    return { pubkey: k, isWritable: !!a.writable, isSigner: !!a.signer };
  });
  if (remaining.some((a, i) => a.isSigner || a.isWritable !== i % 5 >= 2))
    throw new Error("Invalid hop account flags");
  const data = Buffer.alloc(
    8 + amounts.length * 8 + (partialFill === undefined ? 0 : 1),
  );
  Buffer.from(s.discriminator).copy(data);
  amounts.forEach((n, i) => data.writeBigUInt64LE(n, 8 + i * 8));
  if (partialFill !== undefined) data[data.length - 1] = partialFill ? 1 : 0;
  return new TransactionInstruction({
    programId: new PublicKey(s.program),
    keys: [...keys, ...remaining],
    data,
  });
}
export function buildPumpBuyV3Instruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
  partialFill?: boolean,
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_buy_v3",
    accounts,
    [amount, limit],
    partialFill,
  );
}
export function buildPumpBuyExactQuoteInV3Instruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
  partialFill?: boolean,
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_buy_exact_quote_in_v3",
    accounts,
    [amount, limit],
    partialFill,
  );
}
export function buildPumpSellV3Instruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_sell_v3",
    accounts,
    [amount, limit],
    undefined,
  );
}
export function buildPumpSweepCreatorFeeInstruction(
  accounts: PumpUpgradeAccounts,
): TransactionInstruction {
  return buildPumpUpgradeInstruction("pump_sweep_creator_fee", accounts);
}
export function buildPumpSweepProtocolFeeInstruction(
  accounts: PumpUpgradeAccounts,
): TransactionInstruction {
  return buildPumpUpgradeInstruction("pump_sweep_protocol_fee", accounts);
}
export function buildPumpAmmBuyV2Instruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_amm_buy_v2",
    accounts,
    [amount, limit],
    undefined,
  );
}
export function buildPumpAmmBuyExactQuoteInV2Instruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_amm_buy_exact_quote_in_v2",
    accounts,
    [amount, limit],
    undefined,
  );
}
export function buildPumpAmmSellV2Instruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_amm_sell_v2",
    accounts,
    [amount, limit],
    undefined,
  );
}
export function buildPumpAmmMultiHopSwapInstruction(
  accounts: PumpUpgradeAccounts,
  amount: bigint,
  limit: bigint,
  hops: readonly AccountMeta[],
): TransactionInstruction {
  return buildPumpUpgradeInstruction(
    "pump_amm_multi_hop_swap",
    accounts,
    [amount, limit],
    undefined,
    hops,
  );
}
export function buildPumpAmmSweepCreatorFeeInstruction(
  accounts: PumpUpgradeAccounts,
): TransactionInstruction {
  return buildPumpUpgradeInstruction("pump_amm_sweep_creator_fee", accounts);
}
export function buildPumpAmmSweepProtocolFeeInstruction(
  accounts: PumpUpgradeAccounts,
): TransactionInstruction {
  return buildPumpUpgradeInstruction("pump_amm_sweep_protocol_fee", accounts);
}
