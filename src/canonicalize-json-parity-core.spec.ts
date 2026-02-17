/* eslint-disable unicorn/consistent-function-scoping */
/* eslint-disable perfectionist/sort-objects */
import { describe, expect, it } from 'vitest'

import { canonicalize } from './index'

describe('canonicalize', () => {
  describe('matches-json-stringify-behavior-for-scalar-and-special-values', () => {
    it.each([
      { input: undefined, expected: undefined, title: 'undefined' },
      { input: null, expected: 'null', title: 'null' },
      { input: true, expected: 'true', title: 'boolean-true' },
      { input: false, expected: 'false', title: 'boolean-false' },
      { input: Symbol('hello world'), expected: undefined, title: 'symbol' },
      { input: 42, expected: '42', title: 'number' },
      { input: 'foo', expected: '"foo"', title: 'string' },
      { input: '\u20ac', expected: '"€"', title: 'unicode-character' },
    ])('serializes-$title', ({ input, expected }) => {
      expect(canonicalize(input)).toEqual(expected)
    })

    it('returns-undefined-for-top-level-function-values', () => {
      const value = () => 'hello'
      expect(canonicalize(value)).toEqual(undefined)
    })

    it('serializes-nan-and-infinity-in-arrays-as-null', () => {
      expect(canonicalize([NaN, null, Infinity])).toEqual('[null,null,null]')
    })

    it('serializes-very-large-numbers', () => {
      expect(canonicalize(Math.pow(2, 1000))).toEqual('1.0715086071862673e+301')
    })

    it('throws-a-matching-typeerror-for-bigint-values', () => {
      const serializeBigInt = () => {
        const bigint = 9_007_199_254_740_991n
        canonicalize(bigint)
      }

      const jsonBigIntError = (() => {
        try {
          JSON.stringify(1n)
        } catch (error) {
          return error instanceof TypeError ? error.message : ''
        }

        return ''
      })()

      expect(serializeBigInt).toThrowError(TypeError)
      expect(serializeBigInt).toThrowError(jsonBigIntError)
    })

    it('serializes-date-values-using-iso-format', () => {
      expect(canonicalize(new Date(Date.UTC(2006, 0, 2, 15, 4, 5)))).toEqual(
        '"2006-01-02T15:04:05.000Z"',
      )
    })
  })

  describe('handles-arrays-with-json-compatible-semantics', () => {
    it('ignores-non-index-keys-on-arrays', () => {
      const arrayWithExtraKey = ['foo', 'bar'] as { baz: string } & string[]
      arrayWithExtraKey.baz = 'quux'

      expect(canonicalize(arrayWithExtraKey)).toEqual('["foo","bar"]')
    })

    it('serializes-heterogeneous-arrays-and-converts-unsupported-entries-to-null', () => {
      const value = [
        undefined,
        null,
        true,
        false,
        'foo',
        42,
        42n.toString(),
        Symbol('hello'),
        () => 'hello',
      ]

      expect(canonicalize(value)).toEqual('[null,null,true,false,"foo",42,"42",null,null]')
    })

    it('serializes-empty-and-nested-arrays', () => {
      expect(canonicalize([])).toEqual('[]')
      expect(canonicalize([['b', 'a']])).toEqual('[["b","a"]]')
    })

    it.each([
      { input: ['abc'], expected: '["abc"]', title: 'single-string-element' },
      { input: [123], expected: '[123]', title: 'single-number-element' },
      { input: [true], expected: '[true]', title: 'single-true-element' },
      { input: [false], expected: '[false]', title: 'single-false-element' },
      { input: [null], expected: '[null]', title: 'single-null-element' },
      { input: [undefined], expected: '[null]', title: 'single-undefined-element' },
      {
        input: [Symbol('hello world')],
        expected: '[null]',
        title: 'single-symbol-element',
      },
      { input: [() => 'hello'], expected: '[null]', title: 'single-function-element' },
    ])('serializes-$title', ({ input, expected }) => {
      expect(canonicalize(input)).toEqual(expected)
    })

    it('serializes-objects-embedded-in-arrays', () => {
      expect(canonicalize([{ a: 'string', b: 123 }])).toEqual('[{"a":"string","b":123}]')
    })

    it('serializes-mixed-multi-element-arrays', () => {
      expect(canonicalize(['abc', 123, true, false, null])).toEqual('["abc",123,true,false,null]')
    })
  })

  describe('handles-objects-with-stable-key-ordering-and-json-rules', () => {
    it.each([
      { input: {}, expected: '{}', title: 'empty-object' },
      { input: { hello: 'world' }, expected: '{"hello":"world"}', title: 'single-key' },
      { input: { 42: 'foo' }, expected: '{"42":"foo"}', title: 'number-like-key' },
      {
        input: { hello: 'world', number: 123 },
        expected: '{"hello":"world","number":123}',
        title: 'multiple-keys-sorted-lexicographically',
      },
      { input: { test: null }, expected: '{"test":null}', title: 'null-value' },
      { input: { test: undefined }, expected: '{}', title: 'undefined-value-omitted' },
      {
        input: { test: Symbol('hello world') },
        expected: '{}',
        title: 'symbol-value-omitted',
      },
      {
        input: { test: { hello: 'world' } },
        expected: '{"test":{"hello":"world"}}',
        title: 'nested-object-value',
      },
      {
        input: { test: ['hello', 'world'] },
        expected: '{"test":["hello","world"]}',
        title: 'array-value',
      },
    ])('serializes-$title', ({ input, expected }) => {
      expect(canonicalize(input)).toEqual(expected)
    })

    it('omits-symbol-keyed-properties', () => {
      expect(canonicalize({ [Symbol('hello world')]: 'foo' })).toEqual('{}')
    })

    it('omits-function-values', () => {
      const value = { test: () => 'hello' }
      expect(canonicalize(value)).toEqual('{}')
    })

    it('uses-object-tojson-output-for-serialization', () => {
      const value = {
        a: 123,
        b: 456,
        toJSON() {
          return {
            a: this.a,
            b: this.b,
            c: 'foo',
          }
        },
      }

      expect(canonicalize(value)).toEqual('{"a":123,"b":456,"c":"foo"}')
    })

    it('includes-only-enumerable-own-properties', () => {
      const value: unknown = Object.create(null, {
        x: { enumerable: false, value: 'x' },
        y: { enumerable: true, value: 'y' },
      })

      expect(canonicalize(value)).toEqual('{"y":"y"}')
    })
  })

  describe('handles-built-in-collections-and-typed-arrays', () => {
    it('serializes-set-map-weakset-weakmap-entries-as-empty-objects', () => {
      const value = [
        new Set([1]),
        new Map([[1, 2]]),
        new WeakSet([{ a: 1 }]),
        new WeakMap([[{ a: 1 }, 2]]),
      ]

      expect(canonicalize(value)).toEqual('[{},{},{},{}]')
    })

    it('serializes-typed-arrays-as-index-keyed-objects', () => {
      const signed = [new Int8Array([1]), new Int16Array([1]), new Int32Array([1])]
      expect(canonicalize(signed)).toEqual('[{"0":1},{"0":1},{"0":1}]')

      const unsigned = [
        new Uint8Array([1]),
        new Uint8ClampedArray([1]),
        new Uint16Array([1]),
        new Uint32Array([1]),
      ]
      expect(canonicalize(unsigned)).toEqual('[{"0":1},{"0":1},{"0":1},{"0":1}]')

      const floats = [new Float32Array([1]), new Float64Array([1])]
      expect(canonicalize(floats)).toEqual('[{"0":1},{"0":1}]')
    })

    it('drops-symbol-derived-object-keys-and-values-consistently', () => {
      const valueWithSymbolProperty = { x: undefined, y: Object, z: Symbol('') }
      expect(canonicalize(valueWithSymbolProperty)).toEqual('{}')

      const valueWithSymbolKey = { [Symbol('foo')]: 'foo' }
      expect(canonicalize(valueWithSymbolKey)).toEqual('{}')

      const mixedSymbolCase = [{ [Symbol.for('foo')]: 'foo' }, [Symbol.for('foo')]]
      expect(canonicalize(mixedSymbolCase)).toEqual('[{},[null]]')
    })
  })

  describe('handles-escaping-and-tojson-context-semantics', () => {
    it('escapes-control-characters-backslashes-quotes-and-lone-surrogates', () => {
      expect(canonicalize('\uD800')).toEqual('"\\ud800"')
      expect(canonicalize('\uDEAD')).toEqual('"\\udead"')
      expect(canonicalize('\u0008')).toEqual('"\\b"')
      expect(canonicalize('\u0009')).toEqual('"\\t"')
      expect(canonicalize('\u000A')).toEqual('"\\n"')
      expect(canonicalize('\u000C')).toEqual('"\\f"')
      expect(canonicalize('\u000D')).toEqual('"\\r"')
      expect(canonicalize('\u005C')).toEqual('"\\\\"')
      expect(canonicalize('\u0022')).toEqual('"\\""')
    })

    it('passes-json-compatible-key-context-into-tojson', () => {
      const value = {
        data: 'data',
        toJSON(key: string) {
          if (key.length > 0) {
            return `Now I am a nested object under key '${key}'`
          }

          return { data: this.data }
        },
      }

      expect(canonicalize(value)).toEqual('{"data":"data"}')
      expect(canonicalize({ value })).toEqual(
        '{"value":"Now I am a nested object under key \'value\'"}',
      )
      expect(canonicalize([value])).toEqual('["Now I am a nested object under key \'0\'"]')
    })

    it('applies-undefined-from-tojson-according-to-container-type', () => {
      const value = {
        toJSON() {
          return undefined
        },
      }

      expect(canonicalize(value)).toEqual(undefined)
      expect(canonicalize({ value })).toEqual('{}')
      expect(canonicalize([value])).toEqual('[null]')
    })
  })

  describe('handles-class-instances', () => {
    it('uses-class-tojson-output-when-provided', () => {
      class WithToJson {
        a: number
        b: number

        constructor(a: number, b: number) {
          this.a = a
          this.b = b
        }

        toJSON() {
          return { a: this.a, b: this.b, c: 'foo' }
        }
      }

      const value = new WithToJson(123, 456)
      expect(canonicalize(value)).toEqual('{"a":123,"b":456,"c":"foo"}')
    })

    it('serializes-enumerable-fields-when-no-tojson-is-defined', () => {
      class WithoutToJson {
        a: number
        b: number

        constructor(b: number, a: number) {
          this.b = b
          this.a = a
        }

        ignoredFunction() {
          return { bogus: true }
        }
      }

      const value = new WithoutToJson(456, 123)
      expect(canonicalize(value)).toEqual('{"a":123,"b":456}')
    })
  })
})
