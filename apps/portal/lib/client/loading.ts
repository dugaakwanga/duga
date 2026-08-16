let activeCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

// A global "something is loading" counter. Any async operation (API call,
// route navigation) can increment it; the LoadingOverlay stays up — blocking
// clicks — until every operation finishes. This is module-level so it spans
// the whole portal, including the login screens.
export function beginLoading(): void {
  activeCount += 1;
  emit();
}

export function endLoading(): void {
  if (activeCount > 0) activeCount -= 1;
  emit();
}

export function isAnyLoading(): boolean {
  return activeCount > 0;
}

export function subscribeLoading(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}