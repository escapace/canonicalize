/* eslint-disable perfectionist/sort-objects */

import { expect, it } from 'vitest'

import { canonicalize } from './index'

const encodeUtf8 = (value: string) => new TextEncoder().encode(value)

const toHex = (value?: string | Uint8Array) =>
  value === undefined ? undefined : Buffer.from(value).toString('hex')

const decodeBase66 = (value: string): string => Buffer.from(value, 'base64').toString('utf8')

const VALUES_INPUT_JSON = String.raw`{
  "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
  "string": "\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/",
  "literals": [null, true, false]
}`

const VALUES_EXPECTED_JSON = String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`

const fixtures = {
  arrays: {
    input: [56, { d: true, 10: null, 1: [] }],
    expected: '[56,{"1":[],"10":null,"d":true}]',
    expectedHex: '5b35362c7b2231223a5b5d2c223130223a6e756c6c2c2264223a747275657d5d',
    useUtf8BytesForHex: true,
  },
  french: {
    input: {
      peach: 'This sorting order',
      péché: 'is wrong according to French',
      pêche: 'but canonicalization MUST',
      sin: 'ignore locale',
    },
    expected:
      '{"peach":"This sorting order","péché":"is wrong according to French","pêche":"but canonicalization MUST","sin":"ignore locale"}',
    expectedHex:
      '7b227065616368223a225468697320736f7274696e67206f72646572222c2270c3a96368c3a9223a2269732077726f6e67206163636f7264696e6720746f204672656e6368222c2270c3aa636865223a226275742063616e6f6e6963616c697a6174696f6e204d555354222c2273696e223a2269676e6f7265206c6f63616c65227d',
    useUtf8BytesForHex: true,
  },
  structures: {
    input: {
      1: { 'f': { f: 'hi', F: 5 }, '\n': 56 },
      10: {},
      '': 'empty',
      'a': {},
      111: [{ e: 'yes', E: 'no' }],
      'A': {},
    },
    expected:
      '{"":"empty","1":{"\\n":56,"f":{"F":5,"f":"hi"}},"10":{},"111":[{"E":"no","e":"yes"}],"A":{},"a":{}}',
    expectedHex:
      '7b22223a22656d707479222c2231223a7b225c6e223a35362c2266223a7b2246223a352c2266223a226869227d7d2c223130223a7b7d2c22313131223a5b7b2245223a226e6f222c2265223a22796573227d5d2c2241223a7b7d2c2261223a7b7d7d',
    useUtf8BytesForHex: true,
  },
  unicode: {
    input: { 'Unnormalized Unicode': 'A\u030a' },
    expected: '{"Unnormalized Unicode":"Å"}',
    expectedHex: '7b22556e6e6f726d616c697a656420556e69636f6465223a2241cc8a227d',
    useUtf8BytesForHex: true,
  },
  values: {
    input: JSON.parse(VALUES_INPUT_JSON) as {
      literals: [null, true, false]
      numbers: number[]
      string: string
    },
    expected: VALUES_EXPECTED_JSON,
    expectedHex:
      '7b226c69746572616c73223a5b6e756c6c2c747275652c66616c73655d2c226e756d62657273223a5b3333333333333333332e333333333333332c31652b33302c342e352c302e3030322c31652d32375d2c22737472696e67223a22e282ac245c75303030665c6e4127425c225c5c5c5c5c222f227d',
    useUtf8BytesForHex: true,
  },
  weird: {
    // Packed to avoid direct inclusion of control/newline-heavy literals.
    inputBase66:
      'ewogICJcdTIwYWMiOiAiRXVybyBTaWduIiwKICAiXHIiOiAiQ2FycmlhZ2UgUmV0dXJuIiwKICAiXHUwMDBhIjogIk5ld2xpbmUiLAogICIxIjogIk9uZSIsCiAgIlx1MDA4MCI6ICJDb250cm9sXHUwMDdmIiwKICAiXHVkODNkXHVkZTAyIjogIlNtaWxleSIsCiAgIlx1MDBmNiI6ICJMYXRpbiBTbWFsbCBMZXR0ZXIgTyBXaXRoIERpYWVyZXNpcyIsCiAgIlx1ZmIzMyI6ICJIZWJyZXcgTGV0dGVyIERhbGV0IFdpdGggRGFnZXNoIiwKICAiPC9zY3JpcHQ+IjogIkJyb3dzZXIgQ2hhbGxlbmdlIgp9Cg==',
    expectedBase66:
      'eyJcbiI6Ik5ld2xpbmUiLCJcciI6IkNhcnJpYWdlIFJldHVybiIsIjEiOiJPbmUiLCI8L3NjcmlwdD4iOiJCcm93c2VyIENoYWxsZW5nZSIsIsKAIjoiQ29udHJvbH8iLCLDtiI6IkxhdGluIFNtYWxsIExldHRlciBPIFdpdGggRGlhZXJlc2lzIiwi4oKsIjoiRXVybyBTaWduIiwi8J+YgiI6IlNtaWxleSIsIu+ssyI6IkhlYnJldyBMZXR0ZXIgRGFsZXQgV2l0aCBEYWdlc2gifQ==',
    expectedHexBase66:
      'N2IgMjIgNWMgNmUgMjIgM2EgMjIgNGUgNjUgNzcgNmMgNjkgNmUgNjUgMjIgMmMgMjIgNWMgNzIgMjIgM2EgMjIgNDMgNjEgNzIgNzIgNjkgNjEgNjcgNjUgMjAgNTIKNjUgNzQgNzUgNzIgNmUgMjIgMmMgMjIgMzEgMjIgM2EgMjIgNGYgNmUgNjUgMjIgMmMgMjIgM2MgMmYgNzMgNjMgNzIgNjkgNzAgNzQgM2UgMjIgM2EgMjIgNDIgNzIKNmYgNzcgNzMgNjUgNzIgMjAgNDMgNjggNjEgNmMgNmMgNjUgNmUgNjcgNjUgMjIgMmMgMjIgYzIgODAgMjIgM2EgMjIgNDMgNmYgNmUgNzQgNzIgNmYgNmMgN2YgMjIKMmMgMjIgYzMgYjYgMjIgM2EgMjIgNGMgNjEgNzQgNjkgNmUgMjAgNTMgNmQgNjEgNmMgNmMgMjAgNGMgNjUgNzQgNzQgNjUgNzIgMjAgNGYgMjAgNTcgNjkgNzQgNjgKMjAgNDQgNjkgNjEgNjUgNzIgNjUgNzMgNjkgNzMgMjIgMmMgMjIgZTIgODIgYWMgMjIgM2EgMjIgNDUgNzUgNzIgNmYgMjAgNTMgNjkgNjcgNmUgMjIgMmMgMjIgZjAKOWYgOTggODIgMjIgM2EgMjIgNTMgNmQgNjkgNmMgNjUgNzkgMjIgMmMgMjIgZWYgYWMgYjMgMjIgM2EgMjIgNDggNjUgNjIgNzIgNjUgNzcgMjAgNGMgNjUgNzQgNzQKNjUgNzIgMjAgNDQgNjEgNmMgNjUgNzQgMjAgNTcgNjkgNzQgNjggMjAgNDQgNjEgNjcgNjUgNzMgNjggMjIgN2QK',
    useUtf8BytesForHex: false,
  },
} as const

it.each(Object.entries(fixtures))('fixture-%s-matches-expected-canonical-output', (_, fixture) => {
  const input =
    'input' in fixture
      ? fixture.input
      : (JSON.parse(decodeBase66(fixture.inputBase66)) as Record<string, string>)

  const expected = 'expected' in fixture ? fixture.expected : decodeBase66(fixture.expectedBase66)
  const expectedHex =
    'expectedHex' in fixture
      ? fixture.expectedHex
      : decodeBase66(fixture.expectedHexBase66).replace(/\s+/g, '')

  const output = canonicalize(input)

  expect(output).toEqual(expected)

  const hexSource = fixture.useUtf8BytesForHex ? encodeUtf8(output ?? '') : output
  expect(toHex(hexSource)).toEqual(expectedHex)
})
