import type { ServiceErrorInfo } from './types';

export class ServiceError extends Error {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  constructor(info: ServiceErrorInfo) {
    super(info.message);
    this.name = 'ServiceError';
    this.code = info.code;
    this.details = info.details;
  }
}

export function errorInfo(error: unknown): ServiceErrorInfo {
  return error instanceof ServiceError
    ? { message: error.message, code: error.code, details: error.details }
    : {
        message:
          error instanceof Error
            ? error.message
            : 'The request failed. Please try again.',
      };
}
