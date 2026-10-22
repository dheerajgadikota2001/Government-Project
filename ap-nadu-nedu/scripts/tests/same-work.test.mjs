import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SAME_WORK, groupFor, canonicalIdFor, isDuplicate, membersOf, costsDisagree }
  from '../../src/lib/sameWork.js'

/**
 * WHY THIS TEST EXISTS
 *
 * Saying two rows are one dam is a judgement, and a wrong judgement here does
 * the worst thing this platform can do: it takes a real project, with real
 * public money in it, off the public register. So the tests do not check the
 * judgement, which is a human's to make. They check that the mechanism around
 * it cannot lose a project, cannot point two pages at each other, and cannot
 * quietly grow into an automatic title match, which on this register would
 * merge six genuinely different water bodies in Eluru.
 */

test('the register is well formed, whatever is added to it', () => {
  const seen = new Set()
  for (const g of SAME_WORK) {
    assert.ok(Number.isInteger(g.canonical), 'canonical must be a project id')
    assert.ok(Array.isArray(g.also) && g.also.length, 'a group of one is not a group')
    assert.ok(!g.also.includes(g.canonical), 'the canonical cannot also be a duplicate of itself')
    assert.ok(g.why && g.why.length > 20, 'every merge records why, for the reader and for review')
    assert.ok(g.name, 'a merged work needs a name of its own')
    for (const id of [g.canonical, ...g.also]) {
      assert.ok(!seen.has(id), `project ${id} is in two groups, so it has two canonical pages`)
      seen.add(id)
    }
  }
})

test('every member resolves to one page, and that page resolves to itself', () => {
  for (const g of SAME_WORK) {
    for (const id of [g.canonical, ...g.also]) {
      assert.equal(canonicalIdFor(id), g.canonical)
    }
    // The end of the chain. Without this a pair could point at each other and
    // a crawler would follow the canonical round in a circle forever.
    assert.equal(canonicalIdFor(g.canonical), g.canonical)
    assert.equal(isDuplicate(g.canonical), false)
    for (const id of g.also) assert.equal(isDuplicate(id), true)
  }
})

test('a project nobody merged is left completely alone', () => {
  const untouched = 999999
  assert.equal(groupFor(untouched), null)
  assert.equal(canonicalIdFor(untouched), untouched)
  assert.equal(isDuplicate(untouched), false)
  assert.deepEqual(membersOf(untouched), [])
})

test('the canonical page can reach every record of the work, itself first', () => {
  for (const g of SAME_WORK) {
    const members = membersOf(g.canonical)
    assert.equal(members[0], g.canonical, 'the canonical record must lead the table')
    assert.equal(members.length, g.also.length + 1, 'a record went missing from the group')
    // Reached from any member, not just the canonical one, because the
    // duplicate page still shows the reader the same table.
    for (const id of g.also) assert.deepEqual(membersOf(id), members)
  }
})

test('ids are compared as numbers, however they arrive', () => {
  // Project ids come out of the API as numbers and out of a URL as strings.
  for (const g of SAME_WORK) {
    assert.equal(canonicalIdFor(String(g.canonical)), g.canonical)
    assert.equal(isDuplicate(String(g.also[0])), true)
  }
})

test('two sources rounding differently is not a disagreement', () => {
  // Polavaram: 30,437 against 55,549. That is the real one.
  assert.equal(costsDisagree([30437, 55549]), true)
  // The same figure published to different precision is not.
  assert.equal(costsDisagree([1293.0, 1293.4]), false)
  assert.equal(costsDisagree([100, 100]), false)
  // And a missing figure is not a cheaper one. Reading null as zero would put
  // "one publishes ₹0 crore" on a page whose whole claim is that it does not
  // invent numbers.
  assert.equal(costsDisagree([30437, null]), false)
  assert.equal(costsDisagree([30437, 0]), false)
  assert.equal(costsDisagree([30437]), false)
  assert.equal(costsDisagree([]), false)
})
