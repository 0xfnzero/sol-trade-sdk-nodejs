/** Await a task with a cancellable deadline; always release timer/listener ownership. */
export class DeadlineExceededError extends Error {
  constructor() { super('Timeout'); this.name = 'DeadlineExceededError'; }
}

export class ExecutionAbortedError extends Error {
  constructor() { super('Execution cancelled'); this.name = 'AbortError'; }
}

export async function withDeadline<T>(
  task: () => Promise<T>, timeoutMs?: number, signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new ExecutionAbortedError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => reject(new DeadlineExceededError()), timeoutMs);
    }
    if (signal) {
      onAbort = () => reject(new ExecutionAbortedError());
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([task(), interrupted]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal!.removeEventListener('abort', onAbort);
  }
}
