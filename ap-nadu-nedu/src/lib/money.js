/**
 * How a rupee figure in crore is written, everywhere it is written.
 *
 * WHY THIS FILE EXISTS
 *
 * Every amount on the site went through Math.round, which is right for
 * ₹55,548.87 crore and wrong for ₹2.82 crore. The register is mostly small
 * municipal schemes, so the wrong case is the common one: a real ₹2.82 crore
 * sewerage network was printed as "₹3 crore". Six per cent, on a page whose
 * only claim is that the figure has not been moved.
 *
 * It also has to be one rule rather than two. The summary paragraph and the
 * tile directly beneath it read the same field, so a rounding rule that lives
 * in two files eventually prints ₹2.82 crore in the sentence and ₹3 Cr in the
 * box, on the same screen, about the same number.
 */

/**
 * Below a hundred crore the decimals are the figure. Above it they are noise
 * that makes a large number harder to read. Trailing zeros are dropped, so a
 * flat ₹12 crore is not dressed up as "₹12.00 crore".
 *
 * @param value   amount in crore
 * @param fmtNum  Indian digit grouping. Defaults to what every caller passed.
 * @returns string, with no currency symbol and no unit
 */
export function croreAmount(value, fmtNum = n => Number(n).toLocaleString('en-IN')) {
  // Number(null) is 0 and Number('') is 0, so a Number.isFinite check alone
  // turns "no figure on record" into "₹0 crore". Both callers happen to guard
  // for null already, but a money formatter that can invent a zero is a loaded
  // gun on a site whose whole argument is that it does not invent figures.
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (Math.abs(n) >= 100) return fmtNum(Math.round(n))
  return fmtNum(Number(n.toFixed(2)))
}
