/* eslint-disable perfectionist/sort-intersection-types */
/* eslint-disable perfectionist/sort-object-types */
/* eslint-disable perfectionist/sort-objects */
/* eslint-disable perfectionist/sort-switch-case */
/* eslint-disable perfectionist/sort-union-types */
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

import { canonicalize } from './index'

type Bucket =
  | 'array'
  | 'collection'
  | 'cross-realm-tojson'
  | 'date'
  | 'getter-order'
  | 'non-json-value'
  | 'object'
  | 'primitive'
  | 'raw-json'
  | 'tojson'
  | 'typed-array'
  | 'wrapper'

interface GeneratedCase {
  readonly bucket: Bucket
  readonly descriptor: Descriptor
}

type ToJsonMode =
  | 'array-mixed'
  | 'bigint'
  | 'function'
  | 'key-length'
  | 'null'
  | 'number'
  | 'object-nested'
  | 'string'
  | 'symbol'
  | 'undefined'

type TypedArrayVariant = 'bigint64' | 'biguint64' | 'float64' | 'uint8'

type Descriptor =
  | {
      readonly kind: 'array'
      readonly includeExtra: boolean
      readonly items: Descriptor[]
      readonly length: number
    }
  | {
      readonly kind: 'bigint-wrapper'
      readonly value: string
    }
  | {
      readonly kind: 'boolean'
      readonly value: boolean
    }
  | {
      readonly kind: 'boolean-wrapper'
      readonly value: boolean
    }
  | {
      readonly kind: 'collection'
      readonly variant: 'map' | 'set'
    }
  | {
      readonly kind: 'cross-realm-tojson'
    }
  | {
      readonly kind: 'date'
      readonly timestamp: number | null
    }
  | {
      readonly kind: 'function'
    }
  | {
      readonly kind: 'getter-order-object'
    }
  | {
      readonly kind: 'null'
    }
  | {
      readonly kind: 'number'
      readonly value: number
    }
  | {
      readonly kind: 'number-wrapper'
      readonly throwOnPrimitive: boolean
      readonly toPrimitive: number | null
      readonly value: number
    }
  | {
      readonly entries: Array<{
        readonly key: string
        readonly value: Descriptor
      }>
      readonly includeHidden: boolean
      readonly kind: 'object'
    }
  | {
      readonly kind: 'raw-json'
      readonly text: string
    }
  | {
      readonly kind: 'string'
      readonly value: string
    }
  | {
      readonly kind: 'string-wrapper'
      readonly throwOnPrimitive: boolean
      readonly toPrimitive: string | null
      readonly value: string
    }
  | {
      readonly description: string
      readonly kind: 'symbol'
    }
  | {
      readonly description: string
      readonly kind: 'symbol-object'
    }
  | {
      readonly kind: 'tojson-object'
      readonly mode: ToJsonMode
      readonly nested: Descriptor | null
      readonly numberValue: number
      readonly textValue: string
    }
  | {
      readonly kind: 'typed-array'
      readonly values: number[] | string[]
      readonly variant: TypedArrayVariant
    }
  | {
      readonly kind: 'undefined'
    }

interface FailureDetails {
  readonly bucket: Bucket
  readonly reason: string
}

type SerializerOutcome =
  | {
      readonly kind: 'success'
      readonly output: string | undefined
    }
  | {
      readonly errorName: string
      readonly kind: 'throw'
    }

const HAS_RAW_JSON_SUPPORT =
  typeof (JSON as typeof JSON & { rawJSON?: (text: string) => unknown }).rawJSON === 'function'

const CORPUS_DESCRIPTORS: Descriptor[] = [
  {
    kind: 'number-wrapper',
    throwOnPrimitive: false,
    toPrimitive: 7,
    value: 3,
  },
  {
    kind: 'string-wrapper',
    throwOnPrimitive: false,
    toPrimitive: 'y',
    value: 'x',
  },
  {
    kind: 'array',
    includeExtra: true,
    items: [
      {
        kind: 'number',
        value: 1,
      },
    ],
    length: 3,
  },
  {
    kind: 'cross-realm-tojson',
  },
  {
    kind: 'getter-order-object',
  },
]

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 1_831_565_813
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function randomBoolean(random: () => number): boolean {
  return random() < 0.5
}

