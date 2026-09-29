type PendingXlsx = {
  fileName: string;
  data: number[] | Uint8Array;
};

type OpenHandler = (file: File) => void;

const handlers = new Set<OpenHandler>();
let queued: File | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function fileFromPending(pending: PendingXlsx): File {
  const source =
    pending.data instanceof Uint8Array ? pending.data : new Uint8Array(pending.data);
  const copy = new ArrayBuffer(source.byteLength);
  new Uint8Array(copy).set(source);
  return new File([copy], pending.fileName || 'import.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function pushOpenedXlsx(file: File): void {
  queued = file;
  for (const handler of handlers) {
    handler(file);
  }
}

export function subscribeOpenedXlsx(handler: OpenHandler): () => void {
  handlers.add(handler);
  if (queued) {
    handler(queued);
  }
  return () => {
    handlers.delete(handler);
  };
}

async function fileKey(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return `${file.size}:${hash >>> 0}`;
}

export function consumeOpenedXlsx(): void {
  queued = null;
}

export function resetOpenWith(): void {
  queued = null;
  handlers.clear();
}

async function takePending(): Promise<File | null> {
  const {invoke} = await import('@tauri-apps/api/core');
  let pending: PendingXlsx | null = null;
  try {
    pending = await invoke<PendingXlsx | null>('scan_opened_xlsx');
  } catch {
    pending = await invoke<PendingXlsx | null>('take_pending_xlsx');
  }
  if (!pending?.data) {
    return null;
  }
  return fileFromPending(pending);
}

export async function setupOpenWith(onFile: OpenHandler): Promise<() => void> {
  if (!isTauri()) {
    return () => undefined;
  }
  let closed = false;
  let chain = Promise.resolve();
  let lastKey = '';
  let lastAt = 0;
  const pull = () => {
    chain = chain
      .then(async () => {
        if (closed) {
          return;
        }
        const file = await takePending();
        if (!file || closed) {
          return;
        }
        const key = await fileKey(file);
        const now = Date.now();
        if (key === lastKey && now - lastAt < 15000) {
          return;
        }
        lastKey = key;
        lastAt = now;
        onFile(file);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  };
  pull();
  const timers = [400, 1200, 3000, 8000].map((delay) => window.setTimeout(pull, delay));
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      pull();
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  let unregisterPlugin = () => undefined as void;
  let unlisten = () => undefined as void;
  try {
    const {addPluginListener} = await import('@tauri-apps/api/core');
    const listener = await addPluginListener('openxlsx', 'xlsxOpened', () => {
      pull();
    });
    unregisterPlugin = () => {
      void listener.unregister();
    };
  } catch {
    // Running on web or the plugin listener is unavailable.
  }
  if (!closed) {
    pull();
  }
  try {
    const {listen} = await import('@tauri-apps/api/event');
    const stop = await listen('xlsx-opened', () => {
      pull();
    });
    const stopOpened = await listen('opened', () => {
      pull();
    });
    unlisten = () => {
      stop();
      stopOpened();
    };
  } catch {
    // The event API is unavailable outside the native shell.
  }
  return () => {
    closed = true;
    document.removeEventListener('visibilitychange', onVisible);
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    unregisterPlugin();
    unlisten();
  };
}
