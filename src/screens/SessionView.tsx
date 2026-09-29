import {useEffect, useMemo, useState} from 'react';
import {IconSearch} from '../icons';
import {
  EXPORT_GROUP_ORDER,
  EXPORT_LABEL,
  exportCounts,
  exportFileStem,
  exportTables,
  toMarkdown,
  toPngBlob,
  toXlsx,
  type ExportShape,
} from '../lib/export-roll';
import {stageExport} from '../lib/export-handoff';
import {closeSession, markPerson, reopenSession, useApp} from '../lib/store';
import {matchesQuery} from '../lib/search';
import {sessionStats, sheetStats, STATUS_LABEL} from '../lib/status';
import {useHorizontalSwipe} from '../lib/swipe';
import {go} from '../router';
import type {Session, SessionPerson, Status} from '../types';
import {STATUSES} from '../types';
import {Button, Modal, Shell, SheetTabs, TopBar, cx} from '../ui';

export function SessionView({id}: {id: string}) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  const [sheetId, setSheetId] = useState(session?.sheets[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [closeOpen, setCloseOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportGroups, setExportGroups] = useState<Status[]>([]);
  const [exportShape, setExportShape] = useState<ExportShape>('brief');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const swipeSheets = useHorizontalSwipe((direction) => {
    if (!session) {
      return;
    }
    const index = session.sheets.findIndex((item) => item.id === sheetId);
    const next = session.sheets[index + direction];
    if (next) {
      setSheetId(next.id);
    }
  });

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!session.sheets.some((item) => item.id === sheetId)) {
      setSheetId(session.sheets[0]?.id ?? '');
    }
  }, [session, sheetId]);

  const sheet = session?.sheets.find((item) => item.id === sheetId) ?? session?.sheets[0];

  const visible = useMemo(() => {
    if (!sheet) {
      return [];
    }
    return sheet.people.filter((person) => {
      if (filter !== 'all' && person.status !== filter) {
        return false;
      }
      return matchesQuery(person.search, person.name, query);
    });
  }, [sheet, filter, query]);

  if (!session || !sheet) {
    return (
      <Shell>
        <TopBar title="点名表不存在" onBack={() => go('/')} />
      </Shell>
    );
  }

  const stats = sheetStats(sheet);
  const all = sessionStats(session);
  const roll = session;

  async function onClose() {
    await closeSession(id);
    setCloseOpen(false);
    go('/');
  }

  function sheetNameLabels(current: Session): Record<string, string> {
    const template = app.templates.find((item) => item.id === current.templateId);
    const labels: Record<string, string> = {};
    for (const item of current.sheets) {
      const match = template?.sheets.find((sheetItem) => sheetItem.name === item.name);
      labels[item.id] = match?.nameColumnLabel || '姓名';
    }
    return labels;
  }

  function openExport(current: Session) {
    const counts = exportCounts(current);
    setExportGroups(EXPORT_GROUP_ORDER.filter((status) => counts[status] > 0));
    setExportShape('brief');
    setExportError('');
    setExportOpen(true);
  }

  async function runExport(format: 'md' | 'png' | 'xlsx') {
    const labels = sheetNameLabels(roll);
    if (exportTables(roll, exportGroups, exportShape, labels).length === 0) {
      setExportError('所选状态里没有人');
      return;
    }
    const stem = exportFileStem(roll.name);
    const back = `/session/${roll.id}`;
    setExporting(true);
    setExportError('');
    try {
      if (format === 'md') {
        const text = toMarkdown(roll, exportGroups, exportShape, labels);
        stageExport({
          filename: `${stem}.md`,
          blob: new Blob([text], {type: 'text/markdown;charset=utf-8'}),
          text,
          kind: 'md',
          back,
        });
      } else if (format === 'png') {
        const png = await toPngBlob(roll, exportGroups, exportShape, labels);
        stageExport({filename: `${stem}.png`, blob: png, text: '', kind: 'png', back});
      } else {
        const bytes = toXlsx(roll, exportGroups, exportShape, labels);
        stageExport({
          filename: `${stem}.xlsx`,
          blob: new Blob([bytes], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          text: '',
          kind: 'xlsx',
          back,
        });
      }
      setExportOpen(false);
      go('/export');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Shell>
      <TopBar
        title={session.name}
        subtitle={
          session.closedAt
            ? `历史 · 到 ${all.present} · 缺 ${all.absent} · 未点 ${all.unset}`
            : `到 ${stats.present} · 缺 ${stats.absent} · 未点 ${stats.unset}`
        }
        onBack={() => go('/')}
        right={
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 px-3 text-sm" onClick={() => openExport(session)}>
              导出
            </Button>
            {session.closedAt ? (
              <Button
                variant="outline"
                className="h-10 px-3 text-sm"
                onClick={() => void reopenSession(session.id)}
              >
                继续
              </Button>
            ) : (
              <Button className="h-10 px-3 text-sm" onClick={() => setCloseOpen(true)}>
                关闭
              </Button>
            )}
          </div>
        }
      />
      <div className="space-y-3 px-4 pt-3">
        <label className="flex h-11 items-center gap-2 rounded-2xl border border-line bg-white px-3">
          <IconSearch className="h-4 w-4 text-mute" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="姓名、拼音、首字母或学号"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {(['all', ...STATUSES] as const).map((item) => {
            const label = item === 'all' ? '全部' : STATUS_LABEL[item];
            const count =
              item === 'all' ? stats.total : stats[item];
            return (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cx(
                  'h-9 shrink-0 rounded-full px-3 text-xs',
                  filter === item ? 'bg-ink text-white' : 'bg-soft text-ink',
                )}
              >
                {label} {count}
              </button>
            );
          })}
        </div>
      </div>
      <main className="flex-1 overflow-y-auto px-4 py-3 pb-2" data-testid="menu-swipe" {...swipeSheets}>
        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-mute">没有匹配的人</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                order={sheet.people.findIndex((item) => item.id === person.id) + 1}
                columns={sheet.columns}
                onStatus={(status) =>
                  void markPerson(session.id, sheet.id, person.id, status)
                }
              />
            ))}
          </ul>
        )}
      </main>
      <SheetTabs names={session.sheets} active={sheet.id} onChange={setSheetId} />
      <Modal open={exportOpen} title="导出" onClose={() => setExportOpen(false)}>
        <p className="text-xs text-mute">只导出勾选的人。未到是所有还没点到的人，包含每张工作表。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXPORT_GROUP_ORDER.map((status) => {
            const on = exportGroups.includes(status);
            const count = exportCounts(session)[status];
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setExportGroups((current) =>
                    current.includes(status)
                      ? current.filter((item) => item !== status)
                      : [...current, status],
                  )
                }
                className={cx(
                  'h-9 rounded-full px-3 text-xs',
                  on ? 'bg-ink text-white' : 'bg-soft text-ink',
                )}
              >
                {EXPORT_LABEL[status]} {count}
              </button>
            );
          })}
        </div>
        <p className="mb-2 mt-4 text-xs text-mute">列</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={exportShape === 'template'}
            onClick={() => setExportShape('template')}
            className={cx(
              'h-9 rounded-full px-3 text-xs',
              exportShape === 'template' ? 'bg-ink text-white' : 'bg-soft text-ink',
            )}
          >
            模板格式
          </button>
          <button
            type="button"
            aria-pressed={exportShape === 'brief'}
            onClick={() => setExportShape('brief')}
            className={cx(
              'h-9 rounded-full px-3 text-xs',
              exportShape === 'brief' ? 'bg-ink text-white' : 'bg-soft text-ink',
            )}
          >
            序号+名字+状态
          </button>
        </div>
        <p className="mb-2 mt-4 text-xs text-mute">格式</p>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="soft" disabled={exporting || exportGroups.length === 0} onClick={() => void runExport('md')}>
            Markdown
          </Button>
          <Button variant="soft" disabled={exporting || exportGroups.length === 0} onClick={() => void runExport('png')}>
            图片
          </Button>
          <Button variant="soft" disabled={exporting || exportGroups.length === 0} onClick={() => void runExport('xlsx')}>
            表格
          </Button>
        </div>
        {exportError ? <p className="mt-3 text-sm">{exportError}</p> : null}
      </Modal>
      <Modal open={closeOpen} title="关闭点名" onClose={() => setCloseOpen(false)}>
        <p className="text-sm text-mute">
          {stats.unset > 0
            ? `当前表还有 ${stats.unset} 人未点。关闭后可在历史里再次打开。`
            : '关闭后可在历史里查看。'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => setCloseOpen(false)}>
            取消
          </Button>
          <Button onClick={() => void onClose()}>关闭</Button>
        </div>
      </Modal>
    </Shell>
  );
}