function randomInt(random: () => number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1
  return Math.floor(random() * span) + minInclusive
}

function randomString(random: () => number, minLength: number, maxLength: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const length = randomInt(random, minLength, maxLength)
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[randomInt(random, 0, alphabet.length - 1)]
  }

  return value
}

function serializeDescriptor(descriptor: Descriptor): string {
  return JSON.stringify(descriptor)
}

function descriptorComplexity(descriptor: Descriptor): number {
  switch (descriptor.kind) {
    case 'array': {
      return (
        1 +
        descriptor.length +
        descriptor.items.reduce((total, item) => total + descriptorComplexity(item), 0)
      )
    }

    case 'object': {
      return (
        1 +
        descriptor.entries.reduce(
          (total, entry) => total + entry.key.length + descriptorComplexity(entry.value),
          0,
        )
      )
    }

    case 'raw-json': {
      return 1 + descriptor.text.length
    }

    case 'string': {
      return 1 + descriptor.value.length
    }

    case 'string-wrapper': {
      return 1 + descriptor.value.length
    }

    case 'symbol': {
      return 1 + descriptor.description.length
    }

    case 'symbol-object': {
      return 1 + descriptor.description.length
    }

    case 'tojson-object': {
      return 1 + descriptorComplexity(descriptor.nested ?? { kind: 'null' })
    }

    case 'typed-array': {
      return 1 + descriptor.values.length
    }

    default: {
      return 1
    }
  }
}

function simplifyDescriptor(descriptor: Descriptor): Descriptor[] {
  const candidates: Descriptor[] = [{ kind: 'null' }]

  switch (descriptor.kind) {
    case 'array': {
      candidates.push({ kind: 'array', includeExtra: false, items: [], length: 0 })
      if (descriptor.items.length > 0) {
        candidates.push({
          ...descriptor,
          items: descriptor.items.slice(0, descriptor.items.length - 1),
          length: Math.min(descriptor.length, descriptor.items.length - 1),
        })

        descriptor.items.forEach((item, index) => {
          for (const simplified of simplifyDescriptor(item)) {
            const items = [...descriptor.items]
            items[index] = simplified
            candidates.push({ ...descriptor, items })
          }
        })
      }
      return candidates
    }

    case 'object': {
      candidates.push({ kind: 'object', includeHidden: false, entries: [] })
      if (descriptor.entries.length > 0) {
        descriptor.entries.forEach((entry, index) => {
          candidates.push({
            ...descriptor,
            entries: descriptor.entries.filter((_, entryIndex) => entryIndex !== index),
          })

          for (const simplified of simplifyDescriptor(entry.value)) {
            const entries = [...descriptor.entries]
            entries[index] = { ...entry, value: simplified }
            candidates.push({ ...descriptor, entries })
          }
        })
      }
      return candidates
    }

    case 'number': {
      if (descriptor.value !== 0) {
        candidates.push({ kind: 'number', value: 0 })
      }
      return candidates
    }

    case 'string': {
      if (descriptor.value.length > 0) {
        candidates.push({ kind: 'string', value: '' })
      }
      return candidates
    }

    case 'number-wrapper': {
      candidates.push({
        kind: 'number-wrapper',
        value: 0,
        toPrimitive: null,
        throwOnPrimitive: false,
      })
      return candidates
    }

    case 'string-wrapper': {
      candidates.push({
        kind: 'string-wrapper',
        value: '',
        toPrimitive: null,
        throwOnPrimitive: false,
      })
      return candidates
    }

    case 'tojson-object': {
      candidates.push({ ...descriptor, mode: 'null', nested: null, numberValue: 0, textValue: '' })
      if (descriptor.nested !== null) {
        for (const simplified of simplifyDescriptor(descriptor.nested)) {
          candidates.push({ ...descriptor, nested: simplified })
        }
      }
      return candidates
    }

    case 'typed-array': {
      candidates.push({ ...descriptor, values: [] })
      if (descriptor.values.length > 0) {
        candidates.push({
          ...descriptor,
          values: descriptor.values.slice(0, descriptor.values.length - 1),
        })
      }
      return candidates
    }

    default: {
      return candidates
    }
  }
}

