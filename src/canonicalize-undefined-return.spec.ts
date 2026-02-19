/* eslint-disable unicorn/consistent-function-scoping */
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

import { canonicalize } from './index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that canonicalize and JSON.stringify agree on a root-level result. */
function expectParity(value: unknown): void {
  expect(canonicalize(value)).toEqual(JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Suite 1 — Callable object forms that produce undefined at root
//
// Arrow, named, async, generator, class constructor, built-in, and bound
// functions all satisfy IsCallable. None of them match any of the early-exit
// branches of SerializeJSONProperty (steps 5–11), so they all fall through
// to step 12 and return undefined.
//
// Plain arrow and named function are already in canonicalize-json-parity-core;
// the forms added here (async, generator, class, built-in, bound) are new.
// ---------------------------------------------------------------------------

describe('callable-objects-produce-undefined', () => {
  // Keep factories outside it.each so vitest can label them via `label`.
  const cases: Array<{ label: string; factory: () => unknown }> = [
    {
      label: 'async-arrow-function',
      factory: () => async () => await Promise.resolve(1),
    },
    {
      label: 'async-named-function',
      factory: () =>
        async function asyncFunction() {
          await Promise.resolve()
          return 1
        },
    },
    {
      label: 'generator-function',
      factory: () =>
        function* gen() {
          yield 1
        },
    },
    {
      label: 'async-generator-function',
      factory: () =>
        async function* asyncGen() {
          await Promise.resolve()
          yield 1
        },
    },
    {
      label: 'class-constructor',
      factory: () =>
        class MyClass {
          readonly callable = true
        },
    },
    {
      label: 'built-in-function',
      factory: () => Math.max,
    },
    {
      label: 'bound-function',
      factory: () => Math.max.bind(null),
    },
  ]

  describe('at-root', () => {
    cases.forEach(({ factory, label }) => {
      it(`${label}-returns-undefined-at-root`, () => {
        const value = factory()
        expect(canonicalize(value)).toEqual(undefined)
        expect(JSON.stringify(value)).toEqual(undefined)
      })
    })
  })

  describe('as-object-property-value', () => {
    cases.forEach(({ factory, label }) => {
      it(`${label}-omitted-from-object`, () => {
        const input: Record<string, unknown> = { drop: factory(), keep: 1 }
        expect(canonicalize(input)).toEqual('{"keep":1}')
        expect(JSON.stringify(input)).toEqual('{"keep":1}')
      })
    })
  })

  describe('as-array-element', () => {
    cases.forEach(({ factory, label }) => {
      it(`${label}-becomes-null-in-array`, () => {
        const input = [1, factory(), 2] as unknown[]
        expect(canonicalize(input)).toEqual('[1,null,2]')
        expect(JSON.stringify(input)).toEqual('[1,null,2]')
      })
    })
  })
})

// ---------------------------------------------------------------------------
// Suite 2 — Symbol.for at root
//
// Symbol.for returns a global (registered) symbol. Its typeof is still
// 'symbol', so it reaches step 12 the same way as a local Symbol().
// Only the embedded-in-array case was tested before (in the mixed-symbol
// test in canonicalize-json-parity-core); the root and property cases are new.
// ---------------------------------------------------------------------------

describe('global-symbol-produces-undefined', () => {
  it('symbol-for-returns-undefined-at-root', () => {
    expect(canonicalize(Symbol.for('canonicalize-test'))).toEqual(undefined)
    expect(JSON.stringify(Symbol.for('canonicalize-test'))).toEqual(undefined)
  })

  it('symbol-for-is-omitted-as-object-property-value', () => {
    const input: Record<string, unknown> = { drop: Symbol.for('canonicalize-test'), keep: 'yes' }
    expect(canonicalize(input)).toEqual('{"keep":"yes"}')
    expect(JSON.stringify(input)).toEqual('{"keep":"yes"}')
  })
})

// ---------------------------------------------------------------------------
// Suite 3 — Symbol primitive vs Symbol object asymmetry
//
// Object(Symbol()) produces a symbol wrapper: it is not callable, has no
// [[NumberData]], [[StringData]], [[BooleanData]], or [[BigIntData]] slot,
// so SerializeJSONObject is called and it serialises as "{}".
//
// The bare Symbol() primitive reaches step 12 → undefined.
// This asymmetry is not tested anywhere else in the suite.
// ---------------------------------------------------------------------------

describe('symbol-primitive-vs-symbol-object-asymmetry', () => {
  it('symbol-primitive-returns-undefined-at-root', () => {
    expect(canonicalize(Symbol('asym'))).toEqual(undefined)
    expect(JSON.stringify(Symbol('asym'))).toEqual(undefined)
  })

  it('symbol-object-serialises-as-empty-object-at-root', () => {
    // Object(Symbol()) is non-callable, no recognised data slot → SerializeJSONObject → "{}".
    expect(canonicalize(Object(Symbol('asym')))).toEqual('{}')
    expect(JSON.stringify(Object(Symbol('asym')))).toEqual('{}')
  })

  it('symbol-primitive-becomes-null-in-array', () => {
    expect(canonicalize([Symbol('asym')])).toEqual('[null]')
    expect(JSON.stringify([Symbol('asym')])).toEqual('[null]')
  })

  it('symbol-object-serialises-as-empty-object-in-array', () => {
    expect(canonicalize([Object(Symbol('asym'))])).toEqual('[{}]')
    expect(JSON.stringify([Object(Symbol('asym'))])).toEqual('[{}]')
  })

  it('symbol-primitive-is-omitted-as-object-property-value', () => {
    const input: Record<string, unknown> = { drop: Symbol('asym'), keep: 1 }
    expect(canonicalize(input)).toEqual('{"keep":1}')
    expect(JSON.stringify(input)).toEqual('{"keep":1}')
  })

  it('symbol-object-is-present-as-object-property-value', () => {
    const input: Record<string, unknown> = { keep: 1, wrap: Object(Symbol('asym')) }
    expect(canonicalize(input)).toEqual('{"keep":1,"wrap":{}}')
    expect(JSON.stringify(input)).toEqual('{"keep":1,"wrap":{}}')
  })
})

// ---------------------------------------------------------------------------
// Suite 4 — Cross-realm function value (not cross-realm toJSON)
//
// A cross-realm function is a callable object from a different V8 context.
// IsCallable checks the internal [[Call]] slot regardless of realm, so it
// should fall through to step 12 → undefined.
//
// The existing cross-realm test covers an object with a cross-realm toJSON
// method. This suite tests the function *itself* as the serialised value.
// ---------------------------------------------------------------------------

describe('cross-realm-function-value', () => {
  it('cross-realm-function-returns-undefined-at-root', () => {
    const context = vm.createContext({})
    const function_ = vm.runInContext('(function crossRealm() {})', context) as unknown

    expect(canonicalize(function_)).toEqual(undefined)
    expect(JSON.stringify(function_)).toEqual(undefined)
  })

  it('cross-realm-function-is-omitted-as-object-property-value', () => {
    const context = vm.createContext({})
    const function_ = vm.runInContext('(function crossRealm() {})', context) as unknown

    const input: Record<string, unknown> = { drop: function_, keep: 1 }
    expect(canonicalize(input)).toEqual('{"keep":1}')
    expect(JSON.stringify(input)).toEqual('{"keep":1}')
  })

  it('cross-realm-function-becomes-null-in-array', () => {
    const context = vm.createContext({})
    const function_ = vm.runInContext('(function crossRealm() {})', context) as unknown

    expect(canonicalize([function_])).toEqual('[null]')
    expect(JSON.stringify([function_])).toEqual('[null]')
  })

  it('cross-realm-arrow-function-returns-undefined-at-root', () => {
    const context = vm.createContext({})
    const function_ = vm.runInContext('(() => {})', context) as unknown

    expect(canonicalize(function_)).toEqual(undefined)
    expect(JSON.stringify(function_)).toEqual(undefined)
  })
})

// ---------------------------------------------------------------------------
// Suite 5 — Bidirectional parity property
//
// canonicalize must return undefined if and only if JSON.stringify returns
// undefined, for every value in the undefined-producing domain.
// The two directions are kept separate so a failure identifies which side broke.
// ---------------------------------------------------------------------------

describe('bidirectional-undefined-parity', () => {
  const undefinedCases: Array<{ label: string; factory: () => unknown }> = [
    { label: 'undefined', factory: () => undefined },
    { label: 'symbol', factory: () => Symbol('parity') },
    { label: 'symbol-for', factory: () => Symbol.for('parity') },
    { label: 'arrow-function', factory: () => () => 1 },
    { label: 'async-function', factory: () => async () => await Promise.resolve(1) },
    {
      label: 'generator-function',
      factory: () =>
        function* () {
          yield 1
        },
    },
    {
      label: 'class-constructor',
      factory: () =>
        class Parity {
          readonly callable = true
        },
    },
    { label: 'bound-function', factory: () => Number.parseInt.bind(null) },
    { label: 'tojson-returns-undefined', factory: () => ({ toJSON: () => undefined }) },
    { label: 'tojson-returns-symbol', factory: () => ({ toJSON: () => Symbol('s') }) },
    { label: 'tojson-returns-function', factory: () => ({ toJSON: () => () => 1 }) },
  ]

  it('canonicalize-returns-undefined-when-json-stringify-does', () => {
    for (const { factory, label } of undefinedCases) {
      const value = factory()
      const jsonResult = JSON.stringify(value)
      const canonResult = canonicalize(value)

      expect(canonResult, `${label}: canonicalize should return undefined`).toEqual(undefined)
      expect(jsonResult, `${label}: JSON.stringify should return undefined`).toEqual(undefined)
    }
  })

  // Inverse direction: values that always produce a string must not produce undefined.
  const alwaysStringCases: Array<{ label: string; factory: () => unknown }> = [
    { label: 'null', factory: () => null },
    { label: 'true', factory: () => true },
    { label: 'false', factory: () => false },
    { label: 'zero', factory: () => 0 },
    { label: 'negative-zero', factory: () => -0 },
    { label: 'positive-number', factory: () => 42 },
    { label: 'nan', factory: () => Number.NaN },
    { label: 'infinity', factory: () => Number.POSITIVE_INFINITY },
    { label: 'empty-string', factory: () => '' },
    { label: 'non-empty-string', factory: () => 'hello' },
    { label: 'empty-object', factory: () => ({}) },
    { label: 'empty-array', factory: () => [] },
    { label: 'number-wrapper', factory: () => new Number(3) },
    { label: 'string-wrapper', factory: () => new String('x') },
    { label: 'boolean-wrapper-true', factory: () => new Boolean(true) },
    { label: 'boolean-wrapper-false', factory: () => new Boolean(false) },
    { label: 'symbol-object', factory: (): unknown => Object(Symbol('x')) },
    { label: 'date-valid', factory: () => new Date(Date.UTC(2024, 0, 1)) },
    { label: 'map', factory: () => new Map([[1, 2]]) },
    { label: 'set', factory: () => new Set([1]) },
  ]

  it('canonicalize-does-not-return-undefined-when-json-stringify-does-not', () => {
    for (const { factory, label } of alwaysStringCases) {
      const value = factory()
      const jsonResult = JSON.stringify(value)
      const canonResult = canonicalize(value)

      expect(jsonResult, `${label}: JSON.stringify should return a string`).not.toEqual(undefined)
      expect(canonResult, `${label}: canonicalize should return a string`).not.toEqual(undefined)
    }
  })
})

// ---------------------------------------------------------------------------
// Suite 6 — Symbol-keyed properties (key exclusion, not value exclusion)
//
// Properties with symbol keys are excluded by Object.keys enumeration
// before SerializeJSONProperty is ever called. The object still serialises
// to a string — "{}". This must not be confused with the undefined return
// that occurs when the *value* is a Symbol primitive.
// ---------------------------------------------------------------------------

describe('symbol-keyed-properties-produce-string-not-undefined', () => {
  it('object-with-only-symbol-keys-serialises-as-empty-object-string', () => {
    const input = { [Symbol('j')]: 42, [Symbol('k')]: 'v' }
    // Return is a string, not undefined.
    expect(canonicalize(input)).toEqual('{}')
    expectParity(input)
  })

  it('object-with-mixed-string-and-symbol-keys-omits-symbol-keys', () => {
    const sym = Symbol('hidden')
    const input = Object.assign(Object.create(null) as Record<string | symbol, unknown>, {
      [sym]: 'no',
      visible: 'yes',
    })
    expect(canonicalize(input)).toEqual('{"visible":"yes"}')
    expectParity(input)
  })

  it('symbol-keyed-object-return-is-string-not-undefined', () => {
    const result = canonicalize({ [Symbol('k')]: 'v' })
    expect(typeof result).toEqual('string')
  })
})
