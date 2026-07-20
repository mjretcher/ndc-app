/** All monetary values are integer cents. Never floats. */

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem.toString().padStart(2, "0")}`;
}

/** Parse a user-entered dollar string ("110", "110.5", "$1,100.00") into cents. Throws on invalid input. */
export function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid dollar amount: ${input}`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
  return negative ? -cents : cents;
}

/** Apply a whole-number percentage discount, rounding half up on the cent. */
export function percentOfCents(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/**
 * Split a seasonal total evenly across N installments.
 * Distributes remainder cents to the earliest installments so the sum is exact.
 * e.g. 55000 over 4 months -> [13750, 13750, 13750, 13750]
 *      10000 over 3 months -> [3334, 3333, 3333]
 */
export function splitEvenCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) throw new Error("parts must be positive");
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Plain "123.45" string (no $ or commas) for CSV cells. */
export function centsToDollarString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
