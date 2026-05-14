/**
 * Poll multiple transaction signatures until one reaches confirmed/finalized without error.
 * Rust: `swqos::common::poll_any_transaction_confirmation`.
 */

import { Connection, type Commitment, type Finality } from '@solana/web3.js';
import { TradeError } from '../sdk-errors';

/**
 * Map RPC `Commitment` to `getTransaction` `Finality` (web3: only `confirmed` | `finalized`).
 * `processed` / unknown → `confirmed`.
 */
export function commitmentToGetTxFinality(c: Commitment | undefined): Finality {
  if (c === 'finalized') return 'finalized';
  return 'confirmed';
}

export interface ConfirmAnySignatureOptions {
  commitment?: Commitment;
  /**
   * `getTransaction` lookup commitment (Rust: `CommitmentConfig::confirmed()`).
   * Defaults from {@link commitmentToGetTxFinality}(`commitment`).
   */
  getTransactionCommitment?: Finality;
  /** Default 15000 (Rust uses 15s). */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /**
   * Rust waits until `poll_count >= 10` before `get_transaction_with_config` on the first landed signature.
   * @default 10
   */
  pollsBeforeGetTransaction?: number;
}

/** Rust: log line patterns for user-facing failure hints. */
export function extractHintsFromLogs(
  logs: readonly string[] | null | undefined
): string {
  if (!logs?.length) return '';
  const parts: string[] = [];
  for (const log of logs) {
    let idx = log.indexOf('Error Message: ');
    if (idx !== -1) {
      parts.push(log.slice(idx + 15).replace(/\.$/, '').trim());
      continue;
    }
    idx = log.indexOf('Program log: Error: ');
    if (idx !== -1) {
      parts.push(log.slice(idx + 20).replace(/\.$/, '').trim());
    }
  }
  return parts.join('; ');
}

/**
 * Map `TransactionError` JSON (meta.err) to a numeric code; prefers Custom instruction code like Rust.
 */
export function instructionErrorCodeFromMetaErr(err: unknown): {
  code: number;
  instructionIndex?: number;
} {
  if (err == null) return { code: 0 };
  if (typeof err === 'object' && err !== null) {
    const ie = (err as { InstructionError?: [number, unknown] }).InstructionError;
    if (Array.isArray(ie) && ie.length >= 2) {
      const instructionIndex = ie[0];
      const detail = ie[1];
      if (
        detail &&
        typeof detail === 'object' &&
        detail !== null &&
        'Custom' in detail
      ) {
        return {
          code: Number((detail as { Custom: number }).Custom),
          instructionIndex,
        };
      }
      return { code: 999, instructionIndex };
    }
  }
  return { code: 108 };
}

/**
 * Wait until any signature in `signatures` is confirmed successfully on-chain.
 * Single-signature path uses `connection.confirmTransaction` (blockhash strategy when applicable).
 */
export async function confirmAnyTransactionSignature(
  connection: Connection,
  signatures: string[],
  options?: ConfirmAnySignatureOptions
): Promise<string> {
  const commitment = options?.commitment ?? 'confirmed';
  const getTxFinality =
    options?.getTransactionCommitment ??
    commitmentToGetTxFinality(commitment);
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;
  const pollsBeforeTx =
    options?.pollsBeforeGetTransaction ?? 10;

  const unique = [...new Set(signatures.filter(Boolean))];
  if (unique.length === 0) {
    throw new TradeError(106, 'No signatures to confirm');
  }
  if (unique.length === 1) {
    const sig = unique[0]!;
    await connection.confirmTransaction(sig, commitment);
    return sig;
  }

  const start = Date.now();
  let pollCount = 0;

  while (Date.now() - start < timeoutMs) {
    pollCount += 1;
    const { value } = await connection.getSignatureStatuses(unique, {
      searchTransactionHistory: true,
    });

    for (let i = 0; i < unique.length; i++) {
      const st = value[i];
      if (!st) continue;
      const c = st.confirmationStatus;
      if (
        st.err == null &&
        (c === 'confirmed' || c === 'finalized')
      ) {
        return unique[i]!;
      }
    }

    let landedIndex: number | undefined;
    for (let i = 0; i < unique.length; i++) {
      if (value[i] != null) {
        landedIndex = i;
        break;
      }
    }

    if (landedIndex === undefined) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    if (pollCount < pollsBeforeTx) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    const landedSig = unique[landedIndex]!;
    let tx: Awaited<ReturnType<Connection['getTransaction']>>;
    try {
      tx = await connection.getTransaction(landedSig, {
        commitment: getTxFinality,
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    if (tx == null || tx.meta == null) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    if (tx.meta.err == null) {
      return landedSig;
    }

    const hints = extractHintsFromLogs(tx.meta.logMessages ?? undefined);
    const parsed = instructionErrorCodeFromMetaErr(tx.meta.err);
    const base = JSON.stringify(tx.meta.err);
    const msg = hints ? `${base} ${hints}` : base;
    throw new TradeError(parsed.code || 108, `${msg} (${landedSig})`);
  }

  throw new TradeError(
    107,
    `Transaction confirmation timed out after ${timeoutMs}ms (${unique.length} signatures polled)`
  );
}
