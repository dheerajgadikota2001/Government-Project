import { test } from 'node:test'
import assert from 'node:assert/strict'

import { displayTitle, isShouting, splitSuspects, ACRONYMS, SMALL_WORDS }
  from '../../src/lib/projectTitle.js'

/**
 * WHY THIS TEST EXISTS
 *
 * This function rewrites the h1 and the <title> of 900 pages, and the <title>
 * is what a search result shows. A casing rule that quietly drops a letter,
 * reorders a place name or lower cases NH-16 into nh-16 would put a wrong
 * government record in front of every reader, on every one of those pages, and
 * look like a styling change in the diff.
 *
 * So the first test here is not about capitals at all. It is that the letters
 * coming out are the letters that went in.
 */

const REAL = [
  'POLAVARAM IRRIGATION PROJECT',
  'PEDDAPURAM WATER SUPPLY IMPROVEME NTS PROJECT',
  'APTIDCO - PROVIDING WATER SUPPLY FACILITY AT KAKINADA ULB IN EAST GODA VARI',
  '6L ACCESS CONTROLLED GREENFIELD HIGHWAY FROM CHANDRASEKHARAPURAM (CH. 228+000) TO POLAVARAM (CH. 260+000) OF NH-16',
  'AUGMENTATION OF DRINKING WATER SUPPLY IN SRIKAKULAM MUNICIPAL CORPORAT',
  '4 LANING WITH PAVED SHOULDERS FROM GOOTY TO KURNOOL PKG-III',
  'REJUVENATION OF WATER BODIES (NEELATI CHERUVU) IN GVMC',
  'Rejuvenation of water bodies (Pirangula Dibba) — Eluru',
  'Polavaram Irrigation Project (Phase 1)',
  'APTIDCO- Providing Water Supply Facilities at Kondlapudi and Venkateshwa rapuram in Nellore District',
]

test('nothing but case ever changes', () => {
  // The guarantee that makes this safe to run over the whole register: same
  // characters, same order, same length. Only their case may differ.
  for (const t of REAL) {
    const out = displayTitle(t)
    assert.equal(out.length, t.length, `length changed: ${t}`)
    assert.equal(out.toLowerCase(), t.toLowerCase(), `letters changed: ${t}`)
  }
})

test('a title that is already written properly is returned untouched', () => {
  // Character for character. A parser that "improves" a correct title is a
  // parser that will eventually mangle one.
  for (const t of [
    'Rejuvenation of water bodies (Pirangula Dibba) — Eluru',
    'Polavaram Irrigation Project (Phase 1)',
    'Improvement of Pedda cheruvu at Bhavani nagar in 27th Ward — Piduguralla',
  ]) {
    assert.equal(displayTitle(t), t)
    assert.equal(isShouting(t), false)
  }
})

test('capitals become a title a person would write', () => {
  assert.equal(displayTitle('POLAVARAM IRRIGATION PROJECT'), 'Polavaram Irrigation Project')
  assert.equal(
    displayTitle('AUGMENTATION OF DRINKING WATER SUPPLY IN SRIKAKULAM'),
    'Augmentation of Drinking Water Supply in Srikakulam')
})

test('a small word keeps its capital when the title starts with it', () => {
  assert.equal(displayTitle('THE KAVERI LINK CANAL WORKS'), 'The Kaveri Link Canal Works')
  assert.equal(displayTitle('IN SITU WATER TREATMENT WORKS'), 'In Situ Water Treatment Works')
})

test('acronyms and notation keep their capitals', () => {
  // These are strings, not words. Lower casing NH-16 or ULB makes the title
  // wrong, not merely differently styled.
  assert.equal(displayTitle('WATER SUPPLY AT KAKINADA ULB ON NH-16 BY GVMC'),
    'Water Supply at Kakinada ULB on NH-16 by GVMC')
  assert.equal(displayTitle('APTIDCO AND AMRUT WORKS'), 'APTIDCO and AMRUT Works')
  assert.equal(displayTitle('4 LANING FROM GOOTY (CH. 12+400) TO KURNOOL'),
    '4 Laning from Gooty (CH. 12+400) to Kurnool')
})

test('a package or phase number stays a number, in either alphabet', () => {
  assert.equal(displayTitle('PKG-III PHASE-II KURNOOL-IV SECTION'),
    'PKG-III Phase-II Kurnool-IV Section')
  assert.equal(displayTitle('PACKAGE-I OF THE BYPASS'), 'Package-I of the Bypass')
})

test('two names joined by punctuation each get their own answer', () => {
  assert.equal(displayTitle('VIJAYAWADA-GUDUR AND KURNOOL/KADAPA AND B.KOTHAPALLI'),
    'Vijayawada-Gudur and Kurnool/Kadapa and B.Kothapalli')
  assert.equal(displayTitle('TN/AP BORDER TO THATCHUR'), 'TN/AP Border to Thatchur')
})