function minimizeDescriptor(
  descriptor: Descriptor,
  hasFailure: (candidate: Descriptor) => boolean,
): Descriptor {
  let best = descriptor
  let improved = true

  while (improved) {
    improved = false

    for (const candidate of simplifyDescriptor(best)) {
      if (descriptorComplexity(candidate) >= descriptorComplexity(best)) {
        continue
      }

      if (!hasFailure(candidate)) {
        continue
      }

      best = candidate
      improved = true
      break
    }
  }

  return best
}

function deepEqualIgnoringObjectOrder(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqualIgnoringObjectOrder(left[index], right[index])) {
        return false
      }
    }

    return true
  }

  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord).sort()
    const rightKeys = Object.keys(rightRecord).sort()

    if (leftKeys.length !== rightKeys.length) {
      return false
    }

    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) {
        return false
      }
    }

    for (const key of leftKeys) {
      if (!deepEqualIgnoringObjectOrder(leftRecord[key], rightRecord[key])) {
        return false
      }
    }

    return true
  }

  return false
}

function isArrayIndexKey(key: string): boolean {
  const asNumber = Number(key)

  if (!Number.isInteger(asNumber)) {
    return false
  }

  if (asNumber < 0 || asNumber >= 4_294_967_295) {
    return false
  }

  return String(asNumber) === key
}

function assertCanonicalKeyOrder(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      assertCanonicalKeyOrder(item)
    })
    return
  }

  if (typeof value !== 'object' || value === null) {
    return
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)

  // JSON.parse reorders array-index keys before other keys. When that happens,
  // parsed object key order cannot be used to validate canonical serialized order.
  if (!keys.some((key) => isArrayIndexKey(key))) {
    const sorted = [...keys].sort()

    if (JSON.stringify(keys) !== JSON.stringify(sorted)) {
      throw new Error(`keys are not canonical-sorted: ${JSON.stringify(keys)}`)
    }
  }

  Object.values(record).forEach((item) => {
    assertCanonicalKeyOrder(item)
  })
}

