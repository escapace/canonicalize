/* eslint-disable typescript/no-unsafe-assignment */
// Copyright © 2020-2023 Truestamp Inc. All rights reserved.

import { expect, test } from 'vitest'

import fs from 'node:fs'
import { readJsonSync } from 'fs-extra'
import { canonicalize } from '../src/index'

const encodeUtf8 = (value: string) => new TextEncoder().encode(value)

const toHex = (string?: string | Uint8Array) =>
  string === undefined ? undefined : Buffer.from(string).toString('hex')

test('arrays', () => {
  const input = readJsonSync('test/testdata/input/arrays.json')
  const expected = fs.readFileSync('test/testdata/output/arrays.json', 'utf8').trim()
  const expectedHex = fs
    .readFileSync('test/testdata/outhex/arrays.txt', 'utf8')
    .trim()
    .replace(/\s+/g, '')
  expect(canonicalize(input)).toEqual(expected)
  expect(toHex(encodeUtf8(canonicalize(input) ?? ''))).toEqual(expectedHex)
})

test('french', () => {
  const input = readJsonSync('test/testdata/input/french.json')
  const expected = fs.readFileSync('test/testdata/output/french.json', 'utf8').trim()
  const expectedHex = fs
    .readFileSync('test/testdata/outhex/french.txt', 'utf8')
    .trim()
    .replace(/\s+/g, '')
  expect(canonicalize(input)).toEqual(expected)
  expect(toHex(encodeUtf8(canonicalize(input) ?? ''))).toEqual(expectedHex)
})

test('structures', () => {
  const input = readJsonSync('test/testdata/input/structures.json')
  const expected = fs.readFileSync('test/testdata/output/structures.json', 'utf8').trim()
  const expectedHex = fs
    .readFileSync('test/testdata/outhex/structures.txt', 'utf8')
    .trim()
    .replace(/\s+/g, '')
  expect(canonicalize(input)).toEqual(expected)
  expect(toHex(encodeUtf8(canonicalize(input) ?? ''))).toEqual(expectedHex)
})

test('unicode', () => {
  const input = readJsonSync('test/testdata/input/unicode.json')
  const expected = fs.readFileSync('test/testdata/output/unicode.json', 'utf8').trim()
  const expectedHex = fs
    .readFileSync('test/testdata/outhex/unicode.txt', 'utf8')
    .trim()
    .replace(/\s+/g, '')
  expect(canonicalize(input)).toEqual(expected)
  expect(toHex(encodeUtf8(canonicalize(input) ?? ''))).toEqual(expectedHex)
})

test('values', () => {
  const input = readJsonSync('test/testdata/input/values.json')
  const expected = fs.readFileSync('test/testdata/output/values.json', 'utf8').trim()
  const expectedHex = fs
    .readFileSync('test/testdata/outhex/values.txt', 'utf8')
    .trim()
    .replace(/\s+/g, '')
  expect(canonicalize(input)).toEqual(expected)
  expect(toHex(encodeUtf8(canonicalize(input) ?? ''))).toEqual(expectedHex)
})

test('weird', () => {
  const input = readJsonSync('test/testdata/input/weird.json')
  const expected = fs.readFileSync('test/testdata/output/weird.json', 'utf8').trim()
  const expectedHex = fs
    .readFileSync('test/testdata/outhex/weird.txt', 'utf8')
    .trim()
    .replace(/\s+/g, '')
  expect(canonicalize(input)).toEqual(expected)
  expect(toHex(canonicalize(input))).toEqual(expectedHex)
})
