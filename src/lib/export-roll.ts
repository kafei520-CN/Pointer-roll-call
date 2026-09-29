import * as XLSX from 'xlsx';
import type {Session, SessionPerson, SessionSheet, Status} from '../types';

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
): ExportTable[] {
  const selected = new Set(groups);
  const tables: ExportTable[] = [];
  for (const sheet of session.sheets) {
    const people: Array<{person: SessionPerson; order: number}> = [];
    sheet.people.forEach((person, index) => {
      if (selected.has(person.status)) {
        people.push({person, order: index + 1});
      }
    });
    if (people.length === 0) {
      continue;
    }
    if (shape === 'brief') {
      tables.push({
        sheetName: sheet.name,
        headers: ['序号', '名字', '状态'],
        rows: people.map(({person, order}) => [order, person.name, EXPORT_LABEL[person.status]]),
      });
      continue;
    }
    const cells = templateCells(sheet, nameLabels[sheet.id] || '姓名');
    tables.push({
      sheetName: sheet.name,
      headers: cells.map((cell) => cell.label),
      rows: people.map(({person}) => cells.map((cell) => cell.value(person))),
    });
  }
  return tables;
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
): string {
  const lines = [`# ${session.name}`, ''];
  for (const table of exportTables(session, groups, shape, nameLabels)) {
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

export function exportFileStem(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || '点名';
}

export async function toPngBlob(
  session: Session,
  groups: Status[],
  shape: ExportShape,
  nameLabels: Record<string, string> = {},
): Promise<Blob> {
  const tables = exportTables(session, groups, shape, nameLabels);
  if (tables.length === 0) {
    throw new Error('所选状态里没有人');
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.toBlob !== 'function') {
    throw new Error('无法生成图片');
  }
  const width = 750;
  const pad = 36;
  const font = '"PingFang SC", "Microsoft YaHei", sans-serif';
  const rowHeight = 28;
  const height =
    32 +
    28 +
    16 +
    tables.reduce((sum, table) => sum + 30 + 22 + table.rows.length * rowHeight + 12, 0);
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#111111';
  ctx.font = `600 28px ${font}`;
  ctx.fillText(fitText(ctx, session.name, width - pad * 2), pad, 32);
  let y = 76;
  for (const table of tables) {
    const colWidth = (width - pad * 2) / Math.max(table.headers.length, 1);
    ctx.fillStyle = '#111111';
    ctx.font = `600 18px ${font}`;
    ctx.fillText(fitText(ctx, table.sheetName, width - pad * 2), pad, y);
    y += 30;
    ctx.fillStyle = '#6b6b6b';
    ctx.font = `600 14px ${font}`;
    table.headers.forEach((header, index) => {
      ctx.fillText(fitText(ctx, header, colWidth - 8), pad + index * colWidth, y);
    });
    y += 22;
    ctx.fillStyle = '#111111';
    ctx.font = `18px ${font}`;
    for (const row of table.rows) {
      row.forEach((cell, index) => {
        ctx.fillText(fitText(ctx, String(cell), colWidth - 8), pad + index * colWidth, y);
      });
      y += rowHeight;
    }
    y += 12;
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });
  if (!blob) {
    throw new Error('无法生成图片');
  }
  return blob;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
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

export async function blobHref(blob: Blob): Promise<string> {
  if (typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(blob);
    } catch {
      // jsdom's object URL cannot read this blob; a data URL still downloads it.
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
