import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarise, stageOf, spansOf } from '../../src/lib/tenurePicture.js'

const P = (id, spans, status, by = {}) => ({ id, title: `P${id}`, spans, status, by_tenure: by })

test('a project counts under every government it touched', () => {
  const { rows } = summarise([P(1, ['tdp1', 'ysrcp'], 'completed')])
  assert.equal(rows.find(r => r.g === 'tdp1').total, 1)
  assert.equal(rows.find(r => r.g === 'ysrcp').total, 1)
  assert.equal(rows.find(r => r.g === 'tdp2').total, 0)
  assert.equal(rows.find(r => r.g === 'tdp1').spanning, 1)
})

test('rows are counts of projects touched, and never silently sum to the project count', () => {
  const shown = [P(1, ['tdp1', 'ysrcp'], 'completed'), P(2, ['ysrcp'], 'announced'), P(3, ['tdp2'], 'delayed')]
  const { rows } = summarise(shown)
  const sum = rows.reduce((a, r) => a + r.total, 0)
  assert.equal(sum, 4)              // 3 projects, one of them counted twice, by design
  assert.equal(shown.length, 3)
})

test('stage buckets fold every backend status into one of four', () => {
  for (const s of ['announced', 'approved', 'tendered', 'under_construction', 'completed', 'delayed', 'cancelled', 'suspended', 'something_new'])
    assert.ok(['completed', 'building', 'announced', 'stalled'].includes(stageOf(s)), s)
  assert.equal(stageOf('under_construction'), 'building')
  assert.equal(stageOf('cancelled'), 'stalled')
  assert.equal(stageOf(undefined), 'announced')
})

test('a project with no recorded span is treated as current government only', () => {
  assert.deepEqual(spansOf({ spans: [] }), ['tdp2'])
  assert.deepEqual(spansOf({}), ['tdp2'])
  const { rows } = summarise([P(1, [], 'completed')])
  assert.equal(rows.find(r => r.g === 'tdp2').by.completed, 1)
})

test('event share sums by_tenure across all projects, including ones that do not span that term', () => {
  const shown = [P(1, ['ysrcp'], 'completed', { tdp1: 2, ysrcp: 5 }), P(2, ['tdp2'], 'building', { tdp2: 4 })]
  const { rows, totalEvents } = summarise(shown)
  assert.equal(rows.find(r => r.g === 'tdp1').events, 2)
  assert.equal(rows.find(r => r.g === 'ysrcp').events, 5)
  assert.equal(rows.find(r => r.g === 'tdp2').events, 4)
  assert.equal(totalEvents, 11)
})

test('names are capped per stage and max is never zero', () => {
  const shown = Array.from({ length: 6 }, (_, i) => P(i, ['tdp2'], 'completed'))
  const { rows, max } = summarise(shown)
  assert.equal(rows.find(r => r.g === 'tdp2').names.completed.length, 3)
  assert.equal(max, 6)
  assert.equal(summarise([]).max, 1)
})
