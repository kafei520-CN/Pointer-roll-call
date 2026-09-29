import {useEffect, useRef, useState} from 'react';
import {currentExport, type ExportHandoff} from '../lib/export-handoff';
import {go} from '../router';
import {Shell, TopBar} from '../ui';

export function ExportPage() {
  const [preview] = useState<ExportHandoff | null>(() => currentExport());
  const [notice, setNotice] = useState('');
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!preview) {
      go('/');
    }
  }, [preview]);

  if (!preview) {
    return null;
  }
  const handoff = preview;

  async function copyAll() {
    const node = textRef.current;
    const selection = window.getSelection();
    if (node && selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(handoff.text);
        setNotice('已复制');
        return;
      }
    } catch {
      // The webview blocked the clipboard. The text is still selected.
    }
    try {
      if (document.execCommand('copy')) {
        setNotice('已复制');
        return;
      }
    } catch {
      // Leave the selection in place so a long-press can copy it.
    }
    setNotice('文字已选中。长按后点复制。');
  }

  return (
    <Shell>
      <TopBar title="导出" subtitle="长按文字即可复制" onBack={() => go(handoff.back)} />
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <pre
          ref={textRef}
          className="export-text whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-6"
        >
          {handoff.text}
        </pre>
        <p className="mt-3 text-xs text-mute">没有文件下载。长按上面的文字，或点下面的复制。</p>
        {notice ? <p className="mt-2 text-sm">{notice}</p> : null}
      </main>
      <div className="border-t border-line bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void copyAll()}
          className="flex h-11 w-full items-center justify-center rounded-2xl bg-ink text-sm font-medium text-white"
        >
          复制
        </button>
      </div>
    </Shell>
  );
}
