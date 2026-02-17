import { describe, expect, it } from 'vitest'

import { canonicalize } from './index'

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[target]
    result[target] = current
  }

  return result
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 1_831_565_813
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function buildObjectFromEntries(
  entries: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  entries.forEach(([key, value]) => {
    result[key] = value
  })

  return result
}

describe('fixture-inspired-property-tests', () => {
  it('arrays-object-key-canonicalization-inside-arrays-is-permutation-invariant', () => {
    const entries = [
      ['d', true],
      ['10', null],
      ['1', []],
    ] as const
    const random = createRandom(424_242)

    const baseline = canonicalize([56, buildObjectFromEntries(entries)])

    for (let index = 0; index < 30; index += 1) {
      const candidate = canonicalize([56, buildObjectFromEntries(shuffle(entries, random))])
      expect(candidate).toEqual(baseline)
    }
  })

  it('french-key-ordering-follows-code-unit-sort-not-locale-collation', () => {
    const entries = [
      ['peach', 'This sorting order'],
      ['péché', 'is wrong according to French'],
      ['pêche', 'but canonicalization MUST'],
      ['sin', 'ignore locale'],
    ] as const

    const random = createRandom(20_260_217)
    const expectedKeyOrder = ['peach', 'péché', 'pêche', 'sin']

    for (let index = 0; index < 20; index += 1) {
      const input = buildObjectFromEntries(shuffle(entries, random))
      const output = canonicalize(input)
      const keys = Object.keys(JSON.parse(output ?? '{}') as Record<string, unknown>)
      expect(keys).toEqual(expectedKeyOrder)
    }
  })

  it('structures-canonicalization-recursively-sorts-nested-object-keys', () => {
    const input = {
      other: [
        {
          e: 'yes',
          E: 'no',
        },
      ],
      root: {
        '\n': 56,
        'f': { f: 'hi', F: 5 },
      },
    }

    const output = canonicalize(input)
    const parsed = JSON.parse(output ?? '{}') as {
      other: Array<{ e: string; E: string }>
      root: { '\n': number; 'f': { f: string; F: number } }
    }

    expect(Object.keys(parsed.root)).toEqual(['\n', 'f'])
    expect(Object.keys(parsed.root.f)).toEqual(['F', 'f'])
    expect(Object.keys(parsed.other[0])).toEqual(['E', 'e'])
  })

  it('unicode-canonicalization-preserves-unnormalized-string-values', () => {
    const value = 'A\u030a'
    const output = canonicalize({ Unnormalized: value })
    const parsed = JSON.parse(output ?? '{}') as { Unnormalized: string }

    expect(parsed.Unnormalized).toEqual(value)
    expect(parsed.Unnormalized).not.toEqual(value.normalize('NFC'))
  })

  it('values-numeric-and-string-payload-semantics-match-json-stringify-after-parse', () => {
    const input = JSON.parse(
      String.raw`{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/","literals":[null,true,false]}`,
    ) as {
      literals: [null, true, false]
      numbers: number[]
      string: string
    }

    const jsonStringify = JSON.stringify(input)
    const canonical = canonicalize(input)

    expect(JSON.parse(canonical ?? 'null')).toEqual(JSON.parse(jsonStringify))
  })

  it('weird-canonical-key-order-is-stable-across-input-permutations', () => {
    const entries = [
      ['\u20ac', 'Euro Sign'],
      ['\r', 'Carriage Return'],
      ['\n', 'Newline'],
      ['1', 'One'],
      ['\u0080', 'Control\u007f'],
      ['\ud83d\ude02', 'Smiley'],
      ['\u00f6', 'Latin Small Letter O With Diaeresis'],
      ['\ufb33', 'Hebrew Letter Dalet With Dagesh'],
      ['</script>', 'Browser Challenge'],
    ] as const

    const random = createRandom(999)
    const baseline = canonicalize(buildObjectFromEntries(entries))

    for (let index = 0; index < 30; index += 1) {
      const candidate = canonicalize(buildObjectFromEntries(shuffle(entries, random)))
      expect(candidate).toEqual(baseline)
    }
  })
})
