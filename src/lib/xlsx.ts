import * as XLSX from 'xlsx';
import type {Column, Person, RawSheet, RawWorkbook, SheetImportConfig} from '../types';
import {createId} from './id';
import {buildSearchKeys} from './search';

const NAME_HEADER = /姓名|名字|name|学员|学生|成员|人员/i;

export function columnLetter(index: number): string {
  let n = index + 1;
  let text = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    text = String.fromCharCode(65 + rem) + text;
    n = Math.floor((n - 1) / 26);
  }
  return text;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) {
    return '';
  }
  if (cell.w != null && String(cell.w).trim() !== '') {
    return String(cell.w).trim();
  }
  if (cell.v == null) {
    return '';
  }
  return String(cell.v).trim();
}

function sheetToRows(ws: XLSX.WorkSheet): string[][] {
  if (!ws['!ref']) {
    return [];
  }
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows: string[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({r, c});
      row.push(cellText(ws[addr] as XLSX.CellObject | undefined));
    }
    rows.push(row);
  }
  return rows;
}

export function parseWorkbook(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
): RawWorkbook {
  const wb = XLSX.read(data, {type: 'array', cellDates: true});
  const sheets: RawSheet[] = wb.SheetNames.map((name) => ({
    name,
    rows: sheetToRows(wb.Sheets[name]),
  }));
  return {fileName, sheets};
}

function rowHasValue(row: string[] | undefined): boolean {
  return !!row && row.some((cell) => cell.trim() !== '');
}

export function detectConfig(rows: string[][]): Omit<SheetImportConfig, 'name' | 'included'> {
  let firstNonEmpty = 1;
  for (let i = 0; i < rows.length; i++) {
    if (rowHasValue(rows[i])) {
      firstNonEmpty = i + 1;
      break;
    }
  }
  let headerRow = firstNonEmpty;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] ?? [];
    if (row.some((cell) => NAME_HEADER.test(cell))) {
      headerRow = i + 1;
      break;
    }
  }
  let endRow = headerRow;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rowHasValue(rows[i])) {
      endRow = i + 1;
      break;
    }
  }
  const startRow = headerRow < endRow ? headerRow + 1 : headerRow;
  const header = rows[headerRow - 1] ?? [];
  let nameCol = 0;
  for (let c = 0; c < header.length; c++) {
    if (NAME_HEADER.test(header[c])) {
      nameCol = c;
      break;
    }
  }
  return {headerRow, startRow, endRow, nameCol};
}

export function defaultConfigs(workbook: RawWorkbook): SheetImportConfig[] {
  return workbook.sheets.map((sheet, index) => ({
    name: sheet.name,
    included: index === 0 || workbook.sheets.length <= 6,
    ...detectConfig(sheet.rows),
  }));
}

export function extractPeople(
  rows: string[][],
  config: SheetImportConfig,
): {columns: Column[]; people: Person[]; nameColumnLabel: string} {
  const header = config.headerRow > 0 ? (rows[config.headerRow - 1] ?? []) : [];
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns: Column[] = [];
  for (let c = 0; c < width; c++) {
    if (c === config.nameCol) {
      continue;
    }
    const label =
      (config.headerRow > 0 ? header[c]?.trim() : '') || columnLetter(c);
    columns.push({key: `c${c}`, label});
  }
  const nameColumnLabel =
    (config.headerRow > 0 ? header[config.nameCol]?.trim() : '') || '姓名';
  const people: Person[] = [];
  for (let r = config.startRow; r <= config.endRow; r++) {
    if (config.headerRow > 0 && r === config.headerRow) {
      continue;
    }
    const row = rows[r - 1] ?? [];
    const name = (row[config.nameCol] ?? '').trim();
    if (!name) {
      continue;
    }
    const fields: Record<string, string> = {};
    for (const col of columns) {
      const index = Number(col.key.slice(1));
      fields[col.key] = (row[index] ?? '').trim();
    }
    people.push({
      id: createId(),
      rowNumber: r,
      name,
      fields,
      search: buildSearchKeys(name, fields),
    });
  }
  return {columns, people, nameColumnLabel};
}


