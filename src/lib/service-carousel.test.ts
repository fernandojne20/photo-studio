import { describe, expect, it } from 'vitest';
import { shouldUseCarousel } from './service-carousel';

describe('shouldUseCarousel', () => {
  it('stays false at and below the default four-card threshold', () => {
    expect(shouldUseCarousel(0)).toBe(false);
    expect(shouldUseCarousel(1)).toBe(false);
    expect(shouldUseCarousel(4)).toBe(false);
  });

  it('turns true once the count exceeds the default threshold', () => {
    expect(shouldUseCarousel(5)).toBe(true);
    expect(shouldUseCarousel(12)).toBe(true);
  });

  it('handles zero and negative counts sanely', () => {
    expect(shouldUseCarousel(0)).toBe(false);
    expect(shouldUseCarousel(-1)).toBe(false);
    expect(shouldUseCarousel(-100)).toBe(false);
  });

  it('honors a custom visibleAtDesignWidth threshold', () => {
    expect(shouldUseCarousel(3, 2)).toBe(true);
    expect(shouldUseCarousel(2, 2)).toBe(false);
    expect(shouldUseCarousel(6, 6)).toBe(false);
    expect(shouldUseCarousel(7, 6)).toBe(true);
  });
});
