import {useMemo, useState} from 'react';
import {IconPlus, IconTrash} from '../icons';
import {defaultSessionName, formatWhen} from '../lib/format';
import {sessionStats} from '../lib/status';
import {
  createBlankTemplate,
  createSession,
  deleteSession,
  deleteTemplate,
  useApp,
} from '../lib/store';
import {go} from '../router';
import type {Session, Template} from '../types';
import {Button, CardButton, Empty, Modal, Segmented, Shell, TextField, TopBar, cx} from '../ui';

type HomeTab = 'sessions' | 'templates';

export function Home() {
  const app = useApp();
  const [tab, setTab] = useState<HomeTab>('sessions');
  const [pickTemplate, setPickTemplate] = useState(false);
  const [newFrom, setNewFrom] = useState<Template | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<
    {kind: 'template' | 'session'; id: string; name: string} | null
  >(null);
  const [notice, setNotice] = useState('');

  const readyTemplates = useMemo(
    () => app.templates.filter((item) => !item.draft),
    [app.templates],
  );
  const drafts = useMemo(
    () => app.templates.filter((item) => item.draft),
    [app.templates],
  );
  const openSessions = useMemo(
    () => app.sessions.filter((item) => !item.closedAt),
    [app.sessions],
  );
  const history = useMemo(
    () => app.sessions.filter((item) => item.closedAt),
    [app.sessions],
  );

  function startFromTemplate(template: Template) {
    const people = template.sheets.reduce((sum, sheet) => sum + sheet.people.length, 0);
    if (people === 0) {
      setPickTemplate(false);
      setNotice('请先在模板里添加人员，再新建点名表');
      return;
    }
    setNewFrom(template);
    setSessionName(defaultSessionName(template.name));
    setPickTemplate(false);
  }

  async function confirmCreate() {
    if (!newFrom) {
      return;
    }
    const session = await createSession(newFrom.id, sessionName.trim() || defaultSessionName(newFrom.name));
    setNewFrom(null);
    go(`/session/${session.id}`);
  }

  return (
    <Shell>
      <TopBar title="指针点名" subtitle="本地点名，不上云" />
      <div className="px-4 pt-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            {value: 'sessions', label: '点名'},
            {value: 'templates', label: '模板'},
          ]}
        />
      </div>
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        {tab === 'sessions' ? (
          <SessionsPane
            openSessions={openSessions}
            history={history}
            onDelete={(session) =>
              setPendingDelete({kind: 'session', id: session.id, name: session.name})
            }
          />
        ) : (
          <TemplatesPane
            ready={readyTemplates}
            drafts={drafts}
            onNew={(template) => startFromTemplate(template)}
            onDelete={(template) =>
              setPendingDelete({kind: 'template', id: template.id, name: template.name})
            }
          />
        )}
      </main>
      <div className="sticky bottom-0 border-t border-line bg-paper/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {tab === 'sessions' ? (
          <Button className="w-full" onClick={() => setPickTemplate(true)}>
            <IconPlus className="h-4 w-4" />
            从模板新建
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => go('/import')}>
              导入 Excel
            </Button>
            <Button
              onClick={async () => {
                const template = await createBlankTemplate();
                go(`/template/${template.id}`);
              }}
            >
              空白模板
            </Button>
          </div>
        )}
      </div>

      <Modal open={pickTemplate} title="选择模板" onClose={() => setPickTemplate(false)}>
        {readyTemplates.length === 0 ? (
          <p className="text-sm text-mute">还没有已保存的模板，先到「模板」里导入或新建。</p>
        ) : (
          <div className="space-y-2">
            {readyTemplates.map((template) => (
              <CardButton key={template.id} onClick={() => startFromTemplate(template)}>
                <p className="font-medium">{template.name}</p>
                <p className="mt-1 text-xs text-mute">{templateMeta(template)}</p>
              </CardButton>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!newFrom} title="给点名表命名" onClose={() => setNewFrom(null)}>
        <div className="space-y-4">
          <TextField label="名称" value={sessionName} onChange={setSessionName} />
          <Button className="w-full" onClick={() => void confirmCreate()}>
            开始点名
          </Button>
        </div>
      </Modal>

      <Modal open={!!notice} title="还不能点名" onClose={() => setNotice('')}>
        <p className="text-sm text-mute">{notice}</p>
        <Button className="mt-4 w-full" onClick={() => setNotice('')}>
          好
        </Button>
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="确认删除"
        onClose={() => setPendingDelete(null)}
      >
        <p className="text-sm text-mute">
          删除「{pendingDelete?.name}」后无法恢复，数据只存在本机。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => setPendingDelete(null)}>
            取消
          </Button>
          <Button
            onClick={async () => {
              if (!pendingDelete) {
                return;
              }
              if (pendingDelete.kind === 'template') {
                await deleteTemplate(pendingDelete.id);
              } else {
                await deleteSession(pendingDelete.id);
              }
              setPendingDelete(null);
            }}
          >
            删除
          </Button>
        </div>
      </Modal>
    </Shell>
  );
}

function templateMeta(template: Template): string {
  const people = template.sheets.reduce((sum, sheet) => sum + sheet.people.length, 0);
  return `${template.sheets.length} 个工作表 · ${people} 人`;
}

function SessionsPane({
  openSessions,
  history,
  onDelete,
}: {
  openSessions: Session[];
  history: Session[];
  onDelete: (session: Session) => void;
}) {
  if (openSessions.length === 0 && history.length === 0) {
    return <Empty title="还没有点名表" hint="先保存一份模板，再从模板新建。" />;
  }
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium text-mute">进行中</h2>
        {openSessions.length === 0 ? (
          <p className="px-1 text-sm text-mute">没有正在点的表</p>
        ) : (
          openSessions.map((session) => (
            <SessionCard key={session.id} session={session} onDelete={() => onDelete(session)} />
          ))
        )}
      </section>
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium text-mute">历史</h2>
        {history.length === 0 ? (
          <p className="px-1 text-sm text-mute">关闭后的点名表会出现在这里</p>
        ) : (
          history.map((session) => (
            <SessionCard key={session.id} session={session} onDelete={() => onDelete(session)} />
          ))
        )}
      </section>
    </div>
  );
}

