import {useSyncExternalStore} from 'react';
import type {
  Person,
  Session,
  SessionPerson,
  SheetKind,
  Status,
  Template,
  TemplateSheet,
} from '../types';
import {
  addSequenceSlot,
  addTally,
  appendMark,
  countMode,
  deleteSequenceNumber,
  dropLastMark,
  sheetSequence,
  toggleOwnMark,
} from './sheet-record';
import {
  initDb,
  loadAll,
  removeSession,
  removeTemplate,
  resetDb,
  saveSession,
  saveTemplate,
} from './db';
import {createId} from './id';

export interface AppState {
  ready: boolean;
  templates: Template[];
  sessions: Session[];
}

let state: AppState = {ready: false, templates: [], sessions: []};
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<AppState>): void {
  state = {...state, ...patch};
  emit();
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export async function resetForTests(): Promise<void> {
  await resetDb();
  state = {ready: false, templates: [], sessions: []};
  emit();
}

export async function hydrate(): Promise<void> {
  await initDb();
  const dump = await loadAll();
  setState({
    ready: true,
    templates: dump.templates.sort((a, b) => b.updatedAt - a.updatedAt),
    sessions: dump.sessions.sort((a, b) => b.updatedAt - a.updatedAt),
  });
}

function sortTemplates(list: Template[]): Template[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortSessions(list: Session[]): Session[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function emptySheet(name = '名单', kind: SheetKind = 'roll'): TemplateSheet {
  return {
    id: createId(),
    name,
    headerRow: 1,
    nameColumnLabel: '姓名',
    columns: [],
    people: [],
    kind,
    countMode: kind === 'count' ? 'tally' : undefined,
    options: kind === 'custom' ? [] : undefined,
  };
}

export async function createBlankTemplate(): Promise<Template> {
  const now = Date.now();
  const template: Template = {
    id: createId(),
    name: '未命名模板',
    draft: true,
    createdAt: now,
    updatedAt: now,
    sheets: [emptySheet()],
  };
  await saveTemplate(template);
  setState({templates: sortTemplates([template, ...state.templates])});
  return template;
}

export async function createTemplateFromSheets(
  name: string,
  sourceFileName: string,
  sheets: TemplateSheet[],
): Promise<Template> {
  const now = Date.now();
  const template: Template = {
    id: createId(),
    name,
    draft: true,
    createdAt: now,
    updatedAt: now,
    sourceFileName,
    sheets,
  };
  await saveTemplate(template);
  setState({templates: sortTemplates([template, ...state.templates])});
  return template;
}

export async function upsertTemplate(template: Template): Promise<void> {
  const next = {...template, updatedAt: Date.now()};
  await saveTemplate(next);
  const others = state.templates.filter((item) => item.id !== next.id);
  setState({templates: sortTemplates([next, ...others])});
}

export async function deleteTemplate(id: string): Promise<void> {
  await removeTemplate(id);
  setState({templates: state.templates.filter((item) => item.id !== id)});
}

export function clonePerson(person: Person): SessionPerson {
  return {
    ...person,
    id: createId(),
    fields: {...person.fields},
    search: person.search,
    status: 'unset',
    note: '',
    marks: [],
    count: 0,
    choice: '',
  };
}

export async function createSession(templateId: string, name: string): Promise<Session> {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error('模板不存在');
  }
  const now = Date.now();
  const session: Session = {
    id: createId(),
    name,
    templateId: template.id,
    templateName: template.name,
    createdAt: now,
    updatedAt: now,
    sheets: template.sheets.map((sheet) => ({
      id: createId(),
      name: sheet.name,
      kind: sheet.kind ?? 'roll',
      countMode: sheet.countMode ?? 'tally',
      options: (sheet.options ?? []).map((option) => ({...option})),
      columns: sheet.columns.map((col) => ({...col})),
      people: sheet.people.map(clonePerson),
    })),
  };
  await saveSession(session);
  setState({sessions: sortSessions([session, ...state.sessions])});
  return session;
}

export async function upsertSession(session: Session): Promise<void> {
  const next = {...session, updatedAt: Date.now()};
  await saveSession(next);
  const others = state.sessions.filter((item) => item.id !== next.id);
  setState({sessions: sortSessions([next, ...others])});
}

async function writeSession(next: Session): Promise<void> {
  await saveSession(next);
  const others = state.sessions.filter((item) => item.id !== next.id);
  setState({sessions: sortSessions([next, ...others])});
}

function withPerson(
  session: Session,
  sheetId: string,
  personId: string,
  edit: (person: SessionPerson, sheet: Session['sheets'][number]) => SessionPerson,
): Session {
  return {
    ...session,
    updatedAt: Date.now(),
    sheets: session.sheets.map((sheet) => {
      if (sheet.id !== sheetId) {
        return sheet;
      }
      return {
        ...sheet,
        people: sheet.people.map((person) =>
          person.id === personId ? edit(person, sheet) : person,
        ),
      };
    }),
  };
}

export async function bumpCount(
  sessionId: string,
  sheetId: string,
  personId: string,
  delta: 1 | -1,
): Promise<void> {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  const target = session.sheets.find((sheet) => sheet.id === sheetId);
  if (target && countMode(target) === 'sequence' && delta > 0) {
    const next: Session = {
      ...session,
      updatedAt: Date.now(),
      sheets: session.sheets.map((sheet) =>
        sheet.id === sheetId
          ? {...sheet, sequence: addSequenceSlot(sheetSequence(sheet))}
          : sheet,
      ),
    };
    await writeSession(next);
    return;
  }
  const next = withPerson(session, sheetId, personId, (person, sheet) => {
    if (countMode(sheet) === 'sequence') {
      return delta < 0 ? dropLastMark(person) : appendMark(person, sheet.people);
    }
    return addTally(person, delta);
  });
  await writeSession(next);
}

export async function deleteCountNumber(
  sessionId: string,
  sheetId: string,
  mark: number,
): Promise<void> {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  const next: Session = {
    ...session,
    updatedAt: Date.now(),
    sheets: session.sheets.map((sheet) =>
      sheet.id === sheetId
        ? {
            ...sheet,
            sequence: sheetSequence(sheet).filter((item) => item !== mark),
            people: deleteSequenceNumber(sheet.people, mark),
          }
        : sheet,
    ),
  };
  await writeSession(next);
}

export async function toggleCountNumber(
  sessionId: string,
  sheetId: string,
  personId: string,
  mark: number,
): Promise<void> {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  const next: Session = {
    ...session,
    updatedAt: Date.now(),
    sheets: session.sheets.map((sheet) =>
      sheet.id === sheetId
        ? {
            ...sheet,
            sequence: sheetSequence(sheet),
            people: toggleOwnMark(sheet.people, personId, mark),
          }
        : sheet,
    ),
  };
  await writeSession(next);
}

export async function chooseOption(
  sessionId: string,
  sheetId: string,
  personId: string,
  choice: string,
): Promise<void> {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  const next = withPerson(session, sheetId, personId, (person) => ({
    ...person,
    choice,
    markedAt: Date.now(),
  }));
  await writeSession(next);
}

export async function markPerson(
  sessionId: string,
  sheetId: string,
  personId: string,
  status: Status,
): Promise<void> {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  const next = withPerson(session, sheetId, personId, (person) => ({
    ...person,
    status,
    markedAt: Date.now(),
  }));
  await writeSession(next);
}

export async function closeSession(id: string): Promise<void> {
  const session = state.sessions.find((item) => item.id === id);
  if (!session) {
    return;
  }
  await upsertSession({...session, closedAt: Date.now()});
}

export async function reopenSession(id: string): Promise<void> {
  const session = state.sessions.find((item) => item.id === id);
  if (!session) {
    return;
  }
  const next = {...session, closedAt: undefined, updatedAt: Date.now()};
  await writeSession(next);
}

export async function deleteSession(id: string): Promise<void> {
  await removeSession(id);
  setState({sessions: state.sessions.filter((item) => item.id !== id)});
}


