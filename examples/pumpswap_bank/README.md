# Offline PumpSwap SBF execution

Use Node.js 20.18 or newer for the pinned development-only LiteSVM/Kit dependencies.
Run the native TypeScript example with the checked-in configuration:

```sh
npx tsx examples/pumpswap_offline_bank.ts
npx vitest run tests/pumpswap_offline_bank.test.ts
```

No RPC, wallet secrets, subprocess simulator or broadcasts are used during replay.
The example signs new V0 transactions from this SDK's `PreparedPumpSwapTrade`.
Direct instruction bytes/accounts are also checked against the public direct
builders. LiteSVM verifies signatures and executes the actual pinned deployed
PumpSwap, fee, Token, Token-2022, AMMv4 and DLMM SBF programs. Program bundle and
individual ELF hashes are checked before loading.

The matrix executes independent buys and sells, static/ALT direct transactions,
and ALT three-leg SOL → USDC → TTWO → target (and reverse) transactions. An
excessive minimum tests program rejection and transaction rollback. Simulation
must leave the bank unchanged; a subsequent successful send must match simulated
post-accounts. Failed sends may charge only the transaction fee. Corrupt signatures
and invalid ALT indexes must fail before program execution. Every case runs again
in a fresh bank and must produce identical signed bytes, logs and final state.

Captured account data and program bytes are unmodified. `snapshot.json.gz` combines
pool/config/mint/vault snapshots from 2026-10-18 with a separately captured global
volume accumulator and execution-only DLMM accounts. `programs.json` records the
2026-10-08/09 program deployments. These are mixed historical captures, **not an
atomic mainnet fork or a fresh mainnet trading quote**. Capture slots and provenance
are retained in the fixture. Synthetic test wallet SOL/token balances fund replay;
user Token-2022 ATAs are initialized through the actual token program, including
required extensions. Direct-test epoch start timestamp is a synthetic zero because
the original direct snapshot did not include a Clock account.

To measure local preparation/signing overhead separately, copy `config.json`, set
`run_bank` to `false`, and set `benchmark_iterations` to a positive integer (maximum
10000). Keep paths relative to the copied config or use absolute paths. File reads,
fixture decompression, program loading and bank execution are excluded from the
reported averages. The numbers describe local CPU work and provide no production
latency or network landing guarantee.
