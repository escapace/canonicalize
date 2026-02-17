import { bench, describe } from 'vitest'

import { canonicalize as canonicalizeCurrent } from '../src/index'
import { canonicalize as canonicalizeOriginal } from '../src/original'

type SafeJson = boolean | number | string | SafeJson[] | { [key: string]: SafeJson } | null

function mulberry32(seed: number): () => number {
  let state = seed

  return () => {
    state += 1_831_565_813
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function randomInt(random: () => number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1
  return Math.floor(random() * span) + minInclusive
}

function randomString(random: () => number, length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[randomInt(random, 0, alphabet.length - 1)]
  }

  return value
}

function randomPrimitive(
  random: () => number,
): Exclude<SafeJson, SafeJson[] | { [key: string]: SafeJson }> {
  const choice = randomInt(random, 0, 3)

  if (choice === 0) {
    return null
  }

  if (choice === 1) {
    return random() < 0.5
  }

  if (choice === 2) {
    return Number((random() * 20_000 - 10_000).toFixed(randomInt(random, 0, 6)))
  }

  return randomString(random, randomInt(random, 1, 20))
}

function randomSafeJson(random: () => number, depth: number): SafeJson {
  if (depth >= 4) {
    return randomPrimitive(random)
  }

  const choice = randomInt(random, 0, 4)

  if (choice <= 1) {
    return randomPrimitive(random)
  }

  if (choice === 2) {
    const length = randomInt(random, 0, 8)
    const values: SafeJson[] = []

    for (let index = 0; index < length; index += 1) {
      values.push(randomSafeJson(random, depth + 1))
    }

    return values
  }

  const entries = randomInt(random, 0, 8)
  const object: { [key: string]: SafeJson } = {}

  for (let index = 0; index < entries; index += 1) {
    object[randomString(random, randomInt(random, 1, 12))] = randomSafeJson(random, depth + 1)
  }

  return object
}

function generateInputs(size: number, seed: number): SafeJson[] {
  const random = mulberry32(seed)

  const inputs: SafeJson[] = []
  for (let index = 0; index < size; index += 1) {
    inputs.push(randomSafeJson(random, 0))
  }

  return inputs
}

function runSerializer(
  serializer: (value: SafeJson) => string | undefined,
  inputs: SafeJson[],
): number {
  let totalLength = 0

  for (const input of inputs) {
    const output = serializer(input)
    totalLength += output?.length ?? 0
  }

  return totalLength
}

const randomSeed = Math.floor(Math.random() * 4_294_967_296)
const benchmarkSeed = Number.parseInt(process.env.BENCH_SEED ?? `${randomSeed}`, 10)
const inputs = generateInputs(3000, Number.isFinite(benchmarkSeed) ? benchmarkSeed : randomSeed)

// Keep generation and safety checks out of benchmark timing.
for (const input of inputs) {
  JSON.stringify(input)
  canonicalizeOriginal(input)
  canonicalizeCurrent(input)
}

let _sink = 0

describe('canonicalize performance', () => {
  bench('JSON.stringify', () => {
    _sink ^= runSerializer((value) => JSON.stringify(value), inputs)
  })

  bench('canonicalize original (src/original.ts)', () => {
    _sink ^= runSerializer(canonicalizeOriginal, inputs)
  })

  bench('canonicalize current (src/index.ts)', () => {
    _sink ^= runSerializer(canonicalizeCurrent, inputs)
  })
})
