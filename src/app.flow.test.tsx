/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as XLSX from 'xlsx';
import App from './App';
import {openOpenedWorkbook} from './lib/opened-template';
import {buildSearchKeys} from './lib/search';
import {resetOpenWith} from './lib/open-with';
import {createTemplateFromSheets, resetForTests} from './lib/store';
import {TemplateEditor} from './screens/TemplateEditor';

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  window.location.hash = '';
  resetOpenWith();
  await resetForTests();
});

function sampleFile(): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['姓名', '学号'],
      ['张三', '001'],
      ['李四', '002'],
    ]),
    '一班',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['名字'],
      ['王五'],
    ]),
    '二班',
  );
  const written = XLSX.write(wb, {type: 'array', bookType: 'xlsx'}) as ArrayBuffer | Uint8Array;
  const view = written instanceof Uint8Array ? written : new Uint8Array(written);
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return new File([copy], '班级.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('local roll-call flow', () => {
  it('imports xlsx with sheet and row selection, then saves a template', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', {name: '指针点名'});
    await user.click(screen.getByRole('button', {name: '模板'}));
    await user.click(screen.getByRole('button', {name: '导入 Excel'}));
    await screen.findByRole('heading', {name: '导入为模板'});

    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    await user.upload(input as HTMLInputElement, sampleFile());

    expect(await screen.findByDisplayValue('班级')).toBeTruthy();
    expect(screen.getAllByText(/一班|Sheet1/).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('1').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', {name: '进入编辑'}));
    expect(await screen.findByRole('heading', {name: '编辑模板'})).toBeTruthy();

    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(await screen.findByRole('heading', {name: '指针点名'})).toBeTruthy();
    await user.click(screen.getByRole('button', {name: '模板'}));
    expect(await screen.findByText('班级')).toBeTruthy();
  });

  it('creates a session from a template, searches by initials, closes into history', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', {name: '指针点名'});
    await user.click(screen.getByRole('button', {name: '模板'}));
    await user.click(screen.getByRole('button', {name: '空白模板'}));
    await screen.findByRole('heading', {name: '编辑模板'});

    const nameField = screen.getByLabelText('模板名称');
    await user.clear(nameField);
    await user.type(nameField, '高一1班');

    const add = screen.getByPlaceholderText('添加姓名');
    await user.type(add, '张三{Enter}');
    await user.type(add, '李四{Enter}');
    expect(await screen.findByDisplayValue('张三')).toBeTruthy();
    expect(screen.getByDisplayValue('李四')).toBeTruthy();
    expect(within(screen.getByDisplayValue('张三').closest('li') as HTMLElement).getByText('1')).toBeTruthy();
    expect(within(screen.getByDisplayValue('李四').closest('li') as HTMLElement).getByText('2')).toBeTruthy();

    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(await screen.findByRole('heading', {name: '指针点名'})).toBeTruthy();

    await user.click(await screen.findByRole('button', {name: '从模板新建'}));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByText('高一1班'));
    await user.click(screen.getByRole('button', {name: '开始点名'}));

    expect(await screen.findByPlaceholderText('姓名、拼音、首字母或学号')).toBeTruthy();
    const zhang = screen.getByText('张三');
    const row = zhang.closest('li');
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText('1')).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole('button', {name: '到'}));
    expect(within(row as HTMLElement).getAllByText('到').length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText('姓名、拼音、首字母或学号'), 'zs');
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.queryByText('李四')).toBeNull();

    await user.click(screen.getByRole('button', {name: '导出'}));
    const exportDialog = await screen.findByRole('dialog');
    expect(within(exportDialog).getByRole('button', {name: /已到/}).getAttribute('aria-pressed')).toBe('true');
    expect(within(exportDialog).getByRole('button', {name: /未到/}).getAttribute('aria-pressed')).toBe('true');
    expect(within(exportDialog).getByRole('button', {name: /缺/}).getAttribute('aria-pressed')).toBe('false');
    expect(within(exportDialog).getByRole('button', {name: '序号+名字+状态'}).getAttribute('aria-pressed')).toBe('true');
    expect(within(exportDialog).getByRole('button', {name: '模板格式'}).getAttribute('aria-pressed')).toBe('false');
    expect(within(exportDialog).getByRole('button', {name: '仅导出选中行'}).getAttribute('aria-pressed')).toBe('true');
    expect(within(exportDialog).getByRole('button', {name: '导出整表'}).getAttribute('aria-pressed')).toBe('false');
    await user.click(within(exportDialog).getByRole('button', {name: /未到/}));
    await user.click(within(exportDialog).getByRole('button', {name: '导出整表'}));
    await user.click(within(exportDialog).getByRole('button', {name: '显示文字'}));
    expect(await screen.findByRole('heading', {name: '导出'})).toBeTruthy();
    expect(screen.getByText(/李四/)).toBeTruthy();
    expect(screen.getByText(/张三/)).toBeTruthy();
    expect(screen.queryByRole('link', {name: '下载'})).toBeNull();
    expect(screen.getByRole('button', {name: '复制'})).toBeTruthy();
    await user.click(screen.getByRole('button', {name: '返回'}));

    await user.click(screen.getByRole('button', {name: '关闭'}));
    const closeDialog = await screen.findByRole('dialog');
    await user.click(within(closeDialog).getByRole('button', {name: '关闭'}));
    expect(await screen.findByRole('heading', {name: '指针点名'})).toBeTruthy();
    expect(screen.getByText('历史')).toBeTruthy();
    expect(screen.getByText(/高一1班/)).toBeTruthy();
  });

  it('shows the first imported person as 1 when the sheet header occupied row 1', async () => {
    const template = await createTemplateFromSheets('学号查询', '学号查询.xlsx', [
      {
        id: 'sheet-1',
        name: 'Sheet1',
        headerRow: 1,
        nameColumnLabel: '姓名',
        columns: [{key: 'c0', label: '序号'}],
        people: [
          {id: 'p1', rowNumber: 2, name: '张三', fields: {c0: '1'}, search: buildSearchKeys('张三', {c0: '1'})},
          {id: 'p2', rowNumber: 3, name: '李四', fields: {c0: '2'}, search: buildSearchKeys('李四', {c0: '2'})},
        ],
      },
    ]);
    render(<TemplateEditor id={template.id} />);
    const first = await screen.findByDisplayValue('张三');
    expect(within(first.closest('li') as HTMLElement).getByText('1')).toBeTruthy();
    expect(within(screen.getByDisplayValue('李四').closest('li') as HTMLElement).getByText('2')).toBeTruthy();
  });

  it('swipes between the home menus', async () => {
    render(<App />);
    await screen.findByRole('heading', {name: '指针点名'});
    const surface = screen.getByTestId('menu-swipe');
    expect(screen.getByRole('button', {name: '从模板新建'})).toBeTruthy();

    swipe(surface, 280, 40);
    expect(screen.getByRole('button', {name: '导入 Excel'})).toBeTruthy();
    swipe(surface, 40, 280);
    expect(screen.getByRole('button', {name: '从模板新建'})).toBeTruthy();

    fireEvent.pointerDown(surface, {pointerType: 'touch', clientX: 180, clientY: 80});
    fireEvent.pointerUp(surface, {pointerType: 'touch', clientX: 190, clientY: 240});
    fireEvent.pointerDown(surface, {pointerType: 'mouse', clientX: 280, clientY: 180});
    fireEvent.pointerUp(surface, {pointerType: 'mouse', clientX: 20, clientY: 180});
    expect(screen.getByRole('button', {name: '从模板新建'})).toBeTruthy();
  });

  it('creates a template when another app opens an xlsx', async () => {
    render(<App />);
    await screen.findByRole('heading', {name: '指针点名'});
    await openOpenedWorkbook(sampleFile());

    expect(await screen.findByRole('heading', {name: '编辑模板'})).toBeTruthy();
    expect(screen.getByDisplayValue('班级')).toBeTruthy();
    expect(screen.getByDisplayValue('张三')).toBeTruthy();
    expect(screen.queryByDisplayValue('王五')).toBeNull();

    swipe(screen.getByTestId('menu-swipe'), 280, 40);
    expect(screen.getByDisplayValue('王五')).toBeTruthy();
    expect(screen.queryByDisplayValue('张三')).toBeNull();
    swipe(screen.getByTestId('menu-swipe'), 40, 280);
    expect(screen.getByDisplayValue('张三')).toBeTruthy();
  });

  it('keeps an unreadable opened file on the import screen', async () => {
    render(<App />);
    await screen.findByRole('heading', {name: '指针点名'});
    await openOpenedWorkbook(new File([Uint8Array.from([1, 2, 3])], '坏.xlsx'));
    expect(await screen.findByRole('heading', {name: '导入为模板'})).toBeTruthy();
    expect(screen.queryByRole('heading', {name: '编辑模板'})).toBeNull();
  });
});

function swipe(element: HTMLElement, fromX: number, toX: number) {
  fireEvent.pointerDown(element, {pointerType: 'touch', clientX: fromX, clientY: 180});
  fireEvent.pointerUp(element, {pointerType: 'touch', clientX: toX, clientY: 188});
}
