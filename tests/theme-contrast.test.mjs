import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function themeVariables(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(block, `${selector} theme block exists`);
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(match => [match[1], match[2]])
  );
}

function luminance(hex) {
  const channels = [1, 3, 5]
    .map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

for (const [name, selector] of [['light', ':root'], ['dark', ':root[data-theme="dark"]']]) {
  test(`${name} theme keeps essential text above WCAG AA contrast`, () => {
    const variables = themeVariables(selector);
    for (const [foreground, background] of [
      ['text', 'surface'],
      ['muted', 'surface'],
      ['accent', 'surface'],
      ['text', 'tree-bg']
    ]) {
      const ratio = contrastRatio(variables[foreground], variables[background]);
      assert.ok(ratio >= 4.5, `${foreground} on ${background} has ${ratio.toFixed(2)}:1 contrast`);
    }
  });
}
