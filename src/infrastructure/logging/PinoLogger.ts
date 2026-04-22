import pino, { type Logger } from "pino";
import type { LoggerPort } from "../../application/ports/outbound/LoggerPort";

export class PinoLogger implements LoggerPort {
  constructor(private readonly logger: Logger = pino()) {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context ?? {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(context ?? {}, message);
  }
}
