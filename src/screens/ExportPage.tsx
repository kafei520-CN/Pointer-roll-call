import {useEffect, useState} from 'react';
import {blobHref} from '../lib/export-roll';
import {currentExport, type ExportHandoff} from '../lib/export-handoff';
import {go} from '../router';
import {Shell, TopBar} from '../ui';

export function ExportPage() {
  const [preview] = useState<ExportHandoff | null>(() => currentExport());
  const [href, setHref] = useState('');

  useEffect(() => {
    if (!preview) {
      go('/');
      return;
    }
    let cancelled = false;
    let created = '';
    void blobHref(preview.blob).then((url) => {
      if (cancelled) {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
        return;
      }
      created = url;
      setHref(url);
    });
    return () => {
      cancelled = true;
      if (created.startsWith('blob:')) {
        URL.revokeObjectURL(created);
      }
    };
  }, [preview]);

  if (!preview) {
    return null;
  }

  return (
    <Shell>
      <TopBar title="保存" subtitle={preview.filename} onBack={() => go(preview.back)} />
      <main className="flex-1 overflow-y-auto px-4 py-4">
        {preview.kind === 'png' && href ? (
          <img src={href} alt="" className="w-full rounded-2xl bg-white" />
        ) : null}
        {preview.kind === 'md' ? (
          <pre className="whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-6">{preview.text}</pre>
        ) : null}
        {preview.kind === 'xlsx' ? (
          <p className="rounded-2xl bg-white p-4 text-sm">表格已生成。点下方下载后保存到文件。</p>
        ) : null}
        <p className="mt-3 text-xs text-mute">
          {preview.kind === 'png' ? '点下载保存图片，也可以长按图片后存储。' : '点下载后保存到文件。'}
        </p>
      </main>
      <div className="border-t border-line bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {href ? (
          <a
            href={href}
            download={preview.filename}
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-ink text-sm font-medium text-white"
          >
            下载
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-ink text-sm font-medium text-white opacity-40"
          >
            下载
          </button>
        )}
      </div>
    </Shell>
  );
}
