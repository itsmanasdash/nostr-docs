export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort|superseded/i.test(error.message))
  );
}
