#!/usr/bin/env node
//
// The two dark blocks in globals.css must declare the same tokens with the same values.
//
// WHY THEY ARE DUPLICATED AT ALL: plain CSS cannot alias a media query to an attribute selector, so
// supporting both "follow the system" and "override it" without a JavaScript dependency means writing
// the palette twice. The alternative was a script that resolves the theme before paint, which leaves
// anybody with JavaScript disabled on a dark desktop looking at a light app.
//
// Duplication is the honest trade only if the drift it invites cannot survive. This is that check:
// change one block and forget the other, and it fails naming every token that disagrees. Without it
// the two would part company on the first palette edit, and the symptom would be a theme that is
// subtly wrong ONLY for people who set their system to dark and never touched the toggle — which is
// the population least likely to report it and hardest to reproduce.

import { readFileSync } from 'node:fs';

const CSS = 'src/app/globals.css';
const css = readFileSync(CSS, 'utf8');

/** Every `--token: value;` inside one brace-delimited block, as a Map. */
function tokensOf(block) {
  return new Map([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(([, k, v]) => [k, v.trim()]));
}

const media = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([\s\S]*?)\n  \}/);
const attribute = css.match(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);

if (!media || !attribute) {
  console.error(`Could not find both dark blocks in ${CSS} — refusing to report a pass.`);
  process.exit(1);
}

const fromMedia = tokensOf(media[1]);
const fromAttribute = tokensOf(attribute[1]);

const problems = [];

for (const [token, value] of fromMedia) {
  if (!fromAttribute.has(token)) problems.push(`${token} is in the media block and not in [data-theme='dark']`);
  else if (fromAttribute.get(token) !== value)
    problems.push(`${token} disagrees: ${value} in the media block, ${fromAttribute.get(token)} in [data-theme='dark']`);
}
for (const token of fromAttribute.keys()) {
  if (!fromMedia.has(token)) problems.push(`${token} is in [data-theme='dark'] and not in the media block`);
}

if (fromMedia.size === 0) {
  console.error('The dark media block declares no tokens — refusing to report a pass.');
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`${problems.length} difference(s) between the two dark blocks:\n`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  console.error('\nThey have to say the same thing. See the comment above them in globals.css.');
  process.exit(1);
}

console.log(`Both dark blocks declare the same ${fromMedia.size} tokens.`);
