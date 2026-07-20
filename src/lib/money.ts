/**
 * Money helpers. BDT is stored as integer **paisa** (1 taka = 100 paisa) using
 * `bigint`. Never use floating-point for money.
 *
 * Parsing is strict: at most two decimal places, no sign, no scientific
 * notation. This deliberately rejects imprecise float inputs (e.g. the string
 * form of 0.1 + 0.2) so a bad amount fails loudly instead of silently rounding.
 */

export const PAISA_PER_TAKA = 100n;

export class InvalidMoneyError extends Error {
  constructor(value: unknown) {
    super(`Invalid BDT amount: ${JSON.stringify(value)}`);
    this.name = "InvalidMoneyError";
  }
}

const TAKA_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Convert a taka amount (string like "12.50", or a number like 12.5) to paisa.
 * Throws `InvalidMoneyError` for anything that is not a non-negative amount
 * with at most two decimal places.
 */
export function takaToPaisa(input: string | number): bigint {
  const str = typeof input === "string" ? input.trim() : String(input);
  if (!TAKA_PATTERN.test(str)) {
    throw new InvalidMoneyError(input);
  }
  const [whole, frac = ""] = str.split(".");
  const fracPaisa = (frac + "00").slice(0, 2);
  return BigInt(whole) * PAISA_PER_TAKA + BigInt(fracPaisa);
}

/** Absolute value of a paisa amount. */
export function absPaisa(paisa: bigint): bigint {
  return paisa < 0n ? -paisa : paisa;
}

/** Sum a list of paisa amounts. */
export function sumPaisa(amounts: readonly bigint[]): bigint {
  return amounts.reduce((acc, n) => acc + n, 0n);
}

/**
 * Format paisa as a plain decimal string with exactly two decimals,
 * e.g. 1250n -> "12.50", 1n -> "0.01", -7500n -> "-75.00".
 */
export function paisaToDecimalString(paisa: bigint): string {
  const negative = paisa < 0n;
  const abs = absPaisa(paisa);
  const whole = abs / PAISA_PER_TAKA;
  const frac = abs % PAISA_PER_TAKA;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Format paisa as a display string with the BDT sign and thousands separators,
 * e.g. 1234567n -> "৳12,345.67", -2500n -> "-৳25.00".
 */
export function formatBdt(paisa: bigint): string {
  const decimal = paisaToDecimalString(paisa);
  const negative = decimal.startsWith("-");
  const unsigned = negative ? decimal.slice(1) : decimal;
  const [whole, frac] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}৳${grouped}.${frac}`;
}
