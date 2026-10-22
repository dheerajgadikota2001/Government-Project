import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { DISTRICT_NAMES, placeName, localiseVars } from '../../src/lib/placeNames.js'
import { AP_DISTRICTS, DISTRICT_ALIASES, canonicalDistrict } from '../../src/lib/districts.js'

/**
 * WHY THIS FILE EXISTS
 *
 * Every Telugu sentence on the site printed the district in English, because
 * the name came straight from the register. The table in placeNames.js fixes
 * that for 26 districts, and these tests make sure it stays complete, stays
 * Telugu, and is reached by both translators rather than by whichever call
 * site remembered to ask.
 */

const TELUGU = /^[ఀ-౿ .]+$/

test('every district has exactly one Telugu name, written in Telugu', () => {
  const table = DISTRICT_NAMES.te
  assert.deepEqual(Object.keys(table).sort(), [...AP_DISTRICTS].sort(),
    'the Telugu table and the district list disagree about which districts exist')
  for (const [english, telugu] of Object.entries(table)) {
    assert.match(telugu, TELUGU, `${english} is not written in Telugu script: ${telugu}`)
  }
  assert.equal(new Set(Object.values(table)).size, AP_DISTRICTS.length, 'two districts share a Telugu name')
})

test('a source document\'s own spelling still finds the Telugu name', () => {
  for (const alias of Object.keys(DISTRICT_ALIASES)) {
    const canonical = canonicalDistrict(alias)
    assert.equal(placeName(alias, 'te'), DISTRICT_NAMES.te[canonical], `${alias} does not reach ${canonical}`)
  }
  assert.equal(placeName('Anantapur', 'te'), 'అనంతపురం')
  assert.equal(placeName('  guntur ', 'te'), 'గుంటూరు')
})

test('an unknown name is kept, not dropped, and English is left alone', () => {
  assert.equal(placeName('Ruritania', 'te'), 'Ruritania')
  assert.equal(placeName('Guntur', 'en'), 'Guntur')
  assert.equal(placeName('Anantapur', 'en'), 'Anantapur', 'English prints what the record holds')
  assert.equal(placeName('Guntur', 'hi'), 'Guntur', 'a language with no table prints the record')
  assert.equal(placeName(null, 'te'), null)
})

test('only the district slot is touched, and the caller\'s object is not', () => {
  const vars = { district: 'Guntur', name: 'Guntur Bypass', count: 3 }
  const out = localiseVars(vars, 'te')
  assert.deepEqual(out, { district: 'గుంటూరు', name: 'Guntur Bypass', count: 3 })
  assert.equal(vars.district, 'Guntur')
  assert.equal(localiseVars(vars, 'en'), vars)
  assert.equal(localiseVars(undefined, 'te'), undefined)
})

test('both translators fill {district} through the table', () => {
  const app = readFileSync(new URL('../../src/i18n/index.jsx', import.meta.url), 'utf8')
  const pre = readFileSync(new URL('../prerender.mjs', import.meta.url), 'utf8')
  assert.match(app, /interpolate\(hit, localiseVars\(vars, lang\)\)/,
    'the app translator no longer localises {district}; Telugu pages print English place names again')
  assert.match(pre, /const v = localiseVars\(vars, code\)/,
    'the prerender translator no longer localises {district}')
})
