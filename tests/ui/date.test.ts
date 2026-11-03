import {describe, expect, it} from 'vitest';
import {formatDate, relativeDate} from '../../src/ui/date.js';

const iso = '2026-03-04T10:30:00+00:00';
const at = (text: string) => new Date(text);

describe('relativeDate', () => {
  const now = at('2026-03-04T10:30:00Z');
  it.each([
    ['2026-03-04T10:29:50+00:00', 'now'],
    ['2026-03-04T10:25:00+00:00', '5 minutes ago'],
    ['2026-03-04T07:30:00+00:00', '3 hours ago'],
    ['2026-03-03T10:30:00+00:00', 'yesterday'],
    ['2026-03-01T10:30:00+00:00', '3 days ago'],
    ['2026-02-18T10:30:00+00:00', '2 weeks ago'],
    ['2025-12-04T10:30:00+00:00', '3 months ago'],
    ['2024-03-04T10:30:00+00:00', '2 years ago'],
  ])('%s -> %s', (date, expected) => {
    expect(relativeDate(date, now)).toBe(expected);
  });

  it('handles dates in the future (clock skew)', () => {
    expect(relativeDate('2026-03-04T12:30:00+00:00', now)).toBe('in 2 hours');
  });

  it('returns the text itself when it is not a date', () => {
    expect(relativeDate('not a date', now)).toBe('not a date');
  });
});

describe('formatDate', () => {
  const now = at('2026-03-07T10:30:00Z');

  it('short: day in lists, day and time in the details', () => {
    expect(formatDate(iso, 'short')).toBe('2026-03-04');
    expect(formatDate(iso, 'short', {detail: true})).toBe('2026-03-04 10:30');
  });

  it('iso: day and time everywhere, in the date own timezone', () => {
    expect(formatDate(iso, 'iso')).toBe('2026-03-04 10:30');
    expect(formatDate('2026-03-04T23:30:00-03:00', 'iso')).toBe('2026-03-04 23:30');
  });

  it('relative: only the distance in lists, with the exact time in the details', () => {
    expect(formatDate(iso, 'relative', {now})).toBe('3 days ago');
    expect(formatDate(iso, 'relative', {now, detail: true})).toBe('3 days ago (2026-03-04 10:30)');
  });
});
