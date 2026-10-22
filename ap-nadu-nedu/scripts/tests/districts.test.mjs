import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { AP_DISTRICTS, DISTRICT_ALIASES, canonicalDistrict } from '../../src/lib/districts.js'
import { districtSlug, districtPath } from '../../src/lib/routes.js'

/**
 * WHY THIS TEST EXISTS
 *
 * Andhra Pradesh renamed and split its districts in 2022, so one district has
 * several correct names. The register stores whichever one its source document
 * used: a MoSPI table says Tirupathi, a budget annexure says Tirupati, an older
 * road list still says Nellore for a district now called Sri Potti Sriramulu
 * Nellore. None of those is a misspelling.
 *
 * The API folded them from the start. The browser did not, so districtSlug
 * turned seven correct names into seven addresses with no page behind them. 42
 * project pages linked into nothing, and the projects behind those links were
 * missing from the district page a reader would look on.
 *
 * The fix is a second copy of the backend's alias table, and a second copy is
 * a thing that drifts. So the first test here parses the Python and fails if
 * the two ever disagree. Adding a spelling to one side and forgetting the
 * other breaks the build instead of quietly orphaning pages again.
 */

const here = dirname(fileURLToPath(import.meta.url))
const PY = resolve(here, '../../../backend/app/constants/districts.py')

test('the browser knows exactly the districts and spellings the API knows', { skip: !existsSync(PY) && 'backend not checked out beside the frontend' }, () => {
  const py = readFileSync(PY, 'utf8')

  const names = [...py.matchAll(/\{"code": "[^"]+", "name": "([^"]+)"/g)].map(m => m[1])
  assert.equal(names.length, 26, 'the Python list is not 26 districts, so this test is reading it wrong')
  assert.deepEqual([...AP_DISTRICTS].sort(), [...names].sort(),
    'the canonical district list has drifted between the API and the browser')

  const block = py.split('LEGACY_ALIASES: dict[str, str] = {')[1].split('\n}')[0]
  const aliases = {}
  for (const m of block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) aliases[m[1]] = m[2]
  assert.ok(Object.keys(aliases).length > 20, 'the alias block was not parsed')
  assert.deepEqual(DISTRICT_ALIASES, aliases,
    'the alias table has drifted between the API and the browser')
})

test('every spelling in the register resolves to one of the 26 districts', () => {
  // The seven the build warned about, verbatim from the live register.
  const fromTheRegister = {
    Anantapur: 'Ananthapuramu',
    Konaseema: 'Dr. B.R. Ambedkar Konaseema',
    Manyam: 'Parvathipuram Manyam',
    Nellore: 'Sri Potti Sriramulu Nellore',
    'SPS Nellore': 'Sri Potti Sriramulu Nellore',
    'Sri Satya Sai': 'Sri Sathya Sai',
    Tirupathi: 'Tirupati',
  }
  for (const [raw, expected] of Object.entries(fromTheRegister)) {
    assert.equal(canonicalDistrict(raw), expected, `${raw} did not fold onto ${expected}`)
  }
})

test('a canonical name folds onto itself, whatever the case or spacing', () => {
  for (const name of AP_DISTRICTS) {
    assert.equal(canonicalDistrict(name), name, `${name} did not survive a round trip`)
    assert.equal(canonicalDistrict(name.toUpperCase()), name)
    assert.equal(canonicalDistrict(`  ${name}  `), name)
    // A name broken across a line in a scraped PDF.
    assert.equal(canonicalDistrict(name.replace(/ /g, '')), name)
  }
})

test('a name nothing recognises is left alone, not guessed at', () => {
  for (const junk of ['', null, undefined, '   ', 'Ruritania', 'Some Other Place']) {
    assert.equal(canonicalDistrict(junk), null, `it invented a district for ${JSON.stringify(junk)}`)
  }
  // And the slug still carries it, rather than silently sending the reader to
  // the register under a district name that was never theirs.
  assert.equal(districtSlug('Ruritania'), 'ruritania')
})

test('folding never moves a district page that is already published', () => {
  // These addresses are in the sitemap and some are indexed. Folding was meant
  // to add spellings, not to rename pages. If this list ever changes, old URLs
  // break and the indexing work starts over.
  const published = {
    Ananthapuramu: '/districts/ananthapuramu',
    'Dr. B.R. Ambedkar Konaseema': '/districts/dr-b-r-ambedkar-konaseema',
    'Parvathipuram Manyam': '/districts/parvathipuram-manyam',
    'Sri Potti Sriramulu Nellore': '/districts/sri-potti-sriramulu-nellore',
    'Sri Sathya Sai': '/districts/sri-sathya-sai',
    Tirupati: '/districts/tirupati',
    Guntur: '/districts/guntur',
    NTR: '/districts/ntr',
    'YSR Kadapa': '/districts/ysr-kadapa',
  }
  for (const [name, path] of Object.entries(published)) {
    assert.equal(districtPath(name), path, `${name} moved address`)
  }
})

test('every spelling of one district shares one address', () => {
  const byCanonical = new Map()
  for (const raw of [...AP_DISTRICTS, ...Object.keys(DISTRICT_ALIASES)]) {
    const canonical = canonicalDistrict(raw)
    if (!canonical) continue
    const seen = byCanonical.get(canonical)
    const path = districtPath(raw)
    if (seen) assert.equal(path, seen, `${raw} has its own address for ${canonical}`)
    else byCanonical.set(canonical, path)
  }
  assert.equal(byCanonical.size, 26, 'not every district was covered')
})

test('an empty district falls back to the register, not to /districts/', () => {
  for (const empty of ['', null, undefined]) {
    assert.equal(districtPath(empty), '/projects')
  }
})
