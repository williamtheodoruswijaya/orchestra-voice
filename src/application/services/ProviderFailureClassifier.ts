export type MetadataProvider = "youtube" | "spotify" | "unknown";

export type ProviderFailureReason =
  | "quota-exceeded"
  | "account-restricted"
  | "credentials-missing"
  | "rate-limited"
  | "unavailable"
  | "unknown";

export interface ProviderFailure {
  provider: MetadataProvider;
  reason: ProviderFailureReason;
  operation: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
}

export class ProviderFailureError extends Error {
  readonly failure: ProviderFailure;

  constructor(failure: ProviderFailure, options?: ErrorOptions) {
    super(failure.message, options);
    this.name = "ProviderFailureError";
    this.failure = failure;
  }
}

export function isProviderFailureError(
  error: unknown,
): error is ProviderFailureError {
  return error instanceof ProviderFailureError;
}

export function createMissingCredentialsFailure(
  provider: MetadataProvider,
  operation: string,
  envVarNames: string[],
): ProviderFailureError {
  return new ProviderFailureError({
    provider,
    reason: "credentials-missing",
    operation,
    message: `${providerLabel(provider)} ${operation} is unavailable because ${envVarNames.join(
      " or ",
    )} is missing.`,
    retryable: false,
  });
}

export function createProviderHttpFailure(
  provider: MetadataProvider,
  operation: string,
  statusCode: number,
  responseBody: string,
  retryAfterHeader?: string | null,
): ProviderFailureError {
  const reason = classifyHttpFailureReason(provider, statusCode, responseBody);
  const retryAfterMs = parseRetryAfter(retryAfterHeader);

  return new ProviderFailureError({
    provider,
    reason,
    operation,
    statusCode,
    retryAfterMs,
    retryable: reason !== "credentials-missing",
    message: formatProviderFailureMessage(provider, operation, reason),
  });
}

export function classifyProviderFailure(
  error: unknown,
  fallbackProvider: MetadataProvider = "unknown",
  fallbackOperation = "search",
): ProviderFailure {
  if (isProviderFailureError(error)) {
    return error.failure;
  }

  const message =
    error instanceof Error
      ? error.message
      : "The provider request failed for an unknown reason.";
  const statusCode = getHttpStatusCode(message);
  const provider = detectProvider(message) ?? fallbackProvider;
  const reason = statusCode
    ? classifyHttpFailureReason(provider, statusCode, message)
    : classifyTextFailureReason(provider, message);

  return {
    provider,
    reason,
    operation: fallbackOperation,
    statusCode,
    retryable: reason !== "credentials-missing",
    message: formatProviderFailureMessage(provider, fallbackOperation, reason),
  };
}

function classifyHttpFailureReason(
  provider: MetadataProvider,
  statusCode: number,
  responseBody: string,
): ProviderFailureReason {
  const normalized = responseBody.toLowerCase();

  if (statusCode === 401) {
    return "credentials-missing";
  }

  if (statusCode === 403) {
    if (
      provider === "youtube" &&
      (normalized.includes("quotaexceeded") ||
        normalized.includes("daily_limit_exceeded") ||
        normalized.includes("dailylimitexceeded") ||
        normalized.includes("quota"))
    ) {
      return "quota-exceeded";
    }

    if (provider === "spotify") {
      return "account-restricted";
    }

    return "unavailable";
  }

  if (statusCode === 429) {
    return "rate-limited";
  }

  if (statusCode >= 500) {
    return "unavailable";
  }

  return "unknown";
}

function classifyTextFailureReason(
  provider: MetadataProvider,
  message: string,
): ProviderFailureReason {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("missing") ||
    normalized.includes("credential") ||
    normalized.includes("api key")
  ) {
    return "credentials-missing";
  }

  if (
    provider === "youtube" &&
    (normalized.includes("quotaexceeded") ||
      normalized.includes("quota exceeded") ||
      normalized.includes("quota"))
  ) {
    return "quota-exceeded";
  }

  if (
    provider === "spotify" &&
    (normalized.includes("403") ||
      normalized.includes("premium") ||
      normalized.includes("subscription") ||
      normalized.includes("restricted"))
  ) {
    return "account-restricted";
  }

  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "rate-limited";
  }

  return "unknown";
}

function formatProviderFailureMessage(
  provider: MetadataProvider,
  operation: string,
  reason: ProviderFailureReason,
): string {
  const label = providerLabel(provider);

  switch (reason) {
    case "quota-exceeded":
      return `${label} ${operation} is temporarily unavailable because the provider quota has been exhausted.`;
    case "account-restricted":
      return `${label} ${operation} is temporarily unavailable because the account, subscription, or market rejected the request.`;
    case "credentials-missing":
      return `${label} ${operation} is unavailable because provider credentials are missing or invalid.`;
    case "rate-limited":
      return `${label} ${operation} is temporarily rate limited.`;
    case "unavailable":
      return `${label} ${operation} is temporarily unavailable.`;
    case "unknown":
      return `${label} ${operation} failed for an unclassified provider reason.`;
  }
}

function providerLabel(provider: MetadataProvider): string {
  if (provider === "youtube") return "YouTube";
  if (provider === "spotify") return "Spotify";
  return "The metadata provider";
}

function detectProvider(message: string): MetadataProvider | undefined {
  const normalized = message.toLowerCase();

  if (normalized.includes("youtube")) return "youtube";
  if (normalized.includes("spotify")) return "spotify";

  return undefined;
}

function getHttpStatusCode(message: string): number | undefined {
  const match = /HTTP\s+(\d{3})/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

function parseRetryAfter(value?: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}
