import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_PLACEMENTS, MARKUP_ANALYTICS_EVENT_NAMES } from './analytics-events';

/**
 * Guards PD-05's markup against drift: every conversion component below is
 * expected to declare an exact number of `data-analytics-event`/
 * `data-analytics-placement` pairs, each holding a value from the closed
 * vocabulary. A plain text scan is acceptable here because this project
 * writes these two attributes only as a static string literal or as one
 * ternary shape (`condition ? 'value' : undefined`, see
 * `Header.astro`/`Biography.astro`) — never as arbitrary computed markup —
 * so reading them back reliably needs no real template parser.
 */

interface ExpectedComponent {
  path: string;
  attributeCount: number;
  events: string[];
  placements: string[];
}

const COMPONENTS: ExpectedComponent[] = [
  {
    path: '../components/Header.astro',
    attributeCount: 4,
    events: ['whatsapp_click', 'instagram_click'],
    placements: ['header', 'mobile_menu'],
  },
  {
    path: '../components/Footer.astro',
    attributeCount: 2,
    events: ['whatsapp_click', 'instagram_click'],
    placements: ['footer'],
  },
  {
    path: '../components/sections/Hero.astro',
    attributeCount: 1,
    events: ['whatsapp_click'],
    placements: ['hero'],
  },
  {
    path: '../components/sections/Biography.astro',
    attributeCount: 1,
    events: ['whatsapp_click'],
    placements: ['biography'],
  },
  {
    path: '../components/sections/Contact.astro',
    attributeCount: 2,
    events: ['email_click', 'phone_click'],
    placements: ['contact'],
  },
  {
    path: '../components/sections/Instagram.astro',
    attributeCount: 1,
    events: ['instagram_click'],
    placements: ['instagram_section'],
  },
];

// Isolates the "then" branch of `condition ? 'value' : undefined`: the
// condition itself may also hold a quoted literal (e.g. `item.kind ===
// 'whatsapp'`), which a naive "first quoted string" scan would wrongly
// pick up instead of the attribute's own value.
const TERNARY_VALUE = /\?\s*(?:'([^']*)'|"([^"]*)")\s*:\s*undefined/;

function extractAttribute(source: string, attrName: string): { count: number; values: string[] } {
  const pattern = new RegExp(`${attrName}=(?:"([^"]*)"|\\{([^}]*)\\})`, 'g');
  const values: string[] = [];
  let count = 0;
  for (const match of source.matchAll(pattern)) {
    count += 1;
    if (match[1] !== undefined) {
      values.push(match[1]);
      continue;
    }
    const ternary = TERNARY_VALUE.exec(match[2] ?? '');
    // No recognized shape: keep the raw expression text as the "value" so
    // it fails the closed-vocabulary check below instead of being skipped.
    values.push(ternary ? (ternary[1] ?? ternary[2] ?? '') : (match[2] ?? '').trim());
  }
  return { count, values };
}

describe('analytics markup drift guard', () => {
  for (const component of COMPONENTS) {
    describe(component.path, () => {
      const source = readFileSync(fileURLToPath(new URL(component.path, import.meta.url)), 'utf8');
      const events = extractAttribute(source, 'data-analytics-event');
      const placements = extractAttribute(source, 'data-analytics-placement');

      it('declares exactly its expected number of analytics attribute pairs', () => {
        expect(events.count).toBe(component.attributeCount);
        expect(placements.count).toBe(component.attributeCount);
      });

      it('uses only closed-vocabulary event names, matching the expected set', () => {
        events.values.forEach((value) => expect(MARKUP_ANALYTICS_EVENT_NAMES).toContain(value));
        expect(new Set(events.values)).toEqual(new Set(component.events));
      });

      it('uses only closed-vocabulary placements, matching the expected set', () => {
        placements.values.forEach((value) => expect(ANALYTICS_PLACEMENTS).toContain(value));
        expect(new Set(placements.values)).toEqual(new Set(component.placements));
      });
    });
  }
});