function SessionCard({session, onDelete}: {session: Session; onDelete: () => void}) {
  const stats = sessionStats(session);
  const marked = stats.total - stats.unset;
  const ratio = stats.total === 0 ? 0 : marked / stats.total;
  return (
    <div className="rounded-3xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => go(`/session/${session.id}`)}
        >
          <p className="truncate font-medium">{session.name}</p>
          <p className="mt-1 text-xs text-mute">
            {session.closedAt ? '已关闭 · ' : ''}
            {formatWhen(session.updatedAt)} · {marked}/{stats.total} 已点
          </p>
        </button>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-mute hover:bg-soft hover:text-ink"
          onClick={onDelete}
          aria-label="删除"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft">
        <div className="h-full rounded-full bg-ink" style={{width: `${ratio * 100}%`}} />
      </div>
    </div>
  );
}

function TemplatesPane({
  ready,
  drafts,
  onNew,
  onDelete,
}: {
  ready: Template[];
  drafts: Template[];
  onNew: (template: Template) => void;
  onDelete: (template: Template) => void;
}) {
  if (ready.length === 0 && drafts.length === 0) {
    return <Empty title="还没有模板" hint="导入 xlsx，或从空白模板开始编辑。" />;
  }
  return (
    <div className="space-y-6">
      {drafts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-mute">未保存</h2>
          {drafts.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              draft
              onNew={() => onNew(template)}
              onDelete={() => onDelete(template)}
            />
          ))}
        </section>
      ) : null}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium text-mute">已保存</h2>
        {ready.length === 0 ? (
          <p className="px-1 text-sm text-mute">编辑完成后点「保存模板」</p>
        ) : (
          ready.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onNew={() => onNew(template)}
              onDelete={() => onDelete(template)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function TemplateCard({
  template,
  draft,
  onNew,
  onDelete,
}: {
  template: Template;
  draft?: boolean;
  onNew: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cx('rounded-3xl border bg-white p-4', draft ? 'border-dashed border-ink/30' : 'border-line')}>
      <button type="button" className="w-full text-left" onClick={() => go(`/template/${template.id}`)}>
        <p className="font-medium">{template.name}</p>
        <p className="mt-1 text-xs text-mute">{templateMeta(template)}</p>
      </button>
      <div className="mt-3 flex gap-2">
        <Button variant="soft" className="flex-1" onClick={onNew}>
          新建点名
        </Button>
        <Button variant="ghost" onClick={onDelete} className="px-3">
          <IconTrash className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
