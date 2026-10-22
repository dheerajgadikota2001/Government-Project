// Written by scripts/make_posters.py. Do not edit by hand.
export const POSTER_REV = 1
/** Fingerprint of the scene code the pictures were drawn from; test:posters fails when the code has moved on. */
export const POSTER_SCENES = '8c5c30d9f133'
/** w<work id> -> the printed share its pictures show ('plan' when the work has none). The w keeps the
 *  order as written: JavaScript sorts number-like keys, and the first entry is the one Home shows first. */
export const POSTERS: Record<string, string> = {
  w613: '86.2',
  w2: '100',
  w3: 'plan',
  w4: 'plan',
  w5: 'plan',
  w6: 'plan',
  w7: 'plan',
  w8: 'plan',
  w519: '97',
  w528: '34.5',
  w531: '2',
  w619: '0.27',
  w622: '75',
  w627: '89.76',
  w628: '95',
}
