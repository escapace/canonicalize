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

function coercePrimitiveWrapper(value: object): unknown {
  const tag = Object.prototype.toString.call(value)
  const constructor = (value as { constructor?: unknown }).constructor

  if (tag === '[object Number]' && constructor !== Object) {
    // JSON.stringify uses ToNumber for Number objects, which respects Symbol.toPrimitive.
    return Number(value)
  }

  if (tag === '[object String]' && constructor !== Object) {
    // JSON.stringify uses ToString for String objects, which respects Symbol.toPrimitive.
    // eslint-disable-next-line typescript/no-base-to-string
    return String(value)
  }

  if (tag === '[object Boolean]' && constructor !== Object) {
    // JSON.stringify uses [[BooleanData]] directly for Boolean objects.
    return Boolean.prototype.valueOf.call(value)
  }

  if (tag === '[object BigInt]' && constructor !== Object) {
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
    let output = '['

    for (let index = 0; index < length; index += 1) {
      if (index > 0) {
        output += ','
      }

      const element = value[index]

      if (element === null) {
        output += 'null'
        continue
      }

      if (element === true) {
        output += 'true'
        continue
      }

      if (element === false) {
        output += 'false'
        continue
      }

      if (typeof element === 'string') {
        output += JSON.stringify(element)
        continue
      }

      if (typeof element === 'number') {
        output += Number.isFinite(element) ? element.toString() : 'null'
        continue
      }

      if (element === undefined || typeof element === 'function' || typeof element === 'symbol') {
        output += 'null'
        continue
      }

      output += serializeValue(state, index.toString(), element) ?? 'null'
    }

    output += ']'
    return output
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
    const keyCount = traversalKeys.length

    if (keyCount === 0) {
      return '{}'
    }

    if (keyCount === 1) {
      const onlyKey = traversalKeys[0]
      const serialized = serializeValue(state, onlyKey, value[onlyKey])
      if (serialized === undefined) {
        return '{}'
      }

      return '{' + JSON.stringify(onlyKey) + ':' + serialized + '}'
    }

    const serializedByKey = new Map<string, string | undefined>()

    for (let index = 0; index < keyCount; index += 1) {
      const key = traversalKeys[index]
      serializedByKey.set(key, serializeValue(state, key, value[key]))
    }

    traversalKeys.sort()
    let output = '{'
    let isFirst = true

    for (let index = 0; index < keyCount; index += 1) {
      const key = traversalKeys[index]
      const serialized = serializedByKey.get(key)
      if (serialized !== undefined) {
        if (!isFirst) {
          output += ','
        }

        output += JSON.stringify(key)
        output += ':'
        output += serialized
        isFirst = false
      }
    }

    output += '}'
    return output
  } finally {
    state.stack.delete(value)
  }
}

function getValueProperty(value: bigint | object, property: string): unknown {
  return Reflect.get(Object(value), property)
}

function serializeValue(
  state: SerializationState,
  key: string,
  inputValue: unknown,
): string | undefined {
  let value = inputValue

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

  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }

  const toJSON = getValueProperty(value as bigint | object, 'toJSON')
  if (isCallable(toJSON)) {
    value = toJSON.call(value, key)
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

  if (isObjectLike(value)) {
    if (Array.isArray(value)) {
      return serializeArray(state, value)
    }

    return serializeObject(state, value as Record<string, any>)
  }

  return undefined
}

/**
 * Converts a value to a canonical JSON string with object keys in lexicographic order.
 *
 * @remarks
 * Value semantics follow `JSON.stringify` for the supported domain, including `toJSON` lookup
 * and invocation, boxed-primitive coercion, sparse-array traversal, `Date` conversion via
 * `Date.prototype.toJSON`, and circular-structure detection.
 *
 * Non-serializable values — `undefined`, symbols, and functions — yield `undefined` rather
 * than a string. The enclosing container determines how that result propagates:
 *
 * - At root, the function returns `undefined`.
 *
 * - As an object property value, the property is omitted from output.
 *
 * - As an array element, the element is serialized as `"null"`.
 *
 * Two behaviors differ intentionally from `JSON.stringify`:
 *
 * - Object keys are emitted in lexicographic string code-unit order, equivalent to
 *   `Object.keys(obj).sort()`. Integer-like keys follow the same order rather than the
 *   numeric-first ordering that `JSON.stringify` applies.
 *
 * - Replacer and spacing parameters are not supported.
 *
 * The return type is narrowed for primitive inputs whose outcome is determined before any
 * `toJSON` call: `null`, `boolean`, `number`, and `string` inputs return `string`; `undefined`
 * and `symbol` inputs return `undefined`. Object and `bigint` inputs remain `string | undefined`
 * because their outcome depends on `toJSON` dispatch, which TypeScript cannot inspect statically.
 *
 * @param value - Value to serialize.
 * @returns A canonical JSON string, or `undefined` when the input has no JSON representation.
 * @throws TypeError When a `BigInt` value is encountered without `BigInt.prototype.toJSON` defined.
 * @throws TypeError When the input contains a circular object reference.
 */
export function canonicalize(value: symbol | undefined): undefined
export function canonicalize(value: boolean | number | string | null): string
export function canonicalize(value: unknown): string | undefined
export function canonicalize(value: unknown): string | undefined {
  const json = JSON as JsonRawSupport
  const state: SerializationState = {
    stack: new Set(),
    isRawJSON(candidate: unknown): boolean {
      return typeof json.isRawJSON === 'function' && json.isRawJSON(candidate)
    },
  }

  return serializeValue(state, '', value)
}
