import type {Session, Template} from '../types';

const DB_NAME = 'zhizhen-dianming';
const DB_VERSION = 1;
const LS_KEY = 'zhizhen-dianming-v1';

interface Dump {
  templates: Template[];
  sessions: Session[];
}

function memoryDump(): Dump {
  return {templates: [], sessions: []};
}

function readLocal(): Dump {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return memoryDump();
    }
    const parsed = JSON.parse(raw) as Dump;
    return {
      templates: parsed.templates ?? [],
      sessions: parsed.sessions ?? [],
    };
  } catch {
    return memoryDump();
  }
}

function writeLocal(dump: Dump): void {
  localStorage.setItem(LS_KEY, JSON.stringify(dump));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', {keyPath: 'id'});
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', {keyPath: 'id'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let idb: IDBDatabase | null = null;
let useLocal = false;

export async function initDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    useLocal = true;
    return;
  }
  try {
    idb = await openDb();
  } catch {
    useLocal = true;
  }
}

export async function loadAll(): Promise<Dump> {
  if (useLocal || !idb) {
    return readLocal();
  }
  const tx = idb.transaction(['templates', 'sessions'], 'readonly');
  const templates = await reqToPromise(
    tx.objectStore('templates').getAll() as IDBRequest<Template[]>,
  );
  const sessions = await reqToPromise(
    tx.objectStore('sessions').getAll() as IDBRequest<Session[]>,
  );
  return {templates, sessions};
}

async function putOne(store: 'templates' | 'sessions', value: Template | Session): Promise<void> {
  if (useLocal || !idb) {
    const dump = readLocal();
    const list = dump[store] as Array<Template | Session>;
    const index = list.findIndex((item) => item.id === value.id);
    if (index >= 0) {
      list[index] = value;
    } else {
      list.push(value);
    }
    writeLocal(dump);
    return;
  }
  const tx = idb.transaction(store, 'readwrite');
  await reqToPromise(tx.objectStore(store).put(value));
}

async function deleteOne(store: 'templates' | 'sessions', id: string): Promise<void> {
  if (useLocal || !idb) {
    const dump = readLocal();
    dump[store] = dump[store].filter((item) => item.id !== id) as never;
    writeLocal(dump);
    return;
  }
  const tx = idb.transaction(store, 'readwrite');
  await reqToPromise(tx.objectStore(store).delete(id));
}

export async function resetDb(): Promise<void> {
  if (idb) {
    idb.close();
    idb = null;
  }
  useLocal = false;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
  if (typeof indexedDB === 'undefined') {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

export function saveTemplate(template: Template): Promise<void> {
  return putOne('templates', template);
}

export function saveSession(session: Session): Promise<void> {
  return putOne('sessions', session);
}

export function removeTemplate(id: string): Promise<void> {
  return deleteOne('templates', id);
}

export function removeSession(id: string): Promise<void> {
  return deleteOne('sessions', id);
}
