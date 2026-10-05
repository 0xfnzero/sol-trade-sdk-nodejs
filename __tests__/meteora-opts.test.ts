import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "../src/common/spl-token";
import {
  METEORA_DAMM_V2_SWAP_MODE_EXACT_OUT,
  METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL,
  METEORA_DAMM_V2_SYSVAR_INSTRUCTIONS,
  buildMeteoraDammV2BuyInstructions,
} from "../src/instruction/meteora_damm_v2_builder";

const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

describe("Meteora DAMM v2 optional accounts", () => {
  it("defaults to 14 accounts and PartialFill", () => {
    const payer = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const ixs = buildMeteoraDammV2BuyInstructions({
      payer,
      inputMint: WSOL,
      outputMint: mint,
      inputAmount: BigInt(1_000_000),
      fixedOutputAmount: BigInt(123),
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: {
        pool,
        tokenAMint: WSOL,
        tokenBMint: mint,
        tokenAVault: Keypair.generate().publicKey,
        tokenBVault: Keypair.generate().publicKey,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      },
    });
    const swap = ixs[ixs.length - 1];
    expect(swap.keys.length).toBe(14);
    expect(swap.data[24]).toBe(METEORA_DAMM_V2_SWAP_MODE_PARTIAL_FILL);
  });

  it("inserts referral and appends sysvar for ExactOut", () => {
    const payer = Keypair.generate();
    const mint = Keypair.generate().publicKey;
    const referral = Keypair.generate().publicKey;
    const fixed = BigInt(123);
    const input = BigInt(1_000_000);
    const ixs = buildMeteoraDammV2BuyInstructions({
      payer,
      inputMint: WSOL,
      outputMint: mint,
      inputAmount: input,
      fixedOutputAmount: fixed,
      createInputMintAta: false,
      createOutputMintAta: false,
      protocolParams: {
        pool: Keypair.generate().publicKey,
        tokenAMint: WSOL,
        tokenBMint: mint,
        tokenAVault: Keypair.generate().publicKey,
        tokenBVault: Keypair.generate().publicKey,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        referralTokenAccount: referral,
        includeRateLimiterSysvar: true,
        swapMode: METEORA_DAMM_V2_SWAP_MODE_EXACT_OUT,
      },
    });
    const swap = ixs[ixs.length - 1];
    expect(swap.keys.length).toBe(15);
    expect(swap.keys[11].pubkey.equals(referral)).toBe(true);
    expect(swap.keys[11].isWritable).toBe(true);
    expect(swap.keys[14].pubkey.equals(METEORA_DAMM_V2_SYSVAR_INSTRUCTIONS)).toBe(
      true
    );
    expect(swap.data[24]).toBe(METEORA_DAMM_V2_SWAP_MODE_EXACT_OUT);
    expect(swap.data.readBigUInt64LE(8)).toBe(fixed);
    expect(swap.data.readBigUInt64LE(16)).toBe(input);
  });
});
