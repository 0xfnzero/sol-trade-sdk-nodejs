/** gRPC continuity gate. Validation uses subscribed/cold state; never fetches RPC. */
export type CacheReadinessState = "initializing" | "ready" | "continuity-broken" | "recovering";
export class CacheNotReadyError extends Error {
  readonly code = "CACHE_NOT_READY";
  constructor(readonly state: CacheReadinessState, readonly generation: bigint, readonly missingAccounts: readonly string[], reason?: string) {
    super(reason ?? `Cache is ${state}; revalidate required accounts`);
  }
}
export class SubscriptionReadiness {
  private currentState: CacheReadinessState = "initializing";
  private currentGeneration = 0n;
  private validated = new Set<string>();
  private reason?: string;
  private readonly required: Set<string>;
  constructor(private forkId: string, requiredAccounts: Iterable<string>) {
    this.required = new Set(requiredAccounts);
    if (!forkId || !this.required.size || [...this.required].some(k => !k)) throw Error("Provide selected fork and required account identities");
  }
  status() { return {state: this.currentState, generation: this.currentGeneration, forkId: this.forkId, missingAccounts: [...this.required].filter(k => !this.validated.has(k)), reason: this.reason}; }
  interrupt(reason: string) {
    this.currentGeneration++; this.validated.clear(); this.reason = reason; this.currentState = "continuity-broken";
  }
  beginRecovery(forkId: string) {
    if (!forkId) throw Error("Select a fork explicitly");
    this.currentGeneration++; this.forkId = forkId; this.validated.clear(); this.reason = undefined; this.currentState = "recovering";
    return this.currentGeneration;
  }
  requireAccounts(keys: Iterable<string>) {
    const additions = [...keys];
    if (additions.some(k => !k)) throw Error("Missing required account identity");
    if (additions.some(k => !this.required.has(k))) {
      this.currentGeneration++; this.validated.clear();
      // Dependency discovery must not lift a disconnected/fork-conflicted gate.
      if (this.currentState !== "continuity-broken") this.currentState = "recovering";
      for (const k of additions) this.required.add(k);
    }
    return this.currentGeneration;
  }
  markValidated(keys: Iterable<string>, generation: bigint, forkId: string): boolean {
    if (generation !== this.currentGeneration || forkId !== this.forkId || this.currentState === "continuity-broken") return false;
    for (const key of keys) if (this.required.has(key)) this.validated.add(key);
    if (this.validated.size === this.required.size) this.currentState = "ready";
    return this.currentState === "ready";
  }
  guard(): () => void {
    const generation = this.currentGeneration;
    const check = () => {
      if (this.currentState === "ready" && generation === this.currentGeneration) return;
      const status = this.status();
      throw new CacheNotReadyError(status.state, status.generation, status.missingAccounts, this.reason ?? "Frozen cache continuity changed");
    };
    check();
    return check;
  }
}
