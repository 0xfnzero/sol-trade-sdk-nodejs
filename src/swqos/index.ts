/**
 * SWQOS module exports
 *
 * clients.ts  - Primary implementation matching Rust SDK (used by ClientFactory)
 * providers.ts - Extended provider implementations with stats/rate-limiting (SwqosManager)
 *
 * To avoid naming conflicts the provider classes from providers.ts are re-exported
 * with a "Provider" suffix alias.
 */

// ===== Primary clients (clients.ts) =====
export * from './clients';

// ===== Extended providers (providers.ts) =====
// Re-export enums and types that are unique to providers.ts
export { MevProtectionLevel } from './providers';
export type {
  TransactionResult,
  ClientStats,
} from './providers';

// Re-export the provider-specific SwqosConfig interface as ProvidersSwqosConfig
export type { SwqosConfig as ProvidersSwqosConfig } from './providers';

// Re-export provider classes with "Provider" suffix to avoid conflicts with clients.ts
export {
  SwqosClient as SwqosProviderClient,
  SwqosClientFactory,
  SwqosManager,
  JitoClient as JitoProvider,
  BloxrouteClient as BloxrouteProvider,
  ZeroSlotClient as ZeroSlotProvider,
  NextBlockClient as NextBlockProvider,
  TemporalClient as TemporalProvider,
  Node1Client as Node1Provider,
  FlashBlockClient as FlashBlockProvider,
  BlockRazorClient as BlockRazorProvider,
  AstralaneClient as AstralaneProvider,
  StelliumClient as StelliumProvider,
  LightspeedClient as LightspeedProvider,
  HeliusClient as HeliusProvider,
  DefaultClient as DefaultProvider,
  SoyasClient as SoyasProvider,
  SpeedlandingClient as SpeedlandingProvider,
  TritonClient,
  QuickNodeClient,
  SyndicaClient,
  FigmentClient,
  AlchemyClient,
} from './providers';
