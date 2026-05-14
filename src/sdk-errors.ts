/**
 * Shared SDK errors (avoids circular imports with `index` / `swqos`).
 */
export class TradeError extends Error {
  constructor(
    public code: number,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TradeError';
  }
}
