import { match, pinyin } from 'pinyin-pro';
import type { SearchKeys } from '../types';

function compact(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function buildSearchKeys(
  name: string,
  fields: Record<string, string> = {},
): SearchKeys {
  const compactName = compact(name);
  return {
    name: compactName,
    pinyin: pinyin(compactName, {toneType: 'none', separator: ''}).toLowerCase(),
    initials: pinyin(compactName, {
      pattern: 'first',
      toneType: 'none',
      separator: '',
    }).toLowerCase(),
    extra: compact(Object.values(fields).join(' ')),
  };
}

export function matchesQuery(
  keys: SearchKeys,
  rawName: string,
  query: string,
): boolean {
  const q = compact(query);
  if (!q) {
    return true;
  }
  if (keys.name.includes(q) || keys.pinyin.includes(q) || keys.initials.includes(q)) {
    return true;
  }
  if (keys.extra.includes(q)) {
    return true;
  }
  return match(rawName, query.trim()) !== null;
}

export function withSearch<T extends {name: string; fields: Record<string, string>}>(
  person: T,
): T & {search: SearchKeys} {
  return {...person, search: buildSearchKeys(person.name, person.fields)};
}
