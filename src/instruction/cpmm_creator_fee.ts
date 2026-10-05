/** CPMM collection parity with Rust 5.0.7. Pure preparation; no network on the hot path. */
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  type Connection,
  type AccountInfo,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "../common/spl-token";
import {
  RAYDIUM_CPMM_PROGRAM_ID as PROGRAM,
  RAYDIUM_CPMM_AUTHORITY as AUTHORITY,
} from "./raydium_cpmm_builder";
import type {
  AccountCacheSnapshot,
  CacheReadContext,
} from "../trading/subscription_cache";
const ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const CONFIG_DISC = Buffer.from([218, 244, 33, 104, 203, 203, 43, 111]);
const SHARE_DISC = Buffer.from([30, 235, 98, 252, 26, 197, 66, 86]);
const POOL_DISC = Buffer.from([247, 237, 227, 245, 215, 195, 222, 70]);
function bytes(data: Uint8Array, size: number, disc: Buffer): Buffer {
  const b = Buffer.from(data);
  if (b.length < size || !b.subarray(0, 8).equals(disc))
    throw Error("Invalid CPMM account layout/discriminator");
  return b;
}
function u64(n: bigint): void {
  if (typeof n !== "bigint" || n < 0n || n > 0xffffffffffffffffn)
    throw Error("Value outside u64");
}
function rate(n: bigint): void {
  u64(n);
  if (n > 1000000n) throw Error("Creator fee share rate exceeds 1,000,000");
}
export interface CpmmAmmConfig {
  bump: number;
  disableCreatePool: boolean;
  index: number;
  tradeFeeRate: bigint;
  protocolFeeRate: bigint;
  fundFeeRate: bigint;
  createPoolFee: bigint;
  protocolOwner: PublicKey;
  fundOwner: PublicKey;
  creatorFeeRate: bigint;
  creatorFeeShareRate: bigint;
  padding: bigint[];
}
export function decodeCpmmAmmConfig(data: Uint8Array): CpmmAmmConfig {
  const b = bytes(data, 236, CONFIG_DISC);
  if (b[9]! > 1) throw Error("Invalid config bool");
  return {
    bump: b[8]!,
    disableCreatePool: b[9] === 1,
    index: b.readUInt16LE(10),
    tradeFeeRate: b.readBigUInt64LE(12),
    protocolFeeRate: b.readBigUInt64LE(20),
    fundFeeRate: b.readBigUInt64LE(28),
    createPoolFee: b.readBigUInt64LE(36),
    protocolOwner: new PublicKey(b.subarray(44, 76)),
    fundOwner: new PublicKey(b.subarray(76, 108)),
    creatorFeeRate: b.readBigUInt64LE(108),
    creatorFeeShareRate: b.readBigUInt64LE(116),
    padding: Array.from({ length: 14 }, (_, i) =>
      b.readBigUInt64LE(124 + i * 8),
    ),
  };
}
export interface CpmmCreatorFeeShare {
  bump: number;
  creator: PublicKey;
  ammConfig: PublicKey;
  shareRate: bigint;
  padding: bigint[];
}
export function decodeCpmmCreatorFeeShare(
  data: Uint8Array,
): CpmmCreatorFeeShare {
  const b = bytes(data, 145, SHARE_DISC);
  return {
    bump: b[8]!,
    creator: new PublicKey(b.subarray(9, 41)),
    ammConfig: new PublicKey(b.subarray(41, 73)),
    shareRate: b.readBigUInt64LE(73),
    padding: Array.from({ length: 8 }, (_, i) => b.readBigUInt64LE(81 + i * 8)),
  };
}
export interface CpmmCollectionPool {
  ammConfig: PublicKey;
  poolCreator: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  token0Program: PublicKey;
  token1Program: PublicKey;
  creatorFeesToken0: bigint;
  creatorFeesToken1: bigint;
  protocolFeesToken0: bigint;
  protocolFeesToken1: bigint;
}
export function decodeCpmmCollectionPool(data: Uint8Array): CpmmCollectionPool {
  const b = bytes(data, 637, POOL_DISC);
  const pk = (i: number) => new PublicKey(b.subarray(8 + i * 32, 40 + i * 32));
  if (b[390]! > 1) throw Error("Invalid pool bool");
  return {
    ammConfig: pk(0),
    poolCreator: pk(1),
    token0Vault: pk(2),
    token1Vault: pk(3),
    token0Mint: pk(5),
    token1Mint: pk(6),
    token0Program: pk(7),
    token1Program: pk(8),
    creatorFeesToken0: b.readBigUInt64LE(397),
    creatorFeesToken1: b.readBigUInt64LE(405),
    protocolFeesToken0: b.readBigUInt64LE(341),
    protocolFeesToken1: b.readBigUInt64LE(349),
  };
}
export function getCreatorFeeSharePda(
  creator: PublicKey,
  config: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_fee_share"), creator.toBuffer(), config.toBuffer()],
    PROGRAM,
  )[0];
}
export function resolveCreatorFeeShareRate(
  config: CpmmAmmConfig,
  creator: PublicKey,
  address: PublicKey,
  share: Pick<AccountInfo<Uint8Array>, "owner" | "data" | "lamports"> | null,
): bigint {
  let n = config.creatorFeeShareRate;
  if (
    share &&
    share.lamports !== 0 &&
    share.owner.equals(PROGRAM) &&
    share.data.length
  ) {
    const s = decodeCpmmCreatorFeeShare(share.data);
    if (!s.creator.equals(creator) || !s.ammConfig.equals(address))
      throw Error("CreatorFeeShare creator/config mismatch");
    n = s.shareRate;
  }
  rate(n);
  return n;
}
/** Cold-path helper: fetch config and override in one confirmed bank snapshot. */
export async function fetchCreatorFeeShareRate(
  rpc: Connection,
  creator: PublicKey,
  config: PublicKey,
): Promise<bigint> {
  const result = await rpc.getMultipleAccountsInfoAndContext(
    [config, getCreatorFeeSharePda(creator, config)],
    "confirmed",
  );
  if (result.value.length !== 2) throw Error("Incomplete fee-share snapshot");
  const a = result.value[0];
  if (!a || !a.owner.equals(PROGRAM) || a.lamports === 0)
    throw Error("Missing/invalid CPMM config");
  return resolveCreatorFeeShareRate(
    decodeCpmmAmmConfig(a.data),
    creator,
    config,
    result.value[1] ?? null,
  );
}
export function splitCreatorFee(
  gross: bigint,
  shareRate: bigint,
): [bigint, bigint] {
  u64(gross);
  rate(shareRate);
  const protocol = (gross * shareRate) / 1000000n;
  return [gross - protocol, protocol];
}
export function estimateCreatorFeePayout(
  pool: CpmmCollectionPool,
  shareRate: bigint,
): [bigint, bigint] {
  return [
    splitCreatorFee(pool.creatorFeesToken0, shareRate)[0],
    splitCreatorFee(pool.creatorFeesToken1, shareRate)[0],
  ];
}
function build(
  poolAddress: PublicKey,
  pool: CpmmCollectionPool,
  payer?: PublicKey,
): TransactionInstruction {
  const m = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({
    pubkey,
    isWritable,
    isSigner,
  });
  const creator = pool.poolCreator;
  const keys = payer
    ? [m(payer, true, true), m(creator), m(AUTHORITY), m(poolAddress, true)]
    : [
        m(creator, true, true),
        m(AUTHORITY),
        m(poolAddress, true),
        m(pool.ammConfig),
      ];
  keys.push(
    m(pool.token0Vault, true),
    m(pool.token1Vault, true),
    m(pool.token0Mint),
    m(pool.token1Mint),
    m(
      getAssociatedTokenAddressSync(
        pool.token0Mint,
        creator,
        true,
        pool.token0Program,
      ),
      true,
    ),
    m(
      getAssociatedTokenAddressSync(
        pool.token1Mint,
        creator,
        true,
        pool.token1Program,
      ),
      true,
    ),
    m(pool.token0Program),
    m(pool.token1Program),
    m(ATA),
    m(SystemProgram.programId),
  );
  if (payer) keys.push(m(pool.ammConfig));
  keys.push(m(getCreatorFeeSharePda(creator, pool.ammConfig)));
  return new TransactionInstruction({
    programId: PROGRAM,
    keys,
    data: Buffer.from(
      payer
        ? [202, 202, 34, 83, 226, 122, 145, 229]
        : [20, 22, 86, 123, 198, 28, 219, 132],
    ),
  });
}
export function collectCreatorFee(
  poolAddress: PublicKey,
  pool: CpmmCollectionPool,
): TransactionInstruction {
  return build(poolAddress, pool);
}
export function collectCreatorFeePermissionless(
  payer: PublicKey,
  poolAddress: PublicKey,
  pool: CpmmCollectionPool,
): TransactionInstruction {
  return build(poolAddress, pool, payer);
}
/** Explicit PDA tombstone required: missing stream update does not prove absence. */
export function prepareCpmmCreatorFeeCollection(
  snapshot: AccountCacheSnapshot,
  address: PublicKey,
  ctx: CacheReadContext,
  payer?: PublicKey,
) {
  const pool = decodeCpmmCollectionPool(
    snapshot.get(address, ctx, PROGRAM).data,
  );
  if (
    [pool.token0Program, pool.token1Program].some(
      (p) => !p.equals(TOKEN) && !p.equals(TOKEN2022),
    )
  )
    throw Error("Unsupported CPMM token program");
  if (
    pool.token0Mint.equals(PublicKey.default) ||
    pool.token1Mint.equals(PublicKey.default) ||
    pool.token0Mint.equals(pool.token1Mint)
  )
    throw Error("Invalid mint pair");
  if (pool.creatorFeesToken0 === 0n && pool.creatorFeesToken1 === 0n)
    throw Error("No accrued CPMM creator fees");
  const config = decodeCpmmAmmConfig(
      snapshot.get(pool.ammConfig, ctx, PROGRAM).data,
    ),
    creatorFeeShare = getCreatorFeeSharePda(pool.poolCreator, pool.ammConfig);
  const observation = snapshot.getObservation(creatorFeeShare, ctx);
  const shareRate = resolveCreatorFeeShareRate(
    config,
    pool.poolCreator,
    pool.ammConfig,
    observation ? { ...observation, lamports: 1 } : null,
  );
  const [creatorPayoutToken0, protocolShareToken0] = splitCreatorFee(
      pool.creatorFeesToken0,
      shareRate,
    ),
    [creatorPayoutToken1, protocolShareToken1] = splitCreatorFee(
      pool.creatorFeesToken1,
      shareRate,
    );
  u64(pool.protocolFeesToken0 + protocolShareToken0);
  u64(pool.protocolFeesToken1 + protocolShareToken1);
  const accountVersions = [address, pool.ammConfig, creatorFeeShare].map(
    (k) => {
      const a = snapshot.getObservation(k, ctx);
      return { address: k, slot: a.slot, writeVersion: a.writeVersion };
    },
  );
  snapshot.assertUsable();
  return {
    pool: address,
    creator: pool.poolCreator,
    ammConfig: pool.ammConfig,
    accountVersions,
    instruction: build(address, pool, payer),
    snapshotSlot: ctx.slot,
    creatorFeeShare,
    shareRate,
    creatorPayoutToken0,
    creatorPayoutToken1,
    protocolShareToken0,
    protocolShareToken1,
  };
}

export function validateCpmmCreatorFeeCollection(
  snapshot: AccountCacheSnapshot,
  prepared: ReturnType<typeof prepareCpmmCreatorFeeCollection>,
  ctx: CacheReadContext,
  payer?: PublicKey,
): void {
  if (ctx.slot < prepared.snapshotSlot)
    throw Error("Collection read context moved backwards");
  for (const v of prepared.accountVersions) {
    if (v.slot > prepared.snapshotSlot)
      throw Error("Prepared snapshot precedes observations");
    const a = snapshot.getObservation(v.address, ctx);
    if (a.slot !== v.slot || a.writeVersion !== v.writeVersion)
      throw Error("Creator-fee preparation changed; reprepare");
  }
  const current = prepareCpmmCreatorFeeCollection(
    snapshot,
    prepared.pool,
    ctx,
    payer,
  );
  const canonical = (p: typeof prepared) =>
    JSON.stringify(p, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  // A new read slot may be used, but account versions and every prepared field must agree.
  if (
    canonical({ ...current, snapshotSlot: prepared.snapshotSlot }) !==
    canonical(prepared)
  )
    throw Error("CPMM creator-fee preparation changed; reprepare");
}
