import { describe, expect, it } from 'vitest'

import { canonicalize } from './index'

function expectThrowParity(factory: () => unknown): void {
  let jsonError: unknown
  let canonicalError: unknown

  try {
    JSON.stringify(factory())
  } catch (error) {
    jsonError = error
  }

  try {
    canonicalize(factory())
  } catch (error) {
    canonicalError = error
  }

  expect(jsonError).toBeInstanceOf(TypeError)
  expect(canonicalError).toBeInstanceOf(TypeError)
  expect(canonicalError).toBeInstanceOf(Error)
  expect((canonicalError as Error).message).toEqual('Converting circular structure to JSON')
}

function expectNoThrowParity(factory: () => unknown): void {
  expect(() => JSON.stringify(factory())).not.toThrowError()
  expect(() => canonicalize(factory())).not.toThrowError()
}

describe('circular-structure-behavior-parity', () => {
  it('throws-for-direct-object-self-reference', () => {
    expectThrowParity(() => {
      const value: { self?: unknown } = {}
      value.self = value
      return value
    })
  })

  it('throws-for-indirect-object-cycles', () => {
    expectThrowParity(() => {
      const left: { right?: unknown } = {}
      const right: { left?: unknown } = {}
      left.right = right
      right.left = left
      return left
    })
  })

  it('throws-for-direct-array-self-reference', () => {
    expectThrowParity(() => {
      const value: unknown[] = []
      value.push(value)
      return value
    })
  })

  it('throws-for-object-array-object-cycles', () => {
    expectThrowParity(() => {
      const root: { list: unknown[] } = { list: [] }
      root.list.push(root)
      return root
    })
  })

  it('throws-for-array-object-array-cycles', () => {
    expectThrowParity(() => {
      const root: unknown[] = []
      const child: { root?: unknown } = {}
      child.root = root
      root.push(child)
      return root
    })
  })

  it('throws-for-deep-nested-cycles', () => {
    expectThrowParity(() => {
      const root: { a?: unknown } = {}
      const a: { b?: unknown } = {}
      const b: { c?: unknown } = {}
      const c: { root?: unknown } = {}
      root.a = a
      a.b = b
      b.c = c
      c.root = root
      return root
    })
  })

  it('does-not-throw-for-repeated-non-cyclic-references', () => {
    expectNoThrowParity(() => {
      const shared = { value: 1 }
      return { a: shared, b: shared }
    })
  })

  it('does-not-throw-when-tojson-breaks-a-potential-cycle', () => {
    expectNoThrowParity(() => {
      const value: { self?: unknown; toJSON: () => { ok: boolean } } = {
        toJSON() {
          return { ok: true }
        },
      }
      value.self = value
      return value
    })
  })
})