function buildValue(descriptor: Descriptor): unknown {
  switch (descriptor.kind) {
    case 'array': {
      const value: unknown[] = new Array(descriptor.length)
      descriptor.items.forEach((item, index) => {
        if (index < descriptor.length) {
          value[index] = buildValue(item)
        }
      })

      if (descriptor.includeExtra) {
        ;(value as unknown as { extra?: unknown }).extra = buildValue({
          kind: 'string',
          value: 'extra',
        })
      }

      return value
    }

    case 'bigint-wrapper': {
      return Object(BigInt(descriptor.value))
    }

    case 'boolean': {
      return descriptor.value
    }

    case 'boolean-wrapper': {
      return new Boolean(descriptor.value)
    }

    case 'collection': {
      if (descriptor.variant === 'map') {
        return new Map([[1, 2]])
      }

      return new Set([1, 2])
    }

    case 'cross-realm-tojson': {
      const context = vm.createContext({})
      return vm.runInContext('({ toJSON(){ return {a:1,b:2} } })', context)
    }

    case 'date': {
      return new Date(descriptor.timestamp ?? Number.NaN)
    }

    case 'function': {
      const value = function value() {
        return true
      }
      return value
    }

    case 'getter-order-object': {
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

      return value
    }

    case 'null': {
      return null
    }

    case 'number': {
      return descriptor.value
    }

    case 'number-wrapper': {
      const value = new Number(descriptor.value) as {
        [Symbol.toPrimitive]?: (hint: string) => number
      }

      if (descriptor.throwOnPrimitive) {
        value[Symbol.toPrimitive] = () => {
          throw new Error('number primitive boom')
        }
      } else if (descriptor.toPrimitive !== null) {
        const primitive = descriptor.toPrimitive
        value[Symbol.toPrimitive] = () => primitive
      }

      return value
    }

    case 'object': {
      const value: Record<string, unknown> = {}

      descriptor.entries.forEach((entry) => {
        value[entry.key] = buildValue(entry.value)
      })

      if (descriptor.includeHidden) {
        Object.defineProperty(value, 'hidden', {
          enumerable: false,
          value: 1,
        })
      }

      return value
    }

    case 'raw-json': {
      const jsonWithRaw = JSON as typeof JSON & {
        rawJSON?: (text: string) => unknown
      }

      return typeof jsonWithRaw.rawJSON === 'function'
        ? jsonWithRaw.rawJSON(descriptor.text)
        : { rawJSON: descriptor.text }
    }

    case 'string': {
      return descriptor.value
    }

    case 'string-wrapper': {
      const value = new String(descriptor.value) as {
        [Symbol.toPrimitive]?: (hint: string) => string
      }

      if (descriptor.throwOnPrimitive) {
        value[Symbol.toPrimitive] = () => {
          throw new Error('string primitive boom')
        }
      } else if (descriptor.toPrimitive !== null) {
        const primitive = descriptor.toPrimitive
        value[Symbol.toPrimitive] = () => primitive
      }

      return value
    }

    case 'symbol': {
      return Symbol(descriptor.description)
    }

    case 'symbol-object': {
      return Object(Symbol(descriptor.description))
    }

    case 'tojson-object': {
      const mode = descriptor.mode
      const nested = descriptor.nested
      const numberValue = descriptor.numberValue
      const textValue = descriptor.textValue

      return {
        marker: 'marker',
        toJSON(key: string) {
          if (mode === 'array-mixed') {
            return [1, undefined, 2]
          }

          if (mode === 'bigint') {
            return BigInt(numberValue)
          }

          if (mode === 'function') {
            return () => true
          }

          if (mode === 'key-length') {
            return key.length
          }

          if (mode === 'null') {
            return null
          }

          if (mode === 'number') {
            return numberValue
          }

          if (mode === 'object-nested') {
            return nested === null ? null : buildValue(nested)
          }

          if (mode === 'string') {
            return textValue
          }

          if (mode === 'symbol') {
            return Symbol('tojson-symbol')
          }

          return undefined
        },
      }
    }

    case 'typed-array': {
      if (descriptor.variant === 'uint8') {
        return new Uint8Array(descriptor.values as number[])
      }

      if (descriptor.variant === 'float64') {
        return new Float64Array(descriptor.values as number[])
      }

      if (descriptor.variant === 'bigint64') {
        return new BigInt64Array((descriptor.values as string[]).map((value) => BigInt(value)))
      }

      return new BigUint64Array((descriptor.values as string[]).map((value) => BigInt(value)))
    }

    case 'undefined': {
      return undefined
    }
  }
}

function generatePrimitiveDescriptor(random: () => number): GeneratedCase {
  const type = randomInt(random, 0, 6)

  if (type === 0) {
    return { bucket: 'primitive', descriptor: { kind: 'null' } }
  }

  if (type === 1) {
    return { bucket: 'primitive', descriptor: { kind: 'boolean', value: randomBoolean(random) } }
  }

  if (type === 2) {
    const finite = randomBoolean(random)
    const value = finite
      ? Number((random() * 100 - 50).toFixed(randomInt(random, 0, 4)))
      : randomBoolean(random)
        ? Infinity
        : -Infinity

    return { bucket: 'primitive', descriptor: { kind: 'number', value } }
  }

  if (type === 3) {
    return {
      bucket: 'primitive',
      descriptor: { kind: 'string', value: randomString(random, 0, 10) },
    }
  }

  if (type === 4) {
    return { bucket: 'non-json-value', descriptor: { kind: 'undefined' } }
  }

  if (type === 5) {
    return {
      bucket: 'non-json-value',
      descriptor: { kind: 'symbol', description: randomString(random, 0, 5) },
    }
  }

  return { bucket: 'non-json-value', descriptor: { kind: 'function' } }
}

