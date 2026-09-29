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

export function consumeOpenedXlsx(): void {
  queued = null;
}

export function resetOpenWith(): void {
  queued = null;
  handlers.clear();
}

async function takePending(): Promise<File | null> {
  const {invoke} = await import('@tauri-apps/api/core');
  const pending = await invoke<PendingXlsx | null>('plugin:openxlsx|take_pending_xlsx');
  if (!pending?.data) {
    return null;
  }
  return fileFromPending(pending);
}

export async function setupOpenWith(onFile: OpenHandler): Promise<() => void> {
  if (!isTauri()) {
    return () => undefined;
  }
  const apply = (file: File | null) => {
    if (file) {
      onFile(file);
    }
  };
  try {
    apply(await takePending());
  } catch {
    // Running on web or the command is unavailable.
  }
  try {
    const {addPluginListener} = await import('@tauri-apps/api/core');
    const listener = await addPluginListener('openxlsx', 'xlsxOpened', () => {
      void takePending().then(apply);
    });
    return () => {
      void listener.unregister();
    };
  } catch {
    return () => undefined;
  }
}
