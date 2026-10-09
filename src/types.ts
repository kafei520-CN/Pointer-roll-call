export const STATUSES = ['unset', 'present', 'absent', 'leave', 'late'] as const;

export type Status = (typeof STATUSES)[number];

/** roll 是到/缺/假/迟。count 记次数。custom 用模板里定义的选项。 */
export const SHEET_KINDS = ['roll', 'count', 'custom'] as const;

export type SheetKind = (typeof SHEET_KINDS)[number];

/** sequence 记下全表序号，例如 1、3、5。tally 只记次数，例如 3。 */
export const COUNT_MODES = ['sequence', 'tally'] as const;

export type CountMode = (typeof COUNT_MODES)[number];

export interface SheetOption {
  id: string;
  label: string;
}

export interface SearchKeys {
  name: string;
  pinyin: string;
  initials: string;
  extra: string;
}

export interface Column {
  key: string;
  label: string;
}

export interface Person {
  id: string;
  rowNumber: number;
  name: string;
  fields: Record<string, string>;
  search: SearchKeys;
}

export interface TemplateSheet {
  id: string;
  name: string;
  headerRow: number;
  nameColumnLabel: string;
  columns: Column[];
  people: Person[];
  /** 缺省视为点名表，旧模板不用迁移。 */
  kind?: SheetKind;
  countMode?: CountMode;
  options?: SheetOption[];
}

export interface Template {
  id: string;
  name: string;
  draft: boolean;
  createdAt: number;
  updatedAt: number;
  sourceFileName?: string;
  sheets: TemplateSheet[];
}

export interface SessionPerson extends Person {
  status: Status;
  note: string;
  markedAt?: number;
  /** 计数表数列。数字是全表第几次点到，可以不连续。 */
  marks?: number[];
  /** 计数表次数。 */
  count?: number;
  /** 自定义表当前选项 id。空字符串表示未选。 */
  choice?: string;
}

export interface SessionSheet {
  id: string;
  name: string;
  columns: Column[];
  people: SessionPerson[];
  kind?: SheetKind;
  countMode?: CountMode;
  options?: SheetOption[];
  /** 数列里可点的序号。缺省时从已选数字推导。新加的数字先放这里，默认无人选中。 */
  sequence?: number[];
}

export interface Session {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  sheets: SessionSheet[];
}

export interface RawSheet {
  name: string;
  rows: string[][];
}

export interface RawWorkbook {
  fileName: string;
  sheets: RawSheet[];
}

export interface SheetImportConfig {
  name: string;
  included: boolean;
  headerRow: number;
  startRow: number;
  endRow: number;
  nameCol: number;
  kind?: SheetKind;
  countMode?: CountMode;
}
