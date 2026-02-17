/* eslint-disable typescript/no-unsafe-assignment */
/* eslint-disable typescript/no-explicit-any */

type JsonRawSupport = {
  isRawJSON?: (value: unknown) => boolean
} & typeof JSON

interface SerializationState {
  readonly stack: Set<object>
  readonly isRawJSON: (value: unknown) => boolean
}

const BIGINT_SERIALIZE_ERROR_MESSAGE = 'Do not know how to serialize a BigInt'

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isCallable(value: unknown): value is (...arguments_: any[]) => unknown {
  return typeof value === 'function'
}

function hasNumberData(value: object): boolean {
  try {
    Number.prototype.valueOf.call(value)
    return true
  } catch {
    return false
  }
}

function hasStringData(value: object): boolean {
  try {
    String.prototype.valueOf.call(value)
    return true
  } catch {
    return false
  }
}

function hasBooleanData(value: object): boolean {
  try {
    Boolean.prototype.valueOf.call(value)
    return true
  } catch {
    return false
  }
}

function hasBigIntData(value: object): boolean {
  try {
    BigInt.prototype.valueOf.call(value)
    return true
  } catch {
    return false
  }
}

function coercePrimitiveWrapper(value: object): unknown {
  if (hasNumberData(value)) {
    // JSON.stringify uses ToNumber for Number objects, which respects Symbol.toPrimitive.
    return Number(value)
  }

  if (hasStringData(value)) {
    // JSON.stringify uses ToString for String objects, which respects Symbol.toPrimitive.
    // eslint-disable-next-line typescript/no-base-to-string
    return String(value)
  }

  if (hasBooleanData(value)) {
    // JSON.stringify uses [[BooleanData]] directly for Boolean objects.
    return Boolean.prototype.valueOf.call(value)
  }

  if (hasBigIntData(value)) {
    // JSON.stringify uses [[BigIntData]] directly for BigInt objects.
    return BigInt.prototype.valueOf.call(value)
  }

  return value
}

function serializeArray(state: SerializationState, value: any[]): string {
  if (state.stack.has(value)) {
    throw new TypeError('Converting circular structure to JSON')
  }

  state.stack.add(value)

  try {
    const length = value.length >>> 0
    const serializedValues: string[] = []

    for (let index = 0; index < length; index += 1) {
      const serialized = serializeProperty(state, index.toString(), value)
      serializedValues.push(serialized ?? 'null')
    }

    return `[${serializedValues.join(',')}]`
  } finally {
    state.stack.delete(value)
  }
}

function serializeObject(state: SerializationState, value: Record<string, any>): string {
  if (state.stack.has(value)) {
    throw new TypeError('Converting circular structure to JSON')
  }

  state.stack.add(value)

  try {
    // Evaluate properties in JSON/Object.keys traversal order first, then emit in canonical order.
    // This preserves getter/toJSON side effects from visitation order while keeping deterministic output.
    const traversalKeys = Object.keys(value)
    const serializedByKey = new Map<string, string | undefined>()

    for (const key of traversalKeys) {
      serializedByKey.set(key, serializeProperty(state, key, value))
    }

    const outputKeys = [...traversalKeys].sort()
    const serializedValues: string[] = []

    for (const key of outputKeys) {
      const serialized = serializedByKey.get(key)
      if (serialized !== undefined) {
        serializedValues.push(`${JSON.stringify(key)}:${serialized}`)
      }
    }

    return `{${serializedValues.join(',')}}`
  } finally {
    state.stack.delete(value)
  }
}

function getValueProperty(value: bigint | object, property: string): unknown {
  return Reflect.get(Object(value), property)
}

function serializeProperty(
  state: SerializationState,
  key: string,
  holder: Record<string, any>,
): string | undefined {
  let value = holder[key]

  if (isObjectLike(value) || typeof value === 'bigint') {
    const toJSON = getValueProperty(value, 'toJSON')
    if (isCallable(toJSON)) {
      value = toJSON.call(value, key)
    }
  }

  if (isObjectLike(value)) {
    value = coercePrimitiveWrapper(value)
  }

  if (value === null) {
    return 'null'
  }

  if (value === true) {
    return 'true'
  }

  if (value === false) {
    return 'false'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : 'null'
  }

  if (typeof value === 'bigint') {
    throw new TypeError(BIGINT_SERIALIZE_ERROR_MESSAGE)
  }

  if (isObjectLike(value) && state.isRawJSON(value)) {
    const rawJSON = Reflect.get(value, 'rawJSON')
    if (typeof rawJSON === 'string') {
      return rawJSON
    }
  }

  if (isObjectLike(value) && !isCallable(value)) {
    if (Array.isArray(value)) {
      return serializeArray(state, value)
    }

    return serializeObject(state, value as Record<string, any>)
  }

  return undefined
}

/**
 * Serializes a JSON-like value to a deterministic JSON string with canonical object key ordering.
 *
 * @remarks
 * Value handling follows `JSON.stringify` semantics for supported domains, including `toJSON`,
 * boxed primitives, sparse arrays, dates, typed arrays, and circular-structure errors.
 *
 * Intentional differences from `JSON.stringify`:
 *
 * - Object keys are emitted in canonical lexicographic order.
 *
 * - Replacer and spacing parameters are not supported.
 *
 * @param value - Input value to serialize.
 * @returns A canonical JSON string, or `undefined` when root serialization is `undefined` under JSON rules.
 * @throws TypeError When serialization encounters a `BigInt` without `BigInt.prototype.toJSON`, or a circular structure.
 */
export function canonicalize(value: undefined): undefined
export function canonicalize(value: unknown): string | undefined
export function canonicalize(value: unknown): string | undefined {
  const json = JSON as JsonRawSupport
  const state: SerializationState = {
    stack: new Set(),
    isRawJSON(candidate: unknown): boolean {
      return typeof json.isRawJSON === 'function' && json.isRawJSON(candidate)
    },
  }

  return serializeProperty(state, '', { '': value })
}
