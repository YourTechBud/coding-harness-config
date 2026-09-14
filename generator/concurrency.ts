const CONCURRENT_JOBS = 10;

/** Stop taking new jobs on failure, but drain active jobs before rejecting. */
export async function runConcurrent<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!failed && nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        await run(item);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENT_JOBS, items.length) }, () => worker()));
  if (failed) throw firstError;
}
