import type {
  MetadataProvider,
  ProviderFailure,
  ProviderFailureReason,
} from "./ProviderFailureClassifier";

type Clock = () => number;

export interface ProviderCooldownOptions {
  clock?: Clock;
  logSuppressionMs?: number;
  cooldownByReasonMs?: Partial<Record<ProviderFailureReason, number>>;
}

export interface ProviderCooldownStatus {
  provider: MetadataProvider;
  failureReason: ProviderFailureReason;
  retryAfterMs: number;
  message: string;
}

export interface ProviderFailureRegistration {
  failure: ProviderFailure;
  cooldownUntil: number;
  shouldLog: boolean;
}

interface ProviderCooldownEntry {
  failure: ProviderFailure;
  cooldownUntil: number;
}

const DEFAULT_COOLDOWN_BY_REASON_MS: Record<ProviderFailureReason, number> = {
  "quota-exceeded": 60 * 60 * 1000,
  "account-restricted": 30 * 60 * 1000,
  "credentials-missing": 5 * 60 * 1000,
  "rate-limited": 60 * 1000,
  unavailable: 5 * 60 * 1000,
  unknown: 60 * 1000,
};

export class ProviderCooldownService {
  private readonly clock: Clock;
  private readonly logSuppressionMs: number;
  private readonly cooldownByReasonMs: Record<ProviderFailureReason, number>;
  private readonly cooldowns = new Map<MetadataProvider, ProviderCooldownEntry>();
  private readonly logSuppressions = new Map<string, number>();

  constructor(options: ProviderCooldownOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.logSuppressionMs = options.logSuppressionMs ?? 5 * 60 * 1000;
    this.cooldownByReasonMs = {
      ...DEFAULT_COOLDOWN_BY_REASON_MS,
      ...options.cooldownByReasonMs,
    };
  }

  getCooldown(provider: MetadataProvider): ProviderCooldownStatus | undefined {
    const entry = this.cooldowns.get(provider);

    if (!entry) return undefined;

    const now = this.clock();

    if (now >= entry.cooldownUntil) {
      this.cooldowns.delete(provider);
      return undefined;
    }

    return {
      provider,
      failureReason: entry.failure.reason,
      retryAfterMs: entry.cooldownUntil - now,
      message: entry.failure.message,
    };
  }

  recordFailure(failure: ProviderFailure): ProviderFailureRegistration {
    const now = this.clock();
    const cooldownMs = Math.max(
      failure.retryAfterMs ?? 0,
      this.cooldownByReasonMs[failure.reason],
    );
    const cooldownUntil = now + cooldownMs;

    this.cooldowns.set(failure.provider, {
      failure,
      cooldownUntil,
    });

    const logKey = this.getLogKey(failure);
    const suppressedUntil = this.logSuppressions.get(logKey) ?? 0;
    const shouldLog = now >= suppressedUntil;

    if (shouldLog) {
      this.logSuppressions.set(
        logKey,
        now + Math.max(cooldownMs, this.logSuppressionMs),
      );
    }

    return {
      failure,
      cooldownUntil,
      shouldLog,
    };
  }

  recordSuccess(provider: MetadataProvider): void {
    this.cooldowns.delete(provider);
  }

  private getLogKey(failure: ProviderFailure): string {
    return `${failure.provider}:${failure.operation}:${failure.reason}`;
  }
}