function PersonCard({
  person,
  order,
  columns,
  onStatus,
}: {
  person: SessionPerson;
  order: number;
  columns: Array<{key: string; label: string}>;
  onStatus: (status: Status) => void;
}) {
  const extra = columns
    .map((col) => person.fields[col.key])
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="rounded-3xl border border-line bg-white p-3">
      <div className="flex items-start gap-3">
        <span className="w-8 pt-1 text-xs text-mute">{order}</span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onStatus(cycle(person.status))}
        >
          <p className="truncate font-medium">{person.name}</p>
          {extra ? <p className="mt-0.5 truncate text-xs text-mute">{extra}</p> : null}
        </button>
        <span
          className={cx(
            'rounded-full px-2 py-1 text-xs',
            person.status === 'present' && 'bg-ink text-white',
            person.status === 'unset' && 'bg-soft text-mute',
            person.status !== 'present' && person.status !== 'unset' && 'border border-ink',
          )}
        >
          {STATUS_LABEL[person.status]}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {(['present', 'absent', 'leave', 'late'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatus(status)}
            className={cx(
              'h-10 rounded-2xl text-sm',
              person.status === status ? 'bg-ink text-white' : 'bg-soft text-ink',
            )}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>
    </li>
  );
}

function cycle(status: Status): Status {
  const order: Status[] = ['unset', 'present', 'absent', 'leave', 'late'];
  return order[(order.indexOf(status) + 1) % order.length];
}
