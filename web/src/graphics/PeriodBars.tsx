// The three government periods as ranges of financial years. The charts that use them are
// YearBars, one labelled row per year, gathered under each period's heading.

export type FyPoint = { fy_end: number; value: number; stage?: string | null }

/** Financial years stand in for the periods: each period began in June, two months into a financial year.
 *  `from` and `to` are the years each financial year ends in (2015 is 2014-15). */
export const PERIOD_BANDS = [
  { from: 2015, to: 2019 },
  { from: 2020, to: 2024 },
  { from: 2025, to: 2026 },
]
