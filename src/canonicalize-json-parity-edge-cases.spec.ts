/* eslint-disable unicorn/consistent-function-scoping */
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

import { canonicalize } from './index'

describe('json-parity-edge-cases', () => {
  describe('tojson-key-invocation-semantics', () => {
    it('uses-empty-key-at-root-property-name-in-objects-and-string-index-in-arrays', () => {
      const calls: string[] = []
      const value = {
        toJSON(key: string) {
          calls.push(key)
          return key.length === 0 ? { ok: true } : key
        },
      }

      expect(canonicalize(value)).toEqual('{"ok":true}')
      expect(canonicalize({ value })).toEqual('{"value":"value"}')
      expect(canonicalize([value])).toEqual('["0"]')
      expect(calls).toEqual(['', 'value', '0'])
    })

    it('binds-this-to-the-value-being-serialized', () => {
      const value = {
        marker: 123,
        toJSON(this: { marker: number }, key: string) {
          expect(this.marker).toEqual(123)
          return key.length === 0 ? { marker: this.marker } : this.marker
        },
      }

      expect(canonicalize(value)).toEqual('{"marker":123}')
      expect(canonicalize({ value })).toEqual('{"value":123}')
    })

    it('reads-tojson-once-when-it-is-exposed-via-a-getter', () => {
      let gets = 0
      const value = {
        get toJSON() {
          gets += 1
          return () => ({ ok: true })
        },
      }

      expect(canonicalize(value)).toEqual('{"ok":true}')
      expect(gets).toEqual(1)
    })

    it('does-not-fail-when-a-tojson-getter-changes-between-reads', () => {
      let gets = 0
      const value = {
        get toJSON() {
          gets += 1
          if (gets > 1) {
            throw new Error('second get')
          }
          return () => 1
        },
      }

      expect(canonicalize(value)).toEqual('1')
    })

    it('accepts-cross-realm-tojson-functions', () => {
      const context = vm.createContext({})
      // eslint-disable-next-line typescript/no-unsafe-assignment
      const value = vm.runInContext('({ toJSON(){ return {a:1} } })', context)

      expect(canonicalize(value)).toEqual('{"a":1}')
    })
  })

  describe('tojson-return-value-matrix', () => {
    it('handles-undefined-return-values-across-root-object-array-contexts', () => {
      const value = {
        toJSON() {
          return undefined
        },
      }
      expect(canonicalize(value)).toEqual(undefined)
      expect(canonicalize({ value })).toEqual('{}')
      expect(canonicalize([value])).toEqual('[null]')
    })

    it('handles-function-return-values-across-root-object-array-contexts', () => {
      const value = {
        toJSON() {
          return () => 1
        },
      }
      expect(canonicalize(value)).toEqual(undefined)
      expect(canonicalize({ value })).toEqual('{}')
      expect(canonicalize([value])).toEqual('[null]')
    })

    it('handles-symbol-return-values-across-root-object-array-contexts', () => {
      const value = {
        toJSON() {
          return Symbol('s')
        },
      }
      expect(canonicalize(value)).toEqual(undefined)
      expect(canonicalize({ value })).toEqual('{}')
      expect(canonicalize([value])).toEqual('[null]')
    })

    it('serializes-null-return-values-in-all-contexts', () => {
      const value = {
        toJSON() {
          return null
        },
      }
      expect(canonicalize(value)).toEqual('null')
      expect(canonicalize({ value })).toEqual('{"value":null}')
      expect(canonicalize([value])).toEqual('[null]')
    })

    it('serializes-primitive-return-values-in-all-contexts', () => {
      const asNumber = {
        toJSON() {
          return 42
        },
      }
      const asString = {
        toJSON() {
          return 'x'
        },
      }
      const asBoolean = {
        toJSON() {
          return false
        },
      }

      expect(canonicalize(asNumber)).toEqual('42')
      expect(canonicalize({ asNumber })).toEqual('{"asNumber":42}')
      expect(canonicalize([asNumber])).toEqual('[42]')

      expect(canonicalize(asString)).toEqual('"x"')
      expect(canonicalize({ asString })).toEqual('{"asString":"x"}')
      expect(canonicalize([asString])).toEqual('["x"]')

      expect(canonicalize(asBoolean)).toEqual('false')
      expect(canonicalize({ asBoolean })).toEqual('{"asBoolean":false}')
      expect(canonicalize([asBoolean])).toEqual('[false]')
    })

    it('recursively-serializes-object-and-array-return-values', () => {
      const asObject = {
        toJSON() {
          // eslint-disable-next-line perfectionist/sort-objects
          return { b: 2, a: 1 }
        },
      }
      const asArray = {
        toJSON() {
          // eslint-disable-next-line perfectionist/sort-objects
          return ['z', { y: 2, x: 1 }]
        },
      }

      expect(canonicalize(asObject)).toEqual('{"a":1,"b":2}')
      expect(canonicalize(asArray)).toEqual('["z",{"x":1,"y":2}]')
    })

    it('throws-when-tojson-returns-bigint', () => {
      const value = {
        toJSON() {
          return 2n
        },
      }
      expect(() => canonicalize(value)).toThrowError(TypeError)
    })

    it('propagates-exceptions-thrown-inside-tojson', () => {
      const value = {
        toJSON() {
          throw new Error('boom')
        },
      }

      expect(() => canonicalize(value)).toThrowError('boom')
    })
  })

  describe('bigint-corner-cases', () => {
    it('throws-for-bigint-as-root-object-property-and-array-element', () => {
      expect(() => canonicalize(2n)).toThrowError(TypeError)
      expect(() => canonicalize({ x: 2n })).toThrowError(TypeError)
      expect(() => canonicalize([2n])).toThrowError(TypeError)
    })

    it('throws-for-bigint-wrapper-objects', () => {
      expect(() => canonicalize(Object(2n))).toThrowError(TypeError)
    })

    it('supports-bigint-serialization-in-root-array-object-contexts-when-bigint-prototype-tojson-is-defined', () => {
      const bigintPrototype = BigInt.prototype as object
      const originalDescriptor = Object.getOwnPropertyDescriptor(bigintPrototype, 'toJSON')

      Object.defineProperty(bigintPrototype, 'toJSON', {
        configurable: true,
        value(this: bigint) {
          return this.toString()
        },
      })

      try {
        expect(canonicalize(2n)).toEqual('"2"')
        expect(canonicalize([2n])).toEqual('["2"]')
        expect(canonicalize({ x: 2n })).toEqual('{"x":"2"}')
      } finally {
        if (originalDescriptor === undefined) {
          Reflect.deleteProperty(bigintPrototype, 'toJSON')
        } else {
          Object.defineProperty(bigintPrototype, 'toJSON', originalDescriptor)
        }
      }
    })
  })

  describe('object-property-inclusion-rules', () => {
    it('serializes-only-own-enumerable-string-keyed-properties', () => {
      const symbolKey = Symbol('s')
      const proto = { inherited: 1 }
      const value = Object.create(proto) as {
        [key: symbol]: number
        visible: number
        hidden?: number
      }

      Object.defineProperty(value, 'visible', { enumerable: true, value: 2 })
      Object.defineProperty(value, 'hidden', { enumerable: false, value: 3 })
      value[symbolKey] = 4

      expect(canonicalize(value)).toEqual('{"visible":2}')
    })

    it('propagates-exceptions-from-throwing-getters', () => {
      const value = {
        get x() {
          throw new Error('getter failed')
        },
      }

      expect(() => canonicalize(value)).toThrowError('getter failed')
    })

    it.fails('matches-json-stringify-ordering-for-integer-like-object-keys', () => {
      // JSON.stringify follows Object.keys ordering for integer index keys.
      // eslint-disable-next-line perfectionist/sort-objects
      expect(canonicalize({ 2: 'b', 10: 'a' })).toEqual('{"2":"b","10":"a"}')
    })

    it('matches-json-stringify-getter-side-effects-from-insertion-order-property-access', () => {
      const state = { touched: false }
      const value: Record<string, number> = {}

      Object.defineProperty(value, 'b', {
        enumerable: true,
        get() {
          state.touched = true
          return 1
        },
      })

      Object.defineProperty(value, 'a', {
        enumerable: true,
        get() {
          return state.touched ? 1 : 0
        },
      })

      // Canonical output order differs, but getter side effects should match JSON traversal semantics.
      expect(canonicalize(value)).toEqual('{"a":1,"b":1}')
    })
  })

  describe('array-specific-edge-cases', () => {
    it('serializes-sparse-holes-as-null', () => {
      const input = new Array(2)
      expect(canonicalize(input)).toEqual('[null,null]')
    })

    it('serializes-undefined-function-symbol-elements-as-null', () => {
      const input = [undefined, () => true, Symbol('x')]
      expect(canonicalize(input)).toEqual('[null,null,null]')
    })

    it('ignores-non-index-array-properties', () => {
      const input = [1] as { extra?: number } & number[]
      input.extra = 2
      expect(canonicalize(input)).toEqual('[1]')
    })

    it('serializes-indices-in-the-0-length-1-range', () => {
      const input = [1]
      input.length = 3
      expect(canonicalize(input)).toEqual('[1,null,null]')
    })
  })

  describe('number-string-encoding-edge-cases', () => {
    it('serializes-nan-infinity-infinity-as-null', () => {
      expect(canonicalize([NaN, Infinity, -Infinity])).toEqual('[null,null,null]')
    })

    it('serializes-0-as-0', () => {
      expect(canonicalize(-0)).toEqual('0')
    })

    it('escapes-lone-surrogates-with-unicode-escapes', () => {
      expect(canonicalize('\uD800')).toEqual('"\\ud800"')
      expect(canonicalize('\uDEAD')).toEqual('"\\udead"')
    })

    it('escapes-control-characters-and-quote-backslash', () => {
      expect(canonicalize('\b\t\n\f\r\\"')).toEqual('"\\b\\t\\n\\f\\r\\\\\\""')
    })
  })

  describe('built-ins-and-wrappers', () => {
    it('unboxes-number-string-boolean-wrappers', () => {
      expect(canonicalize(new Number(3))).toEqual('3')
      expect(canonicalize(new String('x'))).toEqual('"x"')
      expect(canonicalize(new Boolean(false))).toEqual('false')
    })

    it('applies-symbol-toprimitive-for-number-string-wrappers-as-json-stringify-does', () => {
      const numberWrapper = new Number(3) as {
        [Symbol.toPrimitive]?: (hint: string) => number
      }
      numberWrapper[Symbol.toPrimitive] = () => 7

      const stringWrapper = new String('x') as {
        [Symbol.toPrimitive]?: (hint: string) => string
      }
      stringWrapper[Symbol.toPrimitive] = () => 'y'

      expect(canonicalize(numberWrapper)).toEqual('7')
      expect(canonicalize(stringWrapper)).toEqual('"y"')
    })

    it('propagates-symbol-toprimitive-errors-for-number-string-wrappers', () => {
      const numberWrapper = new Number(3) as {
        [Symbol.toPrimitive]?: () => never
      }
      numberWrapper[Symbol.toPrimitive] = () => {
        throw new Error('number primitive boom')
      }

      const stringWrapper = new String('x') as {
        [Symbol.toPrimitive]?: () => never
      }
      stringWrapper[Symbol.toPrimitive] = () => {
        throw new Error('string primitive boom')
      }

      expect(() => canonicalize(numberWrapper)).toThrowError('number primitive boom')
      expect(() => canonicalize(stringWrapper)).toThrowError('string primitive boom')
    })

    it('does-not-treat-symbol-tostringtag-spoofed-objects-as-boxed-primitives', () => {
      const fakeNumber = { [Symbol.toStringTag]: 'Number' }
      const fakeString = { [Symbol.toStringTag]: 'String' }
      const fakeBoolean = { [Symbol.toStringTag]: 'Boolean' }
      const fakeBigInt = { [Symbol.toStringTag]: 'BigInt' }

      expect(canonicalize(fakeNumber)).toEqual('{}')
      expect(canonicalize(fakeString)).toEqual('{}')
      expect(canonicalize(fakeBoolean)).toEqual('{}')
      expect(canonicalize(fakeBigInt)).toEqual('{}')
    })

    it('serializes-json-rawjson-values-as-raw-json', () => {
      const jsonWithRaw = JSON as {
        rawJSON?: (text: string) => unknown
      } & typeof JSON

      if (jsonWithRaw.rawJSON === undefined) {
        return
      }

      expect(canonicalize({ value: jsonWithRaw.rawJSON('123') })).toEqual('{"value":123}')
    })

    it('falls-back-to-object-serialization-if-a-raw-json-like-value-exposes-non-string-rawjson', () => {
      const input = { rawJSON: 123 }

      // Baseline parity for standard behavior.
      expect(canonicalize(input)).toEqual(JSON.stringify(input))

      const jsonWithRaw = JSON as {
        isRawJSON?: (value: unknown) => boolean
      } & typeof JSON
      const originalIsRawJSON = jsonWithRaw.isRawJSON

      jsonWithRaw.isRawJSON = () => true

      try {
        // Defensive branch check: even if detected as raw-json-like, non-string rawJSON
        // must not be emitted directly and should serialize as a normal object.
        expect(canonicalize(input)).toEqual(JSON.stringify(input))
      } finally {
        if (originalIsRawJSON === undefined) {
          Reflect.deleteProperty(jsonWithRaw, 'isRawJSON')
        } else {
          jsonWithRaw.isRawJSON = originalIsRawJSON
        }
      }
    })

    it('serializes-date-using-date-prototype-tojson', () => {
      expect(canonicalize(new Date(Date.UTC(2006, 0, 2, 15, 4, 5)))).toEqual(
        '"2006-01-02T15:04:05.000Z"',
      )
    })

    it('serializes-invalid-date-as-null', () => {
      expect(canonicalize(new Date(Number.NaN))).toEqual('null')
      expect(canonicalize({ d: new Date(Number.NaN) })).toEqual('{"d":null}')
      expect(canonicalize([new Date(Number.NaN)])).toEqual('[null]')
    })

    it('serializes-map-set-weakmap-weakset-as-empty-objects-by-default', () => {
      expect(canonicalize(new Map([[1, 2]]))).toEqual('{}')
      expect(canonicalize(new Set([1]))).toEqual('{}')
      expect(canonicalize(new WeakMap([[{}, 2]]))).toEqual('{}')
      expect(canonicalize(new WeakSet([{}]))).toEqual('{}')
    })

    it('serializes-typed-arrays-with-numeric-elements-as-indexed-objects', () => {
      expect(canonicalize(new Uint8Array([1]))).toEqual('{"0":1}')
      expect(canonicalize(new Float64Array([1]))).toEqual('{"0":1}')
    })

    it('throws-for-bigint-typed-arrays', () => {
      expect(() => canonicalize(new BigInt64Array([1n]))).toThrowError(TypeError)
      expect(() => canonicalize(new BigUint64Array([1n]))).toThrowError(TypeError)
    })
  })

  describe('cycles-and-recursion-safety', () => {
    it('throws-typeerror-for-direct-cycles', () => {
      const value: { self?: unknown } = {}
      value.self = value
      expect(() => canonicalize(value)).toThrowError(TypeError)
    })

    it('throws-typeerror-for-indirect-cycles', () => {
      const a: { b?: unknown } = {}
      const b: { a?: unknown } = {}
      a.b = b
      b.a = a
      expect(() => canonicalize(a)).toThrowError(TypeError)
    })
  })
})
