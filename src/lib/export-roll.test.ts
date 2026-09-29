import {describe, expect, it} from 'vitest';
import * as XLSX from 'xlsx';
import {exportSections, toMarkdown, toXlsx} from './export-roll';
import type {Session, SessionPerson, Status} from '../types';

function person(id: string, name: string, status: Status, studentNo: string): SessionPerson {
  return {
    id,
    rowNumber: 1,
    name,
    fields: {c1: studentNo},
    search: {name, pinyin: '', initials: '', extra: studentNo},
    status,
    note: '',
  };
}

function sample(): Session {
  return {
    id: 's1',
    name: '高一1班 9/29 15:22',
    templateId: 't1',
    templateName: '高一1班',
    createdAt: 1,
    updatedAt: 1,
    sheets: [
      {
        id: 'a',
        name: '一班',
        columns: [{key: 'c1', label: '学号'}],
        people: [
          person('p1', '张三', 'present', '001'),
          person('p2', '李四', 'unset', '002'),
          person('p3', '王五', 'absent', '003'),
        ],
      },
      {
        id: 'b',
        name: '二班',
        columns: [{key: 'c1', label: '学号'}],
        people: [person('p4', '赵六', 'unset', '004')],
      },
    ],
  };
}

describe('roll-call export', () => {
  it('exports every unmarked person on every sheet as 未到', () => {
    const markdown = toMarkdown(sample(), ['unset']);
    expect(markdown).toContain('### 未到（1）');
    expect(markdown).toContain('2. 李四');
    expect(markdown).toContain('002');
    expect(markdown).toContain('1. 赵六');
    expect(markdown).toContain('## 二班');
    expect(markdown).not.toContain('张三');
    expect(markdown).not.toContain('王五');
    expect(exportSections(sample(), ['unset']).flatMap((section) => section.groups).every((group) => group.label === '未到')).toBe(true);
  });

  it('writes an xlsx with the chosen statuses', () => {
    const book = XLSX.read(toXlsx(sample(), ['present', 'absent']), {type: 'array'});
    expect(book.SheetNames).toEqual(['一班']);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['一班'], {header: 1});
    expect(rows[0]).toEqual(['序号', '姓名', '状态', '学号']);
    expect(rows).toContainEqual([1, '张三', '已到', '001']);
    expect(rows).toContainEqual([3, '王五', '缺', '003']);
    expect(rows.some((row) => row.includes('李四'))).toBe(false);
  });
});
