import {useEffect, useMemo, useRef, useState} from 'react';
import {IconSearch} from '../icons';
import {
  EXPORT_GROUP_ORDER,
  EXPORT_LABEL,
  exportCounts,
  exportTables,
  toMarkdown,
  type ExportScope,
  type ExportShape,
} from '../lib/export-roll';
import {stageExport} from '../lib/export-handoff';
import {matchesQuery} from '../lib/search';
import {
  countMode,
  countValue,
  markedTotals,
  nextChoice,
  optionLabel,
  personChoice,
  personMarked,
  personMarks,
  recordSummary,
  sequenceNumbers,
  sheetKind,
  unmarkedWord,
} from '../lib/sheet-record';
import {sessionStats, sheetStats, STATUS_LABEL} from '../lib/status';
import {
  bumpCount,
  chooseOption,
  closeSession,
  deleteCountNumber,
  markPerson,
  reopenSession,
  toggleCountNumber,
  useApp,
} from '../lib/store';
import {useHorizontalSwipe} from '../lib/swipe';
import {go} from '../router';
import type {Session, SessionPerson, SessionSheet, Status} from '../types';
import {STATUSES} from '../types';
import {Button, Modal, Shell, SheetTabs, TopBar, cx} from '../ui';

export function SessionView({id}: {id: string}) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  const [sheetId, setSheetId] = useState(session?.sheets[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [closeOpen, setCloseOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportGroups, setExportGroups] = useState<Status[]>([]);
  const [exportShape, setExportShape] = useState<ExportShape>('brief');
  const [exportScope, setExportScope] = useState<ExportScope>('selected');
  const [exportError, setExportError] = useState('');
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

  useEffect(() => {
    setFilter('all');
  }, [sheetId]);

  const sheet = session?.sheets.find((item) => item.id === sheetId) ?? session?.sheets[0];

  const visible = useMemo(() => {
    if (!sheet) {
      return [];
    }
    return sheet.people.filter((person) => {
      if (!matchesFilter(sheet, person, filter)) {
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
  const recorded = markedTotals(session);
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
    setExportScope('selected');
    setExportError('');
    setExportOpen(true);
  }

  function showMarkdown() {
    const labels = sheetNameLabels(roll);
    const tables = exportTables(roll, exportGroups, exportShape, labels, exportScope);
    if (tables.length === 0) {
      setExportError(exportScope === 'all' ? '表里没有人' : '所选状态里没有人');
      return;
    }
    stageExport({
      text: toMarkdown(roll, exportGroups, exportShape, labels, exportScope),
      back: `/session/${roll.id}`,
    });
    setExportError('');
    setExportOpen(false);
    go('/export');
  }

  return (
    <Shell>
      <TopBar
        title={session.name}
        subtitle={
          session.closedAt
            ? session.sheets.every((item) => sheetKind(item) === 'roll')
              ? `历史 · 到 ${all.present} · 缺 ${all.absent} · 未点 ${all.unset}`
              : `历史 · 已记录 ${recorded.marked}/${recorded.total}`
            : sheetKind(sheet) === 'roll'
              ? `到 ${stats.present} · 缺 ${stats.absent} · 未点 ${stats.unset}`
              : recordSummary(sheet)
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
        <FilterRow sheet={sheet} filter={filter} onChange={setFilter} />
        {sheetKind(sheet) === 'count' ? (
          <p className="text-xs text-mute">
            {countMode(sheet) === 'sequence'
              ? '点加号增加序号，点数字选上或取消。长按数字把它删掉，减号删除最后一个。'
              : '点一下加 1 次。数字就是次数。'}
          </p>
        ) : null}
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
                sheet={sheet}
                onStatus={(status) =>
                  void markPerson(session.id, sheet.id, person.id, status)
                }
                onCount={(delta) => void bumpCount(session.id, sheet.id, person.id, delta)}
                onToggleMark={(mark) =>
                  void toggleCountNumber(session.id, sheet.id, person.id, mark)
                }
                onDeleteMark={(mark) => void deleteCountNumber(session.id, sheet.id, mark)}
                onChoice={(choice) => void chooseOption(session.id, sheet.id, person.id, choice)}
              />
            ))}
          </ul>
        )}
      </main>
      <SheetTabs names={session.sheets} active={sheet.id} onChange={setSheetId} />
      <Modal open={exportOpen} title="导出" onClose={() => setExportOpen(false)}>
        <p className="text-xs text-mute">导出后直接显示文字，长按即可复制。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={exportScope === 'selected'}
            onClick={() => setExportScope('selected')}
            className={cx(
              'h-9 rounded-full px-3 text-xs',
              exportScope === 'selected' ? 'bg-ink text-white' : 'bg-soft text-ink',
            )}
          >
            仅导出选中行
          </button>
          <button
            type="button"
            aria-pressed={exportScope === 'all'}
            onClick={() => setExportScope('all')}
            className={cx(
              'h-9 rounded-full px-3 text-xs',
              exportScope === 'all' ? 'bg-ink text-white' : 'bg-soft text-ink',
            )}
          >
            导出整表
          </button>
        </div>
        {exportScope === 'selected' ? (
          <>
            <p className="mb-2 mt-4 text-xs text-mute">
              只导出勾选的分类。未到是所有还没点到的人，包含每张工作表。
            </p>
            <div className="flex flex-wrap gap-2">
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
          </>
        ) : (
          <p className="mt-4 text-xs text-mute">每张工作表的所有人都导出，不按分类筛选。</p>
        )}
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
        <Button
          className="mt-4 w-full"
          disabled={!canShowExport(roll, exportScope, exportGroups)}
          onClick={showMarkdown}
        >
          显示文字
        </Button>
        {exportError ? <p className="mt-3 text-sm">{exportError}</p> : null}
      </Modal>
      <Modal open={closeOpen} title="关闭点名" onClose={() => setCloseOpen(false)}>
        <p className="text-sm text-mute">
          {unmarkedOn(sheet) > 0
            ? `当前表还有 ${unmarkedOn(sheet)} 人${unmarkedWord(sheetKind(sheet))}。关闭后可在历史里再次打开。`
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
  sheet,
  onStatus,
  onCount,
  onToggleMark,
  onDeleteMark,
  onChoice,
}: {
  person: SessionPerson;
  order: number;
  sheet: SessionSheet;
  onStatus: (status: Status) => void;
  onCount: (delta: 1 | -1) => void;
  onToggleMark: (mark: number) => void;
  onDeleteMark: (mark: number) => void;
  onChoice: (choice: string) => void;
}) {
  const extra = sheet.columns
    .map((col) => person.fields[col.key])
    .filter(Boolean)
    .join(' · ');
  const kind = sheetKind(sheet);
  const sequence = kind === 'count' && countMode(sheet) === 'sequence';
  return (
    <li className="rounded-3xl border border-line bg-white p-3">
      <div className="flex items-start gap-3">
        <span className="w-8 pt-1 text-xs text-mute">{order}</span>
        {sequence ? (
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{person.name}</p>
            {extra ? <p className="mt-0.5 truncate text-xs text-mute">{extra}</p> : null}
          </div>
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              if (kind === 'count') {
                onCount(1);
                return;
              }
              if (kind === 'custom') {
                onChoice(nextChoice(personChoice(person), sheet.options ?? []));
                return;
              }
              onStatus(cycle(person.status));
            }}
          >
            <p className="truncate font-medium">{person.name}</p>
            {extra ? <p className="mt-0.5 truncate text-xs text-mute">{extra}</p> : null}
          </button>
        )}
        <RecordBadge person={person} sheet={sheet} />
      </div>
      {kind === 'roll' ? (
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
      ) : null}
      {sequence ? (
        <SequenceRow
          numbers={sequenceNumbers(sheet.people)}
          selected={personMarks(person)}
          onToggle={onToggleMark}
          onDelete={onDeleteMark}
          onAdd={() => onCount(1)}
        />
      ) : null}
      {kind === 'count' && !sequence ? (
        <div className="mt-3 grid grid-cols-2 gap-1">
          <button
            type="button"
            aria-label="撤销上一次"
            onClick={() => onCount(-1)}
            className="h-10 rounded-2xl bg-soft text-sm"
          >
            −
          </button>
          <button
            type="button"
            aria-label="记一次"
            onClick={() => onCount(1)}
            className="h-10 rounded-2xl bg-ink text-sm text-white"
          >
            +
          </button>
        </div>
      ) : null}
      {kind === 'custom' ? (
        (sheet.options ?? []).length === 0 ? (
          <p className="mt-3 text-xs text-mute">还没有选项。回到模板里添加。</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1">
            {(sheet.options ?? []).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChoice(personChoice(person) === option.id ? '' : option.id)}
                className={cx(
                  'h-10 rounded-2xl px-3 text-sm',
                  personChoice(person) === option.id ? 'bg-ink text-white' : 'bg-soft text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )
      ) : null}
    </li>
  );
}

function SequenceRow({
  numbers,
  selected,
  onToggle,
  onDelete,
  onAdd,
}: {
  numbers: number[];
  selected: number[];
  onToggle: (mark: number) => void;
  onDelete: (mark: number) => void;
  onAdd: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const holdTimer = useRef(0);
  const holdFired = useRef(false);
  useEffect(() => {
    const node = scroller.current;
    if (node) {
      node.scrollLeft = node.scrollWidth;
    }
  }, [numbers.length]);
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);
  const chosen = new Set(selected);
  const last = numbers[numbers.length - 1];
  return (
    <div className="mt-3 flex items-center gap-1">
      <div ref={scroller} className="flex w-[10.75rem] gap-1 overflow-x-auto">
        {numbers.map((mark) => {
          const on = chosen.has(mark);
          return (
            <button
              key={mark}
              type="button"
              aria-pressed={on}
              onPointerDown={() => {
                holdFired.current = false;
                window.clearTimeout(holdTimer.current);
                holdTimer.current = window.setTimeout(() => {
                  holdFired.current = true;
                  onDelete(mark);
                }, 450);
              }}
              onPointerUp={() => window.clearTimeout(holdTimer.current)}
              onPointerLeave={() => window.clearTimeout(holdTimer.current)}
              onPointerCancel={() => window.clearTimeout(holdTimer.current)}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => {
                if (holdFired.current) {
                  holdFired.current = false;
                  return;
                }
                onToggle(mark);
              }}
              className={cx(
                'h-10 w-10 shrink-0 rounded-2xl text-sm',
                on ? 'bg-ink text-white' : 'bg-soft text-ink',
              )}
            >
              {mark}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="删除最后一个序号"
        disabled={last === undefined}
        onClick={() => {
          if (last !== undefined) {
            onDelete(last);
          }
        }}
        className="h-10 w-10 shrink-0 rounded-2xl bg-soft text-sm disabled:opacity-40"
      >
        −
      </button>
      <button
        type="button"
        aria-label="记一次"
        onClick={onAdd}
        className="h-10 w-10 shrink-0 rounded-2xl bg-ink text-sm text-white"
      >
        +
      </button>
    </div>
  );
}

function RecordBadge({person, sheet}: {person: SessionPerson; sheet: SessionSheet}) {
  const kind = sheetKind(sheet);
  if (kind === 'count') {
    const value = countValue(person, countMode(sheet));
    return (
      <span className={cx('rounded-full px-2 py-1 text-xs', value > 0 ? 'bg-ink text-white' : 'bg-soft text-mute')}>
        {value} 次
      </span>
    );
  }
  if (kind === 'custom') {
    const label = optionLabel(sheet.options, personChoice(person));
    return (
      <span className={cx('rounded-full px-2 py-1 text-xs', label ? 'bg-ink text-white' : 'bg-soft text-mute')}>
        {label || '未选'}
      </span>
    );
  }
  return (
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
  );
}

function FilterRow({
  sheet,
  filter,
  onChange,
}: {
  sheet: SessionSheet;
  filter: string;
  onChange: (filter: string) => void;
}) {
  const kind = sheetKind(sheet);
  const chips: Array<{id: string; label: string; count: number}> = [];
  if (kind === 'count') {
    const marked = sheet.people.filter((person) => personMarked(person, sheet)).length;
    chips.push(
      {id: 'all', label: '全部', count: sheet.people.length},
      {id: 'marked', label: '已计', count: marked},
      {id: 'unmarked', label: '未计', count: sheet.people.length - marked},
    );
  } else if (kind === 'custom') {
    const unset = sheet.people.filter((person) => personChoice(person) === '').length;
    chips.push({id: 'all', label: '全部', count: sheet.people.length});
    chips.push({id: 'unset', label: '未选', count: unset});
    for (const option of sheet.options ?? []) {
      chips.push({
        id: option.id,
        label: option.label,
        count: sheet.people.filter((person) => personChoice(person) === option.id).length,
      });
    }
  } else {
    const stats = sheetStats(sheet);
    chips.push({id: 'all', label: '全部', count: stats.total});
    for (const status of STATUSES) {
      chips.push({id: status, label: STATUS_LABEL[status], count: stats[status]});
    }
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.id)}
          className={cx(
            'h-9 shrink-0 rounded-full px-3 text-xs',
            filter === chip.id ? 'bg-ink text-white' : 'bg-soft text-ink',
          )}
        >
          {chip.label} {chip.count}
        </button>
      ))}
    </div>
  );
}

function cycle(status: Status): Status {
  const order: Status[] = ['unset', 'present', 'absent', 'leave', 'late'];
  return order[(order.indexOf(status) + 1) % order.length];
}

function matchesFilter(sheet: SessionSheet, person: SessionPerson, filter: string): boolean {
  if (filter === 'all') {
    return true;
  }
  const kind = sheetKind(sheet);
  if (kind === 'count') {
    const marked = personMarked(person, sheet);
    return filter === 'marked' ? marked : !marked;
  }
  if (kind === 'custom') {
    if (filter === 'unset') {
      return personChoice(person) === '';
    }
    return personChoice(person) === filter;
  }
  return person.status === filter;
}

function unmarkedOn(sheet: SessionSheet): number {
  return sheet.people.filter((person) => !personMarked(person, sheet)).length;
}

function canShowExport(session: Session, scope: ExportScope, groups: Status[]): boolean {
  return exportTables(session, groups, 'brief', {}, scope).length > 0;
}
