/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright © 2020-2023 Truestamp Inc. All rights reserved.

/**
 * The zeroth value gets no prepended comma
 * @hidden
 */
function hasComma(number_: number): string {
  return number_ === 0 ? '' : ','
}

/**
 * Convert a JSON serializable object to a canonicalized string.
 * @param object The object to convert.
 * @return The canonicalized string or undefined.
 */
export function canonicalize(object: undefined): undefined
export function canonicalize(object: any): string
export function canonicalize(object: any): string | undefined {
  // See : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
  if (
    object === null ||
    object === undefined ||
    typeof object === 'boolean' ||
    typeof object === 'number' ||
    typeof object === 'string'
  ) {
    return JSON.stringify(object)
  }

  if (typeof object === 'bigint') {
    throw new TypeError("BigInt value can't be serialized in JSON")
  }

  if (typeof object === 'function' || typeof object === 'symbol') {
    return canonicalize(undefined)
  }

  // Classes with a `toJSON` function, or Objects with a `toJSON` key where the value
  // is a Function are serialized using `toJSON()`.
  if (object.toJSON instanceof Function) {
    return canonicalize(object.toJSON())
  }

  if (Array.isArray(object)) {
    const values = object.reduce((t: any, cv: any, ci: number): string => {
      // In Arrays, undefined, symbols, and functions are replaced with null
      const value =
        cv === undefined || typeof cv === 'symbol' || typeof cv === 'function'
          ? null
          : cv
      // total,value
      return `${t}${hasComma(ci)}${canonicalize(value)}`
    }, '')

    return `[${values}]`
  }

  const values = Object.keys(object as Record<any, any>)
    .sort()
    .reduce((t: string, cv: string): string => {
      // In Objects the key:value is not added if value is undefined, symbol, or function.
      if (
        object[cv] === undefined ||
        typeof object[cv] === 'symbol' ||
        typeof object[cv] === 'function'
      ) {
        return t
      }

      // total,key:value
      return `${t}${hasComma(t.length)}${canonicalize(cv)}:${canonicalize(
        object[cv]
      )}`
    }, '')
  return `{${values}}`
}
