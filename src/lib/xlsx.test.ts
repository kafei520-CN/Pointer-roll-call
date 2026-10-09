import {describe, expect, it} from 'vitest';
import * as XLSX from 'xlsx';
import {buildTemplateSheets, columnLetter, defaultConfigs, detectConfig, extractPeople, parseWorkbook} from './xlsx';

function workbookBuffer(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const classOne = XLSX.utils.aoa_to_sheet([
    ['备注'],
    ['姓名', '学号', '组别'],
    ['张三', '001', 'A'],
    ['李四', '002', 'B'],
    ['', '', ''],
    ['王五', '003', 'A'],
  ]);
  const classTwo = XLSX.utils.aoa_to_sheet([
    ['名字', '座位'],
    ['赵六', '1'],
  ]);
  XLSX.utils.book_append_sheet(wb, classOne, '一班');
  XLSX.utils.book_append_sheet(wb, classTwo, '二班');
  return XLSX.write(wb, {type: 'array', bookType: 'xlsx'}) as Uint8Array;
}

describe('xlsx import', () => {
  it('lists workbooks sheets and preserves row numbers', () => {
    const book = parseWorkbook(workbookBuffer(), '班级.xlsx');
    expect(book.sheets.map((sheet) => sheet.name)).toEqual(['一班', '二班']);
    expect(book.sheets[0].rows[1][0]).toBe('姓名');
    expect(book.sheets[0].rows[2][0]).toBe('张三');
  });

  it('detects header row and name column', () => {
    const book = parseWorkbook(workbookBuffer(), '班级.xlsx');
    const config = detectConfig(book.sheets[0].rows);
    expect(config.headerRow).toBe(2);
    expect(config.startRow).toBe(3);
    expect(config.nameCol).toBe(0);
  });

  it('extracts people using chosen rows and skips empty names', () => {
    const book = parseWorkbook(workbookBuffer(), '班级.xlsx');
    const extracted = extractPeople(book.sheets[0].rows, {
      name: '一班',
      included: true,
      headerRow: 2,
      startRow: 3,
      endRow: 6,
      nameCol: 0,
    });
    expect(extracted.nameColumnLabel).toBe('姓名');
    expect(extracted.people.map((p) => p.name)).toEqual(['张三', '李四', '王五']);
    expect(extracted.people.map((p) => p.rowNumber)).toEqual([3, 4, 6]);
    expect(extracted.people[0].fields.c1).toBe('001');
  });

  it('applies the chosen import mode to every sheet', () => {
    const book = parseWorkbook(workbookBuffer(), '班级.xlsx');
    const configs = defaultConfigs(book).map((config) => ({
      ...config,
      kind: 'count' as const,
      countMode: 'sequence' as const,
    }));
    const sheets = buildTemplateSheets(book, configs);
    expect(sheets.map((sheet) => sheet.kind)).toEqual(['count', 'count']);
    expect(sheets[0].countMode).toBe('sequence');
    expect(sheets[0].people[0].name).toBe('张三');
  });

  it('converts column index to Excel letters', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});
