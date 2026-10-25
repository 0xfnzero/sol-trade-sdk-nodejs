/** Execution policy is independent of the Pump.fun single-trade version. No RPC. */
import {PublicKey, type TransactionInstruction} from '@solana/web3.js';
import {derivePumpMultiHopAccounts, type PumpMultiHop} from './pump_compact_accounts';
import {buildPumpAmmMultiHopSwapInstruction} from './pump_upgrade';
import {TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID} from '../common/spl-token';

export enum PumpRouteExecution { Auto = 'auto', Official = 'official', Sequential = 'sequential' }
export interface PumpRouteOptions {
  execution?: PumpRouteExecution;
  /** Fresh final recipient credit; sequential per-hop quotes are not official quotes. */
  minimumOutputAmount?: bigint;
  /** Recipient wallet from the current PumpSwap GlobalConfig. */
  buybackRecipient?: PublicKey;
}

/** Undefined selects existing sequential execution. No retry after simulation/submission. */
export function selectPumpRoute(options: PumpRouteOptions, user: PublicKey, input: PublicKey,
  output: PublicKey, amount: bigint, hops?: readonly PumpMultiHop[]): TransactionInstruction | undefined {
  const execution = options.execution ?? PumpRouteExecution.Auto;
  if (!Object.values(PumpRouteExecution).includes(execution)) throw Error('Unknown Pump route execution');
  const positive = (n: bigint) => typeof n === 'bigint' && n > 0n && n < 1n << 64n;
  if (!positive(amount)) throw Error('Pump route input must be a positive u64');
  if (execution === PumpRouteExecution.Sequential) return undefined;
  if (options.minimumOutputAmount !== undefined && !positive(options.minimumOutputAmount)) throw Error('Official Pump route minimum must be a positive u64');
  if (options.buybackRecipient?.equals(PublicKey.default)) throw Error('Missing Pump buyback recipient');
  if (execution === PumpRouteExecution.Auto && (!hops || hops.length < 2 || hops.length > 3
      || options.minimumOutputAmount === undefined || options.buybackRecipient === undefined)) return undefined;
  try {
    if (!hops || hops.length < 2 || hops.length > 3) throw Error('Official Pump routes require two or three supported hops');
    if (!options.minimumOutputAmount || !options.buybackRecipient) throw Error('Provide an official final minimum and current buyback recipient');
    if (user.equals(PublicKey.default) || input.equals(output)) throw Error('Invalid Pump route endpoints');
    const seen = new Set([input.toBase58()]);
    let current = input, previous: PublicKey | undefined;
    for (const h of hops) {
      for (const p of [h.baseTokenProgram, h.quoteTokenProgram])
        if (!p.equals(TOKEN_PROGRAM_ID) && !p.equals(TOKEN_2022_PROGRAM_ID)) throw Error('Unknown Pump route token program');
      const buy = current.equals(h.quoteMint);
      if (!buy && !current.equals(h.baseMint)) throw Error('Disconnected Pump route');
      const next = buy ? h.baseMint : h.quoteMint;
      const p = buy ? h.quoteTokenProgram : h.baseTokenProgram;
      if (previous && !previous.equals(p)) throw Error('Inconsistent intermediate token program');
      if (seen.has(next.toBase58())) throw Error('Pump route contains an asset cycle');
      seen.add(next.toBase58());
      if ([h.address,h.baseVault,h.quoteVault].some(k => k.equals(PublicKey.default)) || h.baseVault.equals(h.quoteVault)) throw Error('Incomplete Pump route venue');
      current = next; previous = buy ? h.baseTokenProgram : h.quoteTokenProgram;
    }
    const {accounts,remaining} = derivePumpMultiHopAccounts(user,input,output,options.buybackRecipient,hops);
    return buildPumpAmmMultiHopSwapInstruction(accounts,amount,options.minimumOutputAmount,remaining);
  } catch (error) {
    if (execution === PumpRouteExecution.Auto) return undefined;
    throw error;
  }
}
