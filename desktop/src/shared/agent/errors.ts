import type { ServiceErrorInfo } from './types';

export class ServiceError extends Error {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  constructor(info: ServiceErrorInfo, options?: ErrorOptions) {
    super(info.message, options);
    this.name = 'ServiceError';
    this.code = info.code;
    this.details = info.details;
  }
}

export function errorInfo(error: unknown): ServiceErrorInfo {
  const info: ServiceErrorInfo =
    error instanceof ServiceError
      ? { message: error.message, code: error.code, details: error.details }
      : {
          message:
            error instanceof Error
              ? error.message
              : 'The request failed. Please try again.',
        };
  if (error instanceof Error && error.cause !== undefined)
    info.details = { ...info.details, cause: describeCause(error.cause) };
  return info;
}

function describeCause(value: unknown, depth = 0): Record<string, unknown> {
  if (!(value instanceof Error))
    return { message: String(value).slice(0, 400) };
  const result: Record<string, unknown> = {
    name: value.name,
    message: value.message.slice(0, 400),
  };
  if ('code' in value && typeof value.code === 'string')
    result.code = value.code;
  if (value.cause !== undefined && depth < 2)
    result.cause = describeCause(value.cause, depth + 1);
  return result;
}

export function interruptedStream(cause?: unknown) {
  return new ServiceError(
    {
      code: 'STREAM_INTERRUPTED',
      message:
        'The connection to the agent service was interrupted. Reload history before continuing.',
    },
    { cause },
  );
}
