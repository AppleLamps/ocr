/** Run async work over a list with a bounded number of in-flight tasks. */

/**
 * Maps `items` through `worker` with at most `limit` tasks running at once,
 * returning results in the original order. A worker rejection stops new tasks
 * from starting and propagates the first error (in-flight tasks are left to
 * settle on their own — cancel them via an AbortSignal inside `worker`).
 *
 * `onResult` fires after each successful item, useful for progress reporting.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult?: (index: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let failed = false

  async function runner(): Promise<void> {
    while (!failed) {
      const current = nextIndex
      nextIndex += 1
      if (current >= items.length) return

      try {
        results[current] = await worker(items[current], current)
      } catch (error) {
        failed = true
        throw error
      }
      onResult?.(current)
    }
  }

  const poolSize = Math.min(Math.max(1, limit), items.length || 1)
  await Promise.all(Array.from({ length: poolSize }, () => runner()))

  return results
}
