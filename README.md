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

For values that serialize to `undefined` under JSON rules (`undefined`, functions, and symbols):

- Root value: returns `undefined`.
- Object property value: omitted.
- Array element value: serialized as `null`.

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

## function canonicalize [↗](src/index.ts#L276-L286 'canonicalize')

Serializes a JSON-like value to a deterministic JSON string with canonical object key ordering.

```typescript
export declare function canonicalize(value: undefined): undefined
```

### Parameters

| Parameter | Type                 | Description               |
| --------- | -------------------- | ------------------------- |
| `value`   | <pre>undefined</pre> | Input value to serialize. |

### Returns

A canonical JSON string, or `undefined` when root serialization is `undefined` under JSON rules.

### Throws

TypeError When serialization encounters a `BigInt` without `BigInt.prototype.toJSON`, or a circular structure.

### Remarks

Value handling follows `JSON.stringify` semantics for supported domains, including `toJSON`, boxed primitives, sparse arrays, dates, typed arrays, and circular-structure errors.

Intentional differences from `JSON.stringify`:

- Object keys are emitted in canonical lexicographic order.
- Replacer and spacing parameters are not supported.
