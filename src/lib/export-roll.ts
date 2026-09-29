import * as XLSX from 'xlsx';
import type {Session, SessionSheet, Status} from '../types';

/** 未到 is every person still unmarked, on every sheet of this roll call. */
export const EXPORT_GROUP_ORDER: Status[] = ['present', 'absent', 'leave', 'late', 'unset'];

export const EXPORT_LABEL: Record<Status, string> = {
  present: '已到',
  absent: '缺',
  leave: '假',
  late: '迟',
  unset: '未到',
};

export interface ExportLine {
  order: number;
  name: string;
  extra: string;
}

export interface ExportGroupBlock {
  status: Status;
  label: string;
  people: ExportLine[];
}

export interface ExportSection {
  sheetName: string;
  groups: ExportGroupBlock[];
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

export function exportSections(session: Session, groups: Status[]): ExportSection[] {
  const selected = new Set(groups);
  const sections: ExportSection[] = [];
  for (const sheet of session.sheets) {
    const blocks: ExportGroupBlock[] = [];
    for (const status of EXPORT_GROUP_ORDER) {
      if (!selected.has(status)) {
        continue;
      }
      const people: ExportLine[] = [];
      sheet.people.forEach((person, index) => {
        if (person.status !== status) {
          return;
        }
        people.push({
          order: index + 1,
          name: person.name,
          extra: extraText(sheet, person.fields),
        });
      });
      if (people.length > 0) {
        blocks.push({status, label: EXPORT_LABEL[status], people});
      }
    }
    if (blocks.length > 0) {
      sections.push({sheetName: sheet.name, groups: blocks});
    }
  }
  return sections;
}

function extraText(sheet: SessionSheet, fields: Record<string, string>): string {
  return sheet.columns
    .map((column) => fields[column.key])
    .filter((value) => value && value.trim())
    .join(' · ');
}

export function toMarkdown(session: Session, groups: Status[]): string {
  const lines = [`# ${session.name}`, ''];
  for (const section of exportSections(session, groups)) {
    lines.push(`## ${section.sheetName}`, '');
    for (const group of section.groups) {
      lines.push(`### ${group.label}（${group.people.length}）`, '');
      for (const person of group.people) {
        lines.push(`${person.order}. ${person.name}`);
        if (person.extra) {
          lines.push(`   ${person.extra}`);
        }
      }
      lines.push('');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

export function toXlsx(session: Session, groups: Status[]): ArrayBuffer {
  const selected = new Set(groups);
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of session.sheets) {
    const rows: Array<Array<string | number>> = [
      ['序号', '姓名', '状态', ...sheet.columns.map((column) => column.label)],
    ];
    sheet.people.forEach((person, index) => {
      if (!selected.has(person.status)) {
        return;
      }
      rows.push([
        index + 1,
        person.name,
        EXPORT_LABEL[person.status],
        ...sheet.columns.map((column) => person.fields[column.key] ?? ''),
      ]);
    });
    if (rows.length === 1) {
      continue;
    }
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), uniqueSheetName(sheet.name, used));
  }
  if (book.SheetNames.length === 0) {
    throw new Error('所选状态里没有人');
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

export async function toPngBlob(session: Session, groups: Status[]): Promise<Blob> {
  const sections = exportSections(session, groups);
  if (sections.length === 0) {
    throw new Error('所选状态里没有人');
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.toBlob !== 'function') {
    throw new Error('无法生成图片');
  }
  const width = 750;
  const pad = 36;
  const maxText = width - pad * 2;
  const font = '"PingFang SC", "Microsoft YaHei", sans-serif';
  const blocks: Array<{text: string; size: number; color: string; gap: number; bold: boolean}> = [
    {text: session.name, size: 28, color: '#111111', gap: 22, bold: true},
  ];
  for (const section of sections) {
    blocks.push({text: section.sheetName, size: 18, color: '#111111', gap: 12, bold: true});
    for (const group of section.groups) {
      blocks.push({
        text: `${group.label} ${group.people.length}`,
        size: 15,
        color: '#6b6b6b',
        gap: 8,
        bold: true,
      });
      for (const person of group.people) {
        blocks.push({
          text: `${person.order}  ${person.name}`,
          size: 18,
          color: '#111111',
          gap: person.extra ? 4 : 12,
          bold: false,
        });
        if (person.extra) {
          blocks.push({text: person.extra, size: 13, color: '#6b6b6b', gap: 12, bold: false});
        }
      }
    }
  }
  const height = 40 + blocks.reduce((sum, block) => sum + block.size + block.gap, 0) + 16;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'top';
  let y = 32;
  for (const block of blocks) {
    ctx.font = `${block.bold ? '600 ' : ''}${block.size}px ${font}`;
    ctx.fillStyle = block.color;
    ctx.fillText(fitText(ctx, block.text, maxText), pad, y);
    y += block.size + block.gap;
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

export async function saveBlob(filename: string, blob: Blob): Promise<'shared' | 'saved' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const file = new File([bytes], filename, {type: blob.type || 'application/octet-stream'});
    const payload = {files: [file], title: filename};
    const allowed = typeof navigator.canShare !== 'function' || navigator.canShare(payload);
    if (allowed) {
      try {
        await navigator.share(payload);
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'cancelled';
        }
      }
    }
  }
  const url = await downloadUrl(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
  return 'saved';
}

async function downloadUrl(blob: Blob): Promise<string> {
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
