/**
 * Compute Budget Module for Sol Trade SDK
 *
 * Provides cached compute budget instructions for low-latency transaction building.
 */

export {
  // Constants
  COMPUTE_BUDGET_PROGRAM,
  SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR,
  SET_COMPUTE_UNIT_LIMIT_DISCRIMINATOR,
  // Instruction builders
  setComputeUnitPrice,
  setComputeUnitLimit,
  // Cached functions
  extendComputeBudgetInstructions,
  computeBudgetInstructions,
  // Cache stats
  getCacheStats,
  clearCache,
} from './compute_budget_manager';
