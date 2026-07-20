// Load .env into process.env for tests. Next.js does this automatically for
// the app itself, but plain Vitest does not.
import "dotenv/config";

// Extends Vitest's `expect` with jest-dom matchers (used by component tests).
// Harmless for node-environment unit tests.
import "@testing-library/jest-dom/vitest";
