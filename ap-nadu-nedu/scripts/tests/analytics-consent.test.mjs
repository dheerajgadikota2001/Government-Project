import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * WHY THIS TEST EXISTS
 *
 * The site ran for weeks with analytics_storage denied everywhere. Nothing
 * failed. No error was logged, no build broke, and Google returned 204 to every
 * single hit. It simply counted none of them, and the property reported that
 * data collection was not active. The only symptom was an empty dashboard,
 * which looks exactly like having no readers.
 *
 * A failure with no signal is precisely what a test has to stand in for. These
 * assertions are the signal.
 *
 * WHY IT READS SOURCE TEXT RATHER THAN RUNNING THE MODULE
 *
 * analytics.js needs window and import.meta.env, neither of which exists under
 * node --test, and standing up a DOM for six assertions costs more than it
 * buys. What needs guarding here is a fact about the source: that the consent
 * defaults still say what we decided they should say.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(resolve(here, '../../src/lib/analytics.js'), 'utf8')

const defaults = [...SRC.matchAll(/gtag\('consent', 'default', \{([\s\S]*?)\}\)/g)].map(m => m[1])

test('there are exactly two consent defaults: one regional, one for everyone else', () => {
  assert.equal(defaults.length, 2)
  assert.equal(defaults.filter(b => b.includes('region:')).length, 1)
  assert.equal(defaults.filter(b => !b.includes('region:')).length, 1)
})

test('readers outside the listed regions are counted, or the reports stay empty', () => {
  const everyoneElse = defaults.find(b => !b.includes('region:'))
  assert.match(everyoneElse, /analytics_storage:\s*'granted'/)
})

test('readers inside the listed regions get no cookie', () => {
  const regional = defaults.find(b => b.includes('region:'))
  assert.match(regional, /analytics_storage:\s*'denied'/)
  assert.match(regional, /region:\s*CONSENT_DENIED_REGIONS/)
})

test('advertising consent is denied in every default, everywhere, always', () => {
  for (const block of defaults)
    for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization'])
      assert.match(block, new RegExp(key + ":\\s*'denied'"))
})

test('the denied regions cover the EEA, the UK and Switzerland, with no duplicates', () => {
  const listed = SRC.match(/const CONSENT_DENIED_REGIONS = \[([\s\S]*?)\]/)
  assert.ok(listed, 'CONSENT_DENIED_REGIONS is missing')
  const codes = [...listed[1].matchAll(/'([A-Z]{2})'/g)].map(m => m[1])
  assert.equal(new Set(codes).size, codes.length, 'duplicate country code')
  const eea = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
               'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
               'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO']
  for (const c of [...eea, 'GB', 'CH']) assert.ok(codes.includes(c), 'missing ' + c)
  assert.equal(codes.length, 32)
})

test("the cookie is kept well short of Google's two year default", () => {
  const m = SRC.match(/cookie_expires:\s*([^,\n]+)/)
  assert.ok(m, 'cookie_expires is not set, so the cookie lasts two years')
  const seconds = Function('"use strict"; return (' + m[1] + ')')()
  assert.ok(seconds > 0 && seconds <= 60 * 60 * 24 * 180, 'cookie_expires is ' + seconds + 's')
})

test('the reader opt out switch still uses the gtag kill switch', () => {
  assert.match(SRC, /window\[`ga-disable-\$\{MEASUREMENT_ID\}`\]/)
})
