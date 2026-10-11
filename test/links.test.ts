import { describe, expect, test } from 'bun:test';

import { createLinks } from '../src/service/links.ts';

const world = () => {
  let now = 1_000;
  const opened: string[] = [];
  const closed: string[] = [];
  const links = createLinks({
    open: (udid) => {
      opened.push(udid);
      return { udid, close: () => closed.push(udid) };
    },
    now: () => now,
    graceMs: 100,
  });
  return { links, opened, closed, advance: (ms: number) => (now += ms) };
};

describe('device links', () => {
  test('the panel watches only the device it shows, while it asks for frames', () => {
    const { links, advance } = world();
    links.setPanel('A');
    links.seenByPanel();
    links.get('A');
    expect(links.wanted('A')).toBe(true);
    expect(links.wanted('B')).toBe(false);
    advance(150);
    expect(links.wanted('A')).toBe(false);
  });

  test('switching the panel keeps a link a page tile still watches', () => {
    const { links, closed } = world();
    links.setPanel('A');
    links.seenByPanel();
    links.seenByPage('A');
    links.setPanel('B');
    links.get('B');
    expect(links.sweep()).toEqual([]);
    expect(closed).toEqual([]);
    expect(links.watched().sort()).toEqual(['A', 'B']);
  });

  test('the last viewer leaving closes the link after the grace period', () => {
    const { links, closed, advance } = world();
    links.seenByPage('B');
    advance(50);
    expect(links.sweep()).toEqual([]);
    advance(60);
    expect(links.sweep()).toEqual(['B']);
    expect(closed).toEqual(['B']);
    expect(links.peek('B')).toBeUndefined();
  });

  test('one link per device, however many viewers', () => {
    const { links, opened } = world();
    links.setPanel('A');
    links.seenByPanel();
    const first = links.get('A');
    expect(links.seenByPage('A')).toBe(first);
    expect(opened).toEqual(['A']);
  });
});
