import type {
  CountMode,
  Session,
  SessionPerson,
  SessionSheet,
  SheetKind,
  SheetOption,
} from '../types';

export function sheetKind(sheet: {kind?: SheetKind}): SheetKind {
  return sheet.kind ?? 'roll';
}

export function countMode(sheet: {countMode?: CountMode}): CountMode {
  return sheet.countMode ?? 'tally';
}

export function personMarks(person: SessionPerson): number[] {
  return person.marks ?? [];
}

export function personCount(person: SessionPerson): number {
  return person.count ?? 0;
}

export function personChoice(person: SessionPerson): string {
  return person.choice ?? '';
}

export function countValue(person: SessionPerson, mode: CountMode): number {
  return mode === 'sequence' ? personMarks(person).length : personCount(person);
}

export function personMarked(
  person: SessionPerson,
  sheet: {kind?: SheetKind; countMode?: CountMode},
): boolean {
  const kind = sheetKind(sheet);
  if (kind === 'count') {
    return countValue(person, countMode(sheet)) > 0;
  }
  if (kind === 'custom') {
    return personChoice(person) !== '';
  }
  return person.status !== 'unset';
}

/** Next ordinal for this sheet. Removing a mark does not reuse or renumber. */
export function nextSequence(people: SessionPerson[]): number {
  let max = 0;
  for (const person of people) {
    for (const mark of personMarks(person)) {
      if (mark > max) {
        max = mark;
      }
    }
  }
  return max + 1;
}

export function appendMark(person: SessionPerson, people: SessionPerson[]): SessionPerson {
  return {
    ...person,
    marks: [...personMarks(person), nextSequence(people)],
    markedAt: Date.now(),
  };
}

export function dropLastMark(person: SessionPerson): SessionPerson {
  const marks = personMarks(person);
  return {...person, marks: marks.slice(0, -1)};
}

export function sequenceNumbers(people: SessionPerson[]): number[] {
  const found = new Set<number>();
  for (const person of people) {
    for (const mark of personMarks(person)) {
      found.add(mark);
    }
  }
  return [...found].sort((left, right) => left - right);
}

export function deleteSequenceNumber(people: SessionPerson[], mark: number): SessionPerson[] {
  return people.map((person) =>
    personMarks(person).includes(mark)
      ? {...person, marks: personMarks(person).filter((item) => item !== mark)}
      : person,
  );
}

export function toggleSheetMark(
  people: SessionPerson[],
  personId: string,
  mark: number,
): SessionPerson[] {
  const mine = people.find((person) => person.id === personId);
  if (!mine) {
    return people;
  }
  const has = personMarks(mine).includes(mark);
  return people.map((person) => {
    if (has) {
      return person.id === personId
        ? {...person, marks: personMarks(person).filter((item) => item !== mark)}
        : person;
    }
    if (person.id === personId) {
      return {
        ...person,
        marks: [...personMarks(person), mark].sort((left, right) => left - right),
        markedAt: Date.now(),
      };
    }
    if (!personMarks(person).includes(mark)) {
      return person;
    }
    return {...person, marks: personMarks(person).filter((item) => item !== mark)};
  });
}

export function addTally(person: SessionPerson, delta: number): SessionPerson {
  return {
    ...person,
    count: Math.max(0, personCount(person) + delta),
    markedAt: Date.now(),
  };
}

export function formatSequence(person: SessionPerson): string {
  return personMarks(person).join('、');
}

export function formatTally(person: SessionPerson): string {
  const count = personCount(person);
  return count > 0 ? String(count) : '';
}

export function optionLabel(options: SheetOption[] | undefined, choice: string): string {
  if (!choice) {
    return '';
  }
  return options?.find((item) => item.id === choice)?.label ?? '';
}

export function nextChoice(choice: string, options: SheetOption[]): string {
  const ids = ['', ...options.map((item) => item.id)];
  const index = ids.indexOf(choice);
  const current = index >= 0 ? index : 0;
  return ids[(current + 1) % ids.length];
}

export function recordSummary(sheet: SessionSheet): string {
  const total = sheet.people.length;
  const marked = sheet.people.filter((person) => personMarked(person, sheet)).length;
  const kind = sheetKind(sheet);
  if (kind === 'count') {
    const mode = countMode(sheet);
    const times = sheet.people.reduce((sum, person) => sum + countValue(person, mode), 0);
    const label = mode === 'sequence' ? '数列' : '次数';
    return `${label} · 已计 ${marked}/${total} · 共 ${times} 次`;
  }
  return `已选 ${marked} · 未选 ${total - marked}`;
}

export function markedTotals(session: Pick<Session, 'sheets'>): {marked: number; total: number} {
  let marked = 0;
  let total = 0;
  for (const sheet of session.sheets) {
    for (const person of sheet.people) {
      total += 1;
      if (personMarked(person, sheet)) {
        marked += 1;
      }
    }
  }
  return {marked, total};
}

export function unmarkedWord(kind: SheetKind): string {
  if (kind === 'count') {
    return '未计';
  }
  if (kind === 'custom') {
    return '未选';
  }
  return '未点';
}
