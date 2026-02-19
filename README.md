# @escapace/canonicalize

Deterministic JSON serializer for JSON-like values that canonicalizes object key order and preserves JSON.stringify value semantics. Key ordering uses lexicographic string code-unit order; for string keys this matches `Object.keys(obj).sort()`.

## Install

```bash
pnpm add @escapace/canonicalize
```

## Quick start

```ts
import { canonicalize } from '@escapace/canonicalize'

const value = {
  b: 2,
  a: 1,
  list: [{ y: 2, x: 1 }],
}

const output = canonicalize(value)
// '{"a":1,"b":2,"list":[{"x":1,"y":2}]}'
```

## Behavioral contract

When the return value is a string, the output is valid JSON and `JSON.parse(output)` succeeds.

For supported domains, value-handling semantics follow `JSON.stringify`, including:

- primitives and boxed primitives,
- `toJSON(key)` lookup and invocation behavior,
- own enumerable string-keyed properties (symbol keys are ignored),
- sparse arrays and `length`-driven index traversal,
- `Date` conversion through `Date.prototype.toJSON`,
- typed-array object-style serialization,
- circular-structure failure with `TypeError`.

### `undefined`, function, and symbol handling (by context)

Values with no JSON representation — `undefined`, symbols, and functions — propagate differently
depending on where they appear:

- Root: returns `undefined`.
- Object property: omitted from output.
- Array element: becomes `"null"`.

```ts
canonicalize(undefined) // undefined
canonicalize({ keep: 1, drop: undefined }) // '{"keep":1}'
canonicalize([1, undefined, 2]) // '[1,null,2]'
```

For TypeScript callers, `null`, `boolean`, `number`, and `string` inputs have a narrowed return
type of `string`. Object and `bigint` inputs remain `string | undefined` because their outcome
depends on `toJSON` dispatch at runtime.

## Intentional differences from `JSON.stringify`

- Object keys are emitted in canonical lexicographic order (string code-unit order).
- Replacer and spacing parameters are not part of the API.

Integer-like key ordering differs from `JSON.stringify` / `Object.keys` ordering:

```ts
JSON.stringify({ 2: 'b', 10: 'a' })
// '{"2":"b","10":"a"}'

canonicalize({ 2: 'b', 10: 'a' })
// '{"10":"a","2":"b"}'
```

## Edge cases and failure behavior

### BigInt

```ts
canonicalize(2n)
// throws TypeError
```

If `BigInt.prototype.toJSON` is defined, returned values from that hook are serialized, matching JSON behavior.

### Circular structures

```ts
const value: { self?: unknown } = {}
value.self = value

canonicalize(value)
// throws TypeError: Converting circular structure to JSON
```

### Raw JSON runtime support

When runtime support exists for `JSON.rawJSON` and `JSON.isRawJSON`, raw payload text is emitted from raw JSON values when `value.rawJSON` is a string.

When runtime support is not available, values are serialized with standard object/primitive rules.

# API

## function canonicalize [↗](src/index.ts#L293-L303 'canonicalize')

Converts a value to a canonical JSON string with object keys in lexicographic order.

```typescript
export declare function canonicalize(value: unknown): string | undefined
```

### Parameters

| Parameter | Type               | Description         |
| --------- | ------------------ | ------------------- |
| `value`   | <pre>unknown</pre> | Value to serialize. |

### Returns

A canonical JSON string, or `undefined` when the input has no JSON representation.

### Throws

1. TypeError When a `BigInt` value is encountered without `BigInt.prototype.toJSON` defined.
2. TypeError When the input contains a circular object reference.

### Remarks

Value semantics follow `JSON.stringify` for the supported domain, including `toJSON` lookup and invocation, boxed-primitive coercion, sparse-array traversal, `Date` conversion via `Date.prototype.toJSON`, and circular-structure detection.

Non-serializable values — `undefined`, symbols, and functions — yield `undefined` rather than a string. The enclosing container determines how that result propagates:

- At root, the function returns `undefined`.
- As an object property value, the property is omitted from output.
- As an array element, the element is serialized as `"null"`.

Two behaviors differ intentionally from `JSON.stringify`:

- Object keys are emitted in lexicographic string code-unit order, equivalent to `Object.keys(obj).sort()`. Integer-like keys follow the same order rather than the numeric-first ordering that `JSON.stringify` applies.
- Replacer and spacing parameters are not supported.

The return type is narrowed for primitive inputs whose outcome is determined before any `toJSON` call: `null`, `boolean`, `number`, and `string` inputs return `string`; `undefined` and `symbol` inputs return `undefined`. Object and `bigint` inputs remain `string | undefined` because their outcome depends on `toJSON` dispatch, which TypeScript cannot inspect statically.
