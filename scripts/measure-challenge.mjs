#!/usr/bin/env node
//
// How long the anti-automation challenge actually costs, in seconds of somebody's time.
//
// THE NUMBER HAS TO BE MEASURED, not chosen. A difficulty that takes two seconds on this machine can
// take twenty on a five-year-old phone, and a sign-up form that appears frozen for twenty seconds is a
// worse outcome than the bots it prevents. This uses `crypto.subtle` — the same API the browser runs,
// including its per-call async overhead, which is most of the cost and which a native hashing loop
// would hide.
//
//   node scripts/measure-challenge.mjs [bits]
//
// Reported as a median over several solves, because a single one is dominated by luck: the work is
// geometric, so any individual attempt can be many times the expected value.

const BITS = Number(process.argv[2] ?? 16);
const ROUNDS = 7;

const encoder = new TextEncoder();

function hasLeadingZeroBits(digest, bits) {
  let remaining = bits;
  for (const byte of digest) {
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
      continue;
    }
    return remaining === 0 || byte >>> (8 - remaining) === 0;
  }
  return remaining <= 0;
}

async function solve(prefix) {
  let counter = 0;
  for (;;) {
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(`${prefix}:${counter}`)),
    );
    if (hasLeadingZeroBits(digest, BITS)) return counter;
    counter += 1;
  }
}

const samples = [];
for (let round = 0; round < ROUNDS; round += 1) {
  const started = performance.now();
  const counter = await solve(`nonce-${round}:someone@example.com`);
  samples.push({ ms: performance.now() - started, counter });
}

const times = samples.map((s) => s.ms).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const worst = times.at(-1);
const attempts = Math.round(samples.reduce((sum, s) => sum + s.counter, 0) / samples.length);

console.log(`bits           ${BITS}   (expected ~${2 ** BITS} hashes)`);
console.log(`attempts       ${attempts} average`);
console.log(`median         ${(median / 1000).toFixed(2)}s   on this machine`);
console.log(`worst of ${ROUNDS}    ${(worst / 1000).toFixed(2)}s`);
console.log(`a slow phone   roughly ${(median / 1000 * 5).toFixed(1)}s   — assume 5x, and assume it is somebody in a hurry`);