function generateWrapperDescriptor(random: () => number): GeneratedCase {
  const type = randomInt(random, 0, 6)

  if (type === 0) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'number-wrapper',
        throwOnPrimitive: false,
        toPrimitive: null,
        value: randomInt(random, -20, 20),
      },
    }
  }

  if (type === 1) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'number-wrapper',
        throwOnPrimitive: false,
        toPrimitive: Number((random() * 20 - 10).toFixed(2)),
        value: randomInt(random, -20, 20),
      },
    }
  }

  if (type === 2) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'number-wrapper',
        throwOnPrimitive: true,
        toPrimitive: null,
        value: randomInt(random, -20, 20),
      },
    }
  }

  if (type === 3) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'string-wrapper',
        throwOnPrimitive: false,
        toPrimitive: null,
        value: randomString(random, 0, 8),
      },
    }
  }

  if (type === 4) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'string-wrapper',
        throwOnPrimitive: false,
        toPrimitive: randomString(random, 0, 8),
        value: randomString(random, 0, 8),
      },
    }
  }

  if (type === 5) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'string-wrapper',
        throwOnPrimitive: true,
        toPrimitive: null,
        value: randomString(random, 0, 8),
      },
    }
  }

  if (type === 6) {
    return {
      bucket: 'wrapper',
      descriptor: {
        kind: 'boolean-wrapper',
        value: randomBoolean(random),
      },
    }
  }

  return {
    bucket: 'wrapper',
    descriptor: {
      kind: 'bigint-wrapper',
      value: String(randomInt(random, 0, 9)),
    },
  }
}

function generateTypedArrayDescriptor(random: () => number): GeneratedCase {
  const variantIndex = randomInt(random, 0, 3)

  if (variantIndex === 0) {
    return {
      bucket: 'typed-array',
      descriptor: {
        kind: 'typed-array',
        values: [randomInt(random, 0, 255), randomInt(random, 0, 255)],
        variant: 'uint8',
      },
    }
  }

  if (variantIndex === 1) {
    return {
      bucket: 'typed-array',
      descriptor: {
        kind: 'typed-array',
        values: [Number((random() * 20 - 10).toFixed(2))],
        variant: 'float64',
      },
    }
  }

  if (variantIndex === 2) {
    return {
      bucket: 'typed-array',
      descriptor: {
        kind: 'typed-array',
        values: [String(randomInt(random, 0, 9))],
        variant: 'bigint64',
      },
    }
  }

  return {
    bucket: 'typed-array',
    descriptor: {
      kind: 'typed-array',
      values: [String(randomInt(random, 0, 9))],
      variant: 'biguint64',
    },
  }
}

function generateToJsonDescriptor(random: () => number, depth: number): GeneratedCase {
  const modeIndex = randomInt(random, 0, 9)
  const modes: ToJsonMode[] = [
    'array-mixed',
    'bigint',
    'function',
    'key-length',
    'null',
    'number',
    'object-nested',
    'string',
    'symbol',
    'undefined',
  ]

  const mode = modes[modeIndex]

  return {
    bucket: 'tojson',
    descriptor: {
      kind: 'tojson-object',
      mode,
      nested:
        mode === 'object-nested' && depth < 3
          ? generateDescriptor(random, depth + 1).descriptor
          : null,
      numberValue: randomInt(random, -9, 9),
      textValue: randomString(random, 0, 8),
    },
  }
}

function generateArrayDescriptor(random: () => number, depth: number): GeneratedCase {
  const length = randomInt(random, 0, 6)
  const itemCount = randomInt(random, 0, length)
  const items: Descriptor[] = []

  for (let index = 0; index < itemCount; index += 1) {
    items.push(generateDescriptor(random, depth + 1).descriptor)
  }

  return {
    bucket: 'array',
    descriptor: {
      kind: 'array',
      includeExtra: randomBoolean(random),
      items,
      length,
    },
  }
}

