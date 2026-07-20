/**
 * Typed domain errors + a safe mapper.
 *
 * Rule: raw database / unexpected errors must NEVER reach the user. Only
 * `AppError` instances carry a user-safe message; anything else is mapped to a
 * generic 500 message. See docs/SECURITY.md §9.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  /** User-facing message safe to display. */
  readonly safeMessage: string;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    safeMessage: string,
    options?: { cause?: unknown },
  ) {
    super(safeMessage, options);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.safeMessage = safeMessage;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "You must be signed in.", cause?: unknown) {
    super("UNAUTHENTICATED", 401, message, { cause });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to do that.", cause?: unknown) {
    super("FORBIDDEN", 403, message, { cause });
  }
}

/** Use for both "does not exist" and "exists but caller can't see it" (IDOR). */
export class NotFoundError extends AppError {
  constructor(message = "Not found.", cause?: unknown) {
    super("NOT_FOUND", 404, message, { cause });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check your input.", cause?: unknown) {
    super("VALIDATION", 400, message, { cause });
  }
}

export class ConflictError extends AppError {
  constructor(message = "That action conflicts with the current state.", cause?: unknown) {
    super("CONFLICT", 409, message, { cause });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please slow down.", cause?: unknown) {
    super("RATE_LIMITED", 429, message, { cause });
  }
}

export interface SafeErrorShape {
  httpStatus: number;
  code: ErrorCode;
  message: string;
}

const GENERIC_INTERNAL: SafeErrorShape = {
  httpStatus: 500,
  code: "INTERNAL",
  message: "Something went wrong. Please try again.",
};

/**
 * Convert any thrown value into a user-safe shape. Only `AppError` messages are
 * surfaced; everything else (DB errors, bugs) becomes a generic 500 so internals
 * never leak.
 */
export function toSafeError(err: unknown): SafeErrorShape {
  if (err instanceof AppError) {
    return { httpStatus: err.httpStatus, code: err.code, message: err.safeMessage };
  }
  return GENERIC_INTERNAL;
}
