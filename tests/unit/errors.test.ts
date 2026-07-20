import { describe, it, expect } from "vitest";
import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  toSafeError,
} from "@/lib/errors";

describe("domain errors", () => {
  it("carry a code, http status and safe message", () => {
    expect(new AuthorizationError().httpStatus).toBe(403);
    expect(new NotFoundError().httpStatus).toBe(404);
    expect(new ValidationError().httpStatus).toBe(400);
    expect(new RateLimitError().httpStatus).toBe(429);
    expect(new AuthorizationError().code).toBe("FORBIDDEN");
  });

  it("are AppError instances", () => {
    expect(new NotFoundError()).toBeInstanceOf(AppError);
  });
});

describe("toSafeError", () => {
  it("surfaces AppError messages", () => {
    const safe = toSafeError(new NotFoundError("Project not found."));
    expect(safe).toEqual({
      httpStatus: 404,
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  });

  it("never leaks raw / unexpected errors", () => {
    const raw = new Error(
      'duplicate key value violates unique constraint "User_email_key"',
    );
    const safe = toSafeError(raw);
    expect(safe.httpStatus).toBe(500);
    expect(safe.code).toBe("INTERNAL");
    expect(safe.message).toBe("Something went wrong. Please try again.");
    // The raw database detail must not appear in the safe message.
    expect(safe.message).not.toContain("constraint");
  });

  it("handles non-Error throwables", () => {
    expect(toSafeError("boom").httpStatus).toBe(500);
    expect(toSafeError(null).code).toBe("INTERNAL");
  });
});