test('anything holding a digit is left exactly as it arrived', () => {
  // 6L, 228+000, NH-16 and the chainage notation are how the source document
  // identifies a stretch of road. Casing notation gains nothing and can only
  // make a reference wrong.
  for (const t of ['6L HIGHWAY', 'SECTION 228+000 WORKS', 'THE 27TH WARD WORKS']) {
    const out = displayTitle(t)
    for (const tok of t.split(/\s+/).filter(w => /\d/.test(w))) {
      assert.ok(out.includes(tok), `${tok} was altered in "${out}"`)
    }
  }
})

test('a word the PDF broke in half is not guessed at', () => {
  // The register really holds these. Repairing them needs a dictionary to
  // check the join against, and without one every repair is a guess at what a
  // government document said. A guessed word is the same class of error here
  // as a guessed number, so it comes out as it went in, only cased.
  assert.equal(displayTitle('PEDDAPURAM WATER SUPPLY IMPROVEME NTS PROJECT'),
    'Peddapuram Water Supply Improveme Nts Project')
  assert.equal(displayTitle('KAKINADA ULB IN EAST GODA VARI'), 'Kakinada ULB in East Goda Vari')
})

test('empty, missing and one-word input do not throw', () => {
  for (const t of ['', null, undefined, 'WATER', '   ', '4']) {
    assert.doesNotThrow(() => displayTitle(t))
  }
  assert.equal(displayTitle(null), '')
  assert.equal(displayTitle(undefined), '')
  // Too short to judge. A three letter title is left alone rather than guessed.
  assert.equal(isShouting('NH'), false)
})

test('the two word lists cannot overlap', () => {
  // An entry in both would make its casing depend on which check runs first,
  // which is the kind of rule that behaves differently on two pages.
  for (const w of SMALL_WORDS) {
    assert.ok(!ACRONYMS.has(w.toUpperCase()),
      `"${w}" is both an acronym and a small word`)
  }
  // And nothing in the acronym list is an ordinary English word, because
  // keeping those shouting costs more than title casing them.
  for (const a of ['NO', 'IT', 'CC', 'BT', 'AS', 'IN', 'ON', 'AT', 'OF', 'TO']) {
    assert.ok(!ACRONYMS.has(a), `"${a}" is an ordinary word and must not be an acronym`)
  }
})

/**
 * The torn-word report is a review list, not a verdict, and the failure that
 * matters for it is crying wolf. A warning that fires on 219 titles, most of
 * them fine, is a warning nobody reads, which is the same as no warning at all.
 */
test('a short common word after a long one is not a torn word', () => {
  // The first version of this flagged all of these. "ROAD" and "PORT" are not
  // fragments; they are words, and the register is full of them.
  const register = [
    'GREENFIELD BYPASS ROAD AT GUNTUR',
    'CHENNAI CROSS ROAD WIDENING',
    'DEDICATED PORT CONNECTIVITY AT KRISHNAPATNAM',
    'NAIDUPETA BYPASS ROAD PACKAGE',
    'KAKINADA PORT ROAD WORKS',
    'MACHERLA BYPASS ROAD SECTION',
  ]
  assert.deepEqual(splitSuspects(register), [])
})

test('a fragment that appears once, right after a long word, is reported', () => {
  const register = [
    'PEDDAPURAM WATER SUPPLY IMPROVEME NTS PROJECT',
    'KAKINADA WATER SUPPLY IMPROVEMENT PROJECT',
    'ELURU WATER SUPPLY IMPROVEMENT PROJECT',
    'GUNTUR WATER SUPPLY IMPROVEMENT PROJECT',
  ]
  const found = splitSuspects(register)
  assert.equal(found.length, 1)
  assert.equal(found[0].at, 'IMPROVEME NTS')
})

test('notation is never reported as a torn word', () => {
  // Brackets, hyphens and dots mean the source is naming a package or a
  // chainage, not losing half a word.
  const register = [
    'HIGHWAY WIDENING (PHASE-II PKG-I) AT KURNOOL',
    'PIPELINE AT CSPURAM I.E. ZONE',
    'SECTION FROM CHAINAGE 228+000 TO 260+000',
    'GREENFIELD HIGHWAY NH-16 SECTION',
  ]
  assert.deepEqual(splitSuspects(register), [])
})

test('units, acronyms and numerals are never reported', () => {
  const register = [
    'SUBSTATION AT NAIDUPETA 220 KV WORKS',
    'DISTRIBUTION NETWORK AT KAKINADA ULB',
    'HIGHWAY WIDENING PACKAGE III AT GUNTUR',
    'AUGMENTATION BY GVMC AT VISAKHAPATNAM',
  ]
  assert.deepEqual(splitSuspects(register), [])
})

test('the report says which title, so it can be reviewed by a person', () => {
  const found = splitSuspects(['PEDDAPURAM WATER SUPPLY IMPROVEME NTS PROJECT'])
  assert.equal(found.length, 1)
  assert.equal(found[0].title, 'PEDDAPURAM WATER SUPPLY IMPROVEME NTS PROJECT')
  assert.ok(found[0].at.includes('NTS'))
})

test('an empty or one-title register does not throw', () => {
  assert.deepEqual(splitSuspects([]), [])
  assert.doesNotThrow(() => splitSuspects([null, undefined, '', 'WATER']))
})
