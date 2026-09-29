export const STATUSES = ['unset', 'present', 'absent', 'leave', 'late'] as const;

export type Status = (typeof STATUSES)[number];

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
}

export interface SessionSheet {
  id: string;
  name: string;
  columns: Column[];
  people: SessionPerson[];
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
}
