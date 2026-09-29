import {describe, expect, it} from 'vitest';
import * as XLSX from 'xlsx';
import {toMarkdown, toXlsx} from './export-roll';
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
  it('exports only the selected statuses, as 序号 + 名字 + 状态', () => {
    const markdown = toMarkdown(sample(), ['unset'], 'brief');
    expect(markdown).toContain('| 2 | 李四 | 未到 |');
    expect(markdown).toContain('| 1 | 赵六 | 未到 |');
    expect(markdown).toContain('## 二班');
    expect(markdown).not.toContain('张三');
    expect(markdown).not.toContain('王五');
    expect(markdown).not.toContain('002');
  });

  it('exports every person when the scope is the whole sheet', () => {
    const markdown = toMarkdown(sample(), [], 'brief', {}, 'all');
    expect(markdown).toContain('| 1 | 张三 | 已到 |');
    expect(markdown).toContain('| 2 | 李四 | 未到 |');
    expect(markdown).toContain('| 3 | 王五 | 缺 |');
    expect(markdown).toContain('| 1 | 赵六 | 未到 |');
  });

  it('writes a brief xlsx with only the chosen rows', () => {
    const book = XLSX.read(toXlsx(sample(), ['present', 'absent'], 'brief'), {type: 'array'});
    expect(book.SheetNames).toEqual(['一班']);
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['一班'], {header: 1});
    expect(rows[0]).toEqual(['序号', '名字', '状态']);
    expect(rows).toContainEqual([1, '张三', '已到']);
    expect(rows).toContainEqual([3, '王五', '缺']);
    expect(rows.some((row) => row.includes('李四'))).toBe(false);
    expect(rows.some((row) => row.includes('001'))).toBe(false);
  });

  it('writes template columns for the selected rows only', () => {
    const book = XLSX.read(
      toXlsx(sample(), ['unset'], 'template', {a: '姓名', b: '姓名'}),
      {type: 'array'},
    );
    expect(book.SheetNames).toEqual(['一班', '二班']);
    const first = XLSX.utils.sheet_to_json<string[]>(book.Sheets['一班'], {header: 1});
    expect(first[0]).toEqual(['姓名', '学号']);
    expect(first).toContainEqual(['李四', '002']);
    expect(first.some((row) => row.includes('张三') || row.includes('王五'))).toBe(false);
    const second = XLSX.utils.sheet_to_json<string[]>(book.Sheets['二班'], {header: 1});
    expect(second).toContainEqual(['赵六', '004']);
  });

  it('puts the name back into its original template column', () => {
    const session = sample();
    session.sheets[0].columns = [
      {key: 'c0', label: '学号'},
      {key: 'c2', label: '班级'},
    ];
    session.sheets[0].people[1].fields = {c0: '002', c2: '桥梁'};
    const book = XLSX.read(toXlsx(session, ['unset'], 'template', {a: '学生'}), {type: 'array'});
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets['一班'], {header: 1});
    expect(rows[0]).toEqual(['学号', '学生', '班级']);
    expect(rows).toContainEqual(['002', '李四', '桥梁']);
    expect(rows.some((row) => row.includes('张三'))).toBe(false);
  });
});
