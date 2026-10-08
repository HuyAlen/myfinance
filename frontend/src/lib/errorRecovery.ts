export type RecoverableAppError = Error & {
  digest?: string;
};

type ErrorLogger = (message: string) => void;

const SAFE_ERROR_REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;

export function getSafeErrorReference(
  error: Pick<RecoverableAppError, "digest">,
): string | null {
  const digest = typeof error.digest === "string" ? error.digest.trim() : "";

  if (!SAFE_ERROR_REFERENCE_PATTERN.test(digest)) {
    return null;
  }

  return digest;
}

export function reportUnexpectedAppError(
  scope: "AppErrorBoundary" | "GlobalErrorBoundary",
  error: Pick<RecoverableAppError, "digest">,
  logger: ErrorLogger = console.error,
) {
  const reference = getSafeErrorReference(error);

  logger(
    reference
      ? `[${scope}] Unexpected runtime error. Reference: ${reference}`
      : `[${scope}] Unexpected runtime error.`,
  );
}