function generateObjectDescriptor(random: () => number, depth: number): GeneratedCase {
  const entriesCount = randomInt(random, 0, 6)
  const entries: Array<{ key: string; value: Descriptor }> = []

  for (let index = 0; index < entriesCount; index += 1) {
    const generatedKey = randomString(random, 0, 6)
    entries.push({
      key: generatedKey.length > 0 ? generatedKey : String(randomInt(random, 0, 20)),
      value: generateDescriptor(random, depth + 1).descriptor,
    })
  }

  return {
    bucket: 'object',
    descriptor: {
      kind: 'object',
      entries,
      includeHidden: randomBoolean(random),
    },
  }
}

function generateDescriptor(random: () => number, depth: number): GeneratedCase {
  if (depth >= 4) {
    const leafType = randomInt(random, 0, 4)
    if (leafType === 0) return generatePrimitiveDescriptor(random)
    if (leafType === 1) return generateWrapperDescriptor(random)
    if (leafType === 2) return generateTypedArrayDescriptor(random)
    if (leafType === 3)
      return {
        bucket: 'date',
        descriptor: {
          kind: 'date',
          timestamp: randomBoolean(random) ? randomInt(random, 0, 2_100_000_000_000) : null,
        },
      }
    return {
      bucket: 'collection',
      descriptor: { kind: 'collection', variant: randomBoolean(random) ? 'map' : 'set' },
    }
  }

  const type = randomInt(random, 0, 11)

  if (type === 0) return generatePrimitiveDescriptor(random)
  if (type === 1) return generateArrayDescriptor(random, depth)
  if (type === 2) return generateObjectDescriptor(random, depth)
  if (type === 3) return generateWrapperDescriptor(random)
  if (type === 4) return generateToJsonDescriptor(random, depth)
  if (type === 5) {
    return {
      bucket: 'date',
      descriptor: {
        kind: 'date',
        timestamp: randomBoolean(random) ? randomInt(random, 0, 2_100_000_000_000) : null,
      },
    }
  }

  if (type === 6) return generateTypedArrayDescriptor(random)

  if (type === 7) {
    return {
      bucket: 'collection',
      descriptor: { kind: 'collection', variant: randomBoolean(random) ? 'map' : 'set' },
    }
  }

  if (type === 8) {
    return { bucket: 'cross-realm-tojson', descriptor: { kind: 'cross-realm-tojson' } }
  }

  if (type === 9) {
    return { bucket: 'getter-order', descriptor: { kind: 'getter-order-object' } }
  }

  if (type === 10) {
    if (HAS_RAW_JSON_SUPPORT) {
      return { bucket: 'raw-json', descriptor: { kind: 'raw-json', text: '123' } }
    }

    return { bucket: 'wrapper', descriptor: { kind: 'symbol-object', description: 's' } }
  }

  return { bucket: 'wrapper', descriptor: { kind: 'symbol-object', description: 's' } }
}

