import * as XLSX from 'xlsx';
import type {Session, SessionPerson, SessionSheet, Status} from '../types';
import {
  countMode,
  formatSequence,
  formatTally,
  optionLabels,
  personChoices,
  personMarked,
  sheetKind,
} from './sheet-record';

/** 未到 is every person still unmarked, on every sheet of this roll call. */
export const EXPORT_GROUP_ORDER: Status[] = ['present', 'absent', 'leave', 'late', 'unset'];

export const EXPORT_LABEL: Record<Status, string> = {
  present: '已到',
  absent: '缺',
  leave: '假',
  late: '迟',
  unset: '未到',
};

export type ExportShape = 'brief' | 'template';

/** selected keeps the checked status chips. all exports every person on every sheet. */
export type ExportScope = 'selected' | 'all';

interface ExportTable {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

export function exportCounts(session: Session): Record<Status, number> {
  const counts: Record<Status, number> = {
    unset: 0,
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
  };
  for (const sheet of session.sheets) {
    if (sheetKind(sheet) !== 'roll') {
      continue;
    }
    for (const person of sheet.people) {
      counts[person.status] += 1;
    }
  }
  return counts;
}

export function exportTables(
  session: Session,
  groups: Status[],
  shape: ExportShape,
  nameLabels: Record<string, string> = {},
  scope: ExportScope = 'selected',
): ExportTable[] {
  const selected = new Set(scope === 'all' ? EXPORT_GROUP_ORDER : groups);
  const tables: ExportTable[] = [];
  for (const sheet of session.sheets) {
    const people: Array<{person: SessionPerson; order: number}> = [];
    sheet.people.forEach((person, index) => {
      if (keepPerson(sheet, person, selected, scope)) {
        people.push({person, order: index + 1});
      }
    });
    if (people.length === 0) {
      continue;
    }
    if (shape === 'brief') {
      tables.push({
        sheetName: sheet.name,
        headers: ['序号', '名字', recordHeader(sheet)],
        rows: people.map(({person, order}) => [order, person.name, recordValue(sheet, person)]),
      });
      continue;
    }
    const cells = templateCells(sheet, nameLabels[sheet.id] || '姓名');
    const record = recordCell(sheet);
    if (record) {
      cells.push(record);
    }
    tables.push({
      sheetName: sheet.name,
      headers: cells.map((cell) => cell.label),
      rows: people.map(({person}) => cells.map((cell) => cell.value(person))),
    });
  }
  return tables;
}

function keepPerson(
  sheet: SessionSheet,
  person: SessionPerson,
  selected: Set<Status>,
  scope: ExportScope,
): boolean {
  if (sheetKind(sheet) === 'roll') {
    return selected.has(person.status);
  }
  if (scope === 'all') {
    return true;
  }
  return personMarked(person, sheet);
}

function recordHeader(sheet: SessionSheet): string {
  const kind = sheetKind(sheet);
  if (kind === 'count') {
    return countMode(sheet) === 'sequence' ? '数列' : '次数';
  }
  if (kind === 'custom') {
    return '选项';
  }
  return '状态';
}

function recordValue(sheet: SessionSheet, person: SessionPerson): string {
  const kind = sheetKind(sheet);
  if (kind === 'count') {
    return countMode(sheet) === 'sequence' ? formatSequence(person) : formatTally(person);
  }
  if (kind === 'custom') {
    return optionLabels(sheet.options, personChoices(person));
  }
  return EXPORT_LABEL[person.status];
}

function recordCell(
  sheet: SessionSheet,
): {label: string; value: (person: SessionPerson) => string} | null {
  if (sheetKind(sheet) === 'roll') {
    return null;
  }
  return {
    label: recordHeader(sheet),
    value: (person) => recordValue(sheet, person),
  };
}

function templateCells(
  sheet: SessionSheet,
  nameLabel: string,
): Array<{label: string; value: (person: SessionPerson) => string}> {
  const indexed = sheet.columns.map((column) => {
    const match = /^c(\d+)$/.exec(column.key);
    return match ? {index: Number(match[1]), column} : null;
  });
  if (indexed.some((item) => item === null)) {
    return [
      {label: nameLabel, value: (person) => person.name},
      ...sheet.columns.map((column) => ({
        label: column.label,
        value: (person: SessionPerson) => person.fields[column.key] ?? '',
      })),
    ];
  }
  const used = new Set(indexed.map((item) => item!.index));
  const max = indexed.reduce((highest, item) => Math.max(highest, item!.index), -1);
  let nameIndex = 0;
  for (let index = 0; index <= max + 1; index += 1) {
    if (!used.has(index)) {
      nameIndex = index;
      break;
    }
  }
  const cells = indexed.map((item) => ({
    index: item!.index,
    label: item!.column.label,
    value: (person: SessionPerson) => person.fields[item!.column.key] ?? '',
  }));
  cells.push({index: nameIndex, label: nameLabel, value: (person) => person.name});
  cells.sort((a, b) => a.index - b.index);
  return cells;
}

export function toMarkdown(
  session: Session,
  groups: Status[],
  shape: ExportShape,
  nameLabels: Record<string, string> = {},
  scope: ExportScope = 'selected',
): string {
  const lines = [`# ${session.name}`, ''];
  for (const table of exportTables(session, groups, shape, nameLabels, scope)) {
    lines.push(`## ${table.sheetName}`, '');
    lines.push(`| ${table.headers.map(escapeCell).join(' | ')} |`);
    lines.push(`| ${table.headers.map(() => '---').join(' | ')} |`);
    for (const row of table.rows) {
      lines.push(`| ${row.map((cell) => escapeCell(String(cell))).join(' | ')} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function toXlsx(
  session: Session,
  groups: Status[],
  shape: ExportShape,
  nameLabels: Record<string, string> = {},
): ArrayBuffer {
  const tables = exportTables(session, groups, shape, nameLabels);
  if (tables.length === 0) {
    throw new Error('所选状态里没有人');
  }
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const table of tables) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]),
      uniqueSheetName(table.sheetName, used),
    );
  }
  const written = XLSX.write(book, {type: 'array', bookType: 'xlsx'}) as ArrayBuffer | Uint8Array;
  const view = written instanceof Uint8Array ? written : new Uint8Array(written);
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || '名单';
  let title = base;
  let n = 2;
  while (used.has(title)) {
    const suffix = ` ${n}`;
    title = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(title);
  return title;
}
