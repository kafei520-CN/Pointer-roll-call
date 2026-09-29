import {describe, expect, it} from 'vitest';
import {swipeDirection} from './swipe';

describe('swipeDirection', () => {
  it('moves to the next menu when the finger travels left', () => {
    expect(swipeDirection({x: 200, y: 40}, {x: 40, y: 50})).toBe(1);
  });

  it('moves back when the finger travels right', () => {
    expect(swipeDirection({x: 40, y: 40}, {x: 200, y: 30})).toBe(-1);
  });

  it('ignores a vertical scroll', () => {
    expect(swipeDirection({x: 40, y: 40}, {x: 70, y: 200})).toBeNull();
  });

  it('ignores a short nudge', () => {
    expect(swipeDirection({x: 40, y: 40}, {x: 80, y: 42})).toBeNull();
  });
});
