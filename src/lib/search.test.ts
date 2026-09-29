import {describe, expect, it} from 'vitest';
import {buildSearchKeys, matchesQuery} from './search';

describe('matchesQuery', () => {
  const keys = buildSearchKeys('张三', {c1: '2021001'});

  it('matches Chinese substring', () => {
    expect(matchesQuery(keys, '张三', '张')).toBe(true);
    expect(matchesQuery(keys, '张三', '张三')).toBe(true);
  });

  it('matches full pinyin without tones or spaces', () => {
    expect(matchesQuery(keys, '张三', 'zhangsan')).toBe(true);
    expect(matchesQuery(keys, '张三', 'ZHANG')).toBe(true);
  });

  it('matches first-letter initials', () => {
    expect(matchesQuery(keys, '张三', 'zs')).toBe(true);
    expect(matchesQuery(keys, '张三', 'Z')).toBe(true);
  });

  it('matches extra fields such as student id', () => {
    expect(matchesQuery(keys, '张三', '2021001')).toBe(true);
  });

  it('rejects unrelated query', () => {
    expect(matchesQuery(keys, '张三', 'lisi')).toBe(false);
  });

  it('empty query matches all', () => {
    expect(matchesQuery(keys, '张三', '  ')).toBe(true);
  });
});
