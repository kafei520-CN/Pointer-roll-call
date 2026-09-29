import {useEffect, useMemo, useState} from 'react';
import {IconSearch} from '../icons';
import {closeSession, markPerson, reopenSession, useApp} from '../lib/store';
import {matchesQuery} from '../lib/search';
import {sessionStats, sheetStats, STATUS_LABEL} from '../lib/status';
import {go} from '../router';
import type {SessionPerson, Status} from '../types';
import {STATUSES} from '../types';
import {Button, Modal, Shell, SheetTabs, TopBar, cx} from '../ui';

export function SessionView({id}: {id: string}) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  const [sheetId, setSheetId] = useState(session?.sheets[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [closeOpen, setCloseOpen] = useState(false);

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

  async function onClose() {
    await closeSession(id);
    setCloseOpen(false);
    go('/');
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
          session.closedAt ? (
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
          )
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
      <main className="flex-1 overflow-y-auto px-4 py-3 pb-2">
        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-mute">没有匹配的人</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
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
  columns,
  onStatus,
}: {
  person: SessionPerson;
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
        <span className="w-8 pt-1 text-xs text-mute">{person.rowNumber}</span>
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