function buildMandatoryCases(): GeneratedCase[] {
  const cases: GeneratedCase[] = [
    { bucket: 'primitive', descriptor: { kind: 'number', value: 1 } },
    { bucket: 'non-json-value', descriptor: { kind: 'undefined' } },
    {
      bucket: 'array',
      descriptor: {
        kind: 'array',
        includeExtra: true,
        items: [{ kind: 'number', value: 1 }],
        length: 3,
      },
    },
    {
      bucket: 'object',
      descriptor: {
        kind: 'object',
        includeHidden: true,
        entries: [
          { key: 'b', value: { kind: 'number', value: 2 } },
          { key: 'a', value: { kind: 'number', value: 1 } },
        ],
      },
    },
    {
      bucket: 'wrapper',
      descriptor: {
        kind: 'number-wrapper',
        throwOnPrimitive: false,
        toPrimitive: 7,
        value: 3,
      },
    },
    {
      bucket: 'date',
      descriptor: { kind: 'date', timestamp: null },
    },
    {
      bucket: 'typed-array',
      descriptor: { kind: 'typed-array', variant: 'uint8', values: [1, 2] },
    },
    {
      bucket: 'collection',
      descriptor: { kind: 'collection', variant: 'map' },
    },
    {
      bucket: 'tojson',
      descriptor: {
        kind: 'tojson-object',
        mode: 'object-nested',
        nested: {
          kind: 'object',
          includeHidden: false,
          entries: [{ key: 'z', value: { kind: 'number', value: 1 } }],
        },
        numberValue: 1,
        textValue: 'x',
      },
    },
    { bucket: 'cross-realm-tojson', descriptor: { kind: 'cross-realm-tojson' } },
    { bucket: 'getter-order', descriptor: { kind: 'getter-order-object' } },
  ]

  if (HAS_RAW_JSON_SUPPORT) {
    cases.push({ bucket: 'raw-json', descriptor: { kind: 'raw-json', text: '123' } })
  }

  return cases
}

