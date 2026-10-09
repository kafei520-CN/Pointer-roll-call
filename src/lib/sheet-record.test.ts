import {describe, expect, it} from 'vitest';
import type {SessionPerson} from '../types';
import {
  addSequenceSlot,
  addTally,
  appendMark,
  deleteSequenceNumber,
  dropLastMark,
  formatSequence,
  formatTally,
  nextChoice,
  personMarked,
  sequenceNumbers,
  toggleOwnMark,
} from './sheet-record';

function person(id: string, marks: number[] = [], count = 0): SessionPerson {
  return {
    id,
    rowNumber: 1,
    name: id,
    fields: {},
    search: {name: id, pinyin: '', initials: '', extra: ''},
    status: 'unset',
    note: '',
    marks,
    count,
    choice: '',
  };
}

describe('count sheet records', () => {
  it('appends the next sheet-wide ordinal and keeps gaps', () => {
    const first = person('a');
    const second = person('b');
    const markedFirst = appendMark(first, [first, second]);
    const markedSecond = appendMark(second, [markedFirst, second]);
    const again = appendMark(markedFirst, [markedFirst, markedSecond]);
    const later = appendMark(markedSecond, [again, markedSecond]);
    expect(formatSequence(again)).toBe('1、3');
    expect(formatSequence(later)).toBe('2、4');
    const undone = dropLastMark(again);
    expect(formatSequence(undone)).toBe('1');
    expect(formatSequence(appendMark(undone, [undone, later]))).toBe('1、5');
  });

  it('adds the next number unselected and toggles only the current person', () => {
    const people = [person('a', [1]), person('b', [1])];
    expect(addSequenceSlot([1])).toEqual([1, 2]);
    const cleared = toggleOwnMark(people, 'a', 1);
    expect(cleared[0].marks).toEqual([]);
    expect(cleared[1].marks).toEqual([1]);
    const selected = toggleOwnMark(cleared, 'a', 2);
    expect(selected[0].marks).toEqual([2]);
    expect(selected[1].marks).toEqual([1]);
  });

  it('removes a middle sequence number without leaving a placeholder', () => {
    const people = [person('a', [1, 2, 4]), person('b', [3])];
    const next = deleteSequenceNumber(people, 2);
    expect(next[0].marks).toEqual([1, 4]);
    expect(sequenceNumbers(next)).toEqual([1, 3, 4]);
    expect(sequenceNumbers(deleteSequenceNumber(next, 3))).toEqual([1, 4]);
  });

  it('stores a plain tally and does not go below zero', () => {
    const once = addTally(person('a'), 1);
    const thrice = addTally(addTally(once, 1), 1);
    expect(formatTally(thrice)).toBe('3');
    expect(formatTally(addTally(person('a'), -1))).toBe('');
    expect(personMarked(thrice, {kind: 'count', countMode: 'tally'})).toBe(true);
    expect(personMarked(person('a'), {kind: 'count', countMode: 'tally'})).toBe(false);
  });

  it('cycles custom options and treats an empty choice as unmarked', () => {
    const options = [
      {id: 'good', label: '优秀'},
      {id: 'ok', label: '良好'},
    ];
    expect(nextChoice('', options)).toBe('good');
    expect(nextChoice('good', options)).toBe('ok');
    expect(nextChoice('ok', options)).toBe('');
    const chosen = person('a');
    chosen.choice = 'good';
    expect(personMarked(chosen, {kind: 'custom'})).toBe(true);
    expect(personMarked(person('a'), {kind: 'custom'})).toBe(false);
  });
});
