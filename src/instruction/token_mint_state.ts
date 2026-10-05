/** Current epoch fees and public-transfer eligibility from cached mint bytes. */
import { PublicKey } from "@solana/web3.js";
import type { TokenTransferFee } from "./stonkfun";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TOKEN2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const lengths = new Map([
  [1, 108],
  [3, 32],
  [4, 65],
  [6, 1],
  [10, 52],
  [12, 32],
  [14, 64],
  [16, 129],
  [18, 64],
  [20, 64],
  [21, 80],
  [22, 64],
  [23, 72],
  [25, 56],
  [26, 33],
]);
export function tokenTransferFeeForEpoch(
  data: Uint8Array,
  owner: PublicKey,
  epoch: bigint,
): TokenTransferFee {
  if (typeof epoch !== "bigint" || epoch < 0n || epoch >= 1n << 64n)
    throw new Error("Epoch outside u64");
  const d = Buffer.from(data),
    program = owner.toBase58();
  if (program !== TOKEN && program !== TOKEN2022)
    throw new Error("Unsupported mint token program");
  if (
    d.length < 82 ||
    d[45] !== 1 ||
    d.readUInt32LE(0) > 1 ||
    d.readUInt32LE(46) > 1
  )
    throw new Error("Invalid or uninitialized cached mint");
  if (program === TOKEN) {
    if (d.length !== 82) throw new Error("Invalid classic mint size");
    return { basisPoints: 0, maximumFee: 0n };
  }
  if (d.length === 82) return { basisPoints: 0, maximumFee: 0n };
  if (
    d.length < 166 ||
    d.length === 355 ||
    d[165] !== 1 ||
    d.subarray(82, 165).some((b) => b !== 0)
  )
    throw new Error("Invalid Token2022 mint layout");
  const extensions = new Map<number, Buffer>();
  let offset = 166;
  while (offset < d.length) {
    if (d[offset] === 0 && d.subarray(offset).every((b) => b === 0)) break;
    if (offset + 4 > d.length) throw new Error("Truncated mint extension");
    const type = d.readUInt16LE(offset),
      length = d.readUInt16LE(offset + 2);
    offset += 4;
    if (!type || extensions.has(type) || offset + length > d.length)
      throw new Error("Invalid/duplicate mint extension");
    if (type !== 19 && !lengths.has(type))
      throw new Error("Unsupported mint extension: " + type);
    if (type !== 19 && lengths.get(type) !== length)
      throw new Error("Invalid mint extension size");
    extensions.set(type, d.subarray(offset, offset + length));
    offset += length;
  }
  const state = extensions.get(6);
  if (state && state[0] !== 1)
    throw new Error("Mint defaults to frozen/uninitialized accounts");
  const pause = extensions.get(26);
  if (pause && pause[32] !== 0) throw new Error("Mint transfers are paused");
  const hook = extensions.get(14);
  if (hook && hook.subarray(32).some((b) => b !== 0))
    throw new Error("Active transfer hook requires extra accounts");
  const fees = extensions.get(1);
  if (!fees) return { basisPoints: 0, maximumFee: 0n };
  const start = epoch >= fees.readBigUInt64LE(90) ? 90 : 72;
  const basisPoints = fees.readUInt16LE(start + 16);
  if (basisPoints > 10000) throw new Error("Invalid mint fee basis points");
  return { basisPoints, maximumFee: fees.readBigUInt64LE(start + 8) };
}