function runSerializer(
  descriptor: Descriptor,
  serializer: (value: unknown) => string | undefined,
): SerializerOutcome {
  try {
    return {
      kind: 'success',
      output: serializer(buildValue(descriptor)),
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    return {
      kind: 'throw',
      errorName: name,
    }
  }
}

function evaluateParity(descriptor: Descriptor): string | null {
  const jsonResult = runSerializer(descriptor, (value: unknown) => JSON.stringify(value))
  const canonicalResult = runSerializer(descriptor, canonicalize)

  if (jsonResult.kind !== canonicalResult.kind) {
    return `throw mismatch: JSON=${JSON.stringify(jsonResult)} CANON=${JSON.stringify(canonicalResult)}`
  }

  if (jsonResult.kind === 'throw' && canonicalResult.kind === 'throw') {
    return jsonResult.errorName === canonicalResult.errorName
      ? null
      : `error type mismatch: JSON=${jsonResult.errorName} CANON=${canonicalResult.errorName}`
  }

  if (jsonResult.kind === 'success' && canonicalResult.kind === 'success') {
    if (jsonResult.output === undefined || canonicalResult.output === undefined) {
      return jsonResult.output === canonicalResult.output
        ? null
        : `undefined mismatch: JSON=${String(jsonResult.output)} CANON=${String(canonicalResult.output)}`
    }

    let jsonValue: unknown
    let canonicalValue: unknown

    try {
      jsonValue = JSON.parse(jsonResult.output)
      canonicalValue = JSON.parse(canonicalResult.output)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `parse mismatch: ${message} JSON=${jsonResult.output} CANON=${canonicalResult.output}`
    }

    return deepEqualIgnoringObjectOrder(jsonValue, canonicalValue)
      ? null
      : `value mismatch: JSON=${jsonResult.output} CANON=${canonicalResult.output}`
  }

  return 'unexpected serializer state'
}

function verifyCanonicalInvariants(descriptor: Descriptor): string | null {
  const canonicalResult = runSerializer(descriptor, canonicalize)

  if (canonicalResult.kind === 'throw' || canonicalResult.output === undefined) {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(canonicalResult.output)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `canonical output is not valid JSON: ${message}`
  }

  try {
    assertCanonicalKeyOrder(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `canonical key ordering invariant failed: ${message}`
  }

  const idempotent = canonicalize(parsed)
  if (idempotent !== canonicalResult.output) {
    return `idempotence failed: expected ${canonicalResult.output} got ${String(idempotent)}`
  }

  const deterministic = canonicalize(buildValue(descriptor))
  if (deterministic !== canonicalResult.output) {
    return `determinism failed: expected ${canonicalResult.output} got ${String(deterministic)}`
  }

  return null
}

function evaluateDescriptor(descriptor: Descriptor): string | null {
  const parityFailure = evaluateParity(descriptor)
  if (parityFailure !== null) {
    return parityFailure
  }

  return verifyCanonicalInvariants(descriptor)
}

function runDescriptor(descriptor: Descriptor, bucket: Bucket): FailureDetails | null {
  const reason = evaluateDescriptor(descriptor)
  return reason === null ? null : { bucket, reason }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resolveIterations(): number {
  const defaultIterations = process.env.CI === 'true' ? 3000 : 800
  return parsePositiveInteger(process.env.CANON_FUZZ_ITERATIONS, defaultIterations)
}

function resolveSeeds(): number[] {
  const seedList = process.env.CANON_FUZZ_SEEDS

  if (seedList !== undefined && seedList.trim().length > 0) {
    return seedList
      .split(',')
      .map((segment) => Number(segment.trim()))
      .filter((value) => Number.isInteger(value))
      .map((value) => value >>> 0)
  }

  const seed = process.env.CANON_FUZZ_SEED
  if (seed !== undefined && seed.length > 0 && Number.isInteger(Number(seed))) {
    return [Number(seed) >>> 0]
  }

  return process.env.CI === 'true'
    ? [12_648_430, 305_419_896, 3_735_928_559]
    : [12_648_430, 305_419_896]
}

function runSeed(seed: number, iterations: number): void {
  const random = createMulberry32(seed)
  const coverage = new Map<Bucket, number>()

  for (const { bucket } of buildMandatoryCases()) {
    coverage.set(bucket, 0)
  }

  const generated: GeneratedCase[] = [...buildMandatoryCases()]

  for (let index = 0; index < iterations; index += 1) {
    generated.push(generateDescriptor(random, 0))
  }

  for (let index = 0; index < generated.length; index += 1) {
    const generatedCase = generated[index]
    coverage.set(generatedCase.bucket, (coverage.get(generatedCase.bucket) ?? 0) + 1)

    const failure = runDescriptor(generatedCase.descriptor, generatedCase.bucket)

    if (failure === null) {
      continue
    }

    const minimized = minimizeDescriptor(
      generatedCase.descriptor,
      (candidate) => runDescriptor(candidate, generatedCase.bucket) !== null,
    )

    throw new Error(
      [
        `fuzz failure`,
        `seed=${seed}`,
        `iteration=${index}`,
        `bucket=${generatedCase.bucket}`,
        `reason=${failure.reason}`,
        `descriptor=${serializeDescriptor(generatedCase.descriptor)}`,
        `minimized=${serializeDescriptor(minimized)}`,
      ].join('\n'),
    )
  }

  for (const [bucket, count] of coverage) {
    if (count === 0) {
      throw new Error(`coverage failure: bucket ${bucket} was not exercised for seed ${seed}`)
    }
  }
}

describe('property-corpus-replay', () => {
  it('replays-persisted-corpus-descriptors', () => {
    CORPUS_DESCRIPTORS.forEach((descriptor, index) => {
      const failure = runDescriptor(descriptor, 'primitive')
      if (failure !== null) {
        throw new Error(
          [
            `corpus case failed`,
            `index=${index}`,
            `reason=${failure.reason}`,
            `descriptor=${serializeDescriptor(descriptor)}`,
          ].join('\n'),
        )
      }
    })
  })
})

describe('property-json-semantic-parity-except-intentional-differences', () => {
  it('matches-json-stringify-semantics-under-deterministic-seeded-fuzzing', () => {
    const iterations = resolveIterations()
    const seeds = resolveSeeds()

    seeds.forEach((seed) => {
      runSeed(seed, iterations)
    })
  })
})

describe('property-intentional-differences', () => {
  it('keeps-canonical-key-ordering-where-json-stringify-preserves-integer-index-ordering', () => {
    const input = { 2: 'b', 10: 'a' }

    expect(JSON.stringify(input)).toEqual('{"2":"b","10":"a"}')
    expect(canonicalize(input)).toEqual('{"10":"a","2":"b"}')
  })
})
