import {useEffect, useMemo, useState} from 'react';
import {IconPlus, IconTrash} from '../icons';
import {createId} from '../lib/id';
import {emptySheet, upsertTemplate, useApp} from '../lib/store';
import {buildSearchKeys} from '../lib/search';
import {useHorizontalSwipe} from '../lib/swipe';
import {go} from '../router';
import type {Person, Template, TemplateSheet} from '../types';
import {Button, Modal, Shell, SheetTabs, TextField, TopBar} from '../ui';

export function TemplateEditor({id}: {id: string}) {
  const app = useApp();
  const stored = app.templates.find((item) => item.id === id);
  const [name, setName] = useState(stored?.name ?? '');
  const [sheets, setSheets] = useState<TemplateSheet[]>(stored?.sheets ?? []);
  const [sheetId, setSheetId] = useState(stored?.sheets[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [savedFlash, setSavedFlash] = useState('');
  const swipeSheets = useHorizontalSwipe((direction) => {
    const index = sheets.findIndex((item) => item.id === sheetId);
    const next = sheets[index + direction];
    if (next) {
      setSheetId(next.id);
    }
  });

  useEffect(() => {
    if (!stored) {
      go('/');
    }
  }, [stored]);

  useEffect(() => {
    if (stored) {
      setName(stored.name);
      setSheets(stored.sheets);
      setSheetId((current) =>
        stored.sheets.some((sheet) => sheet.id === current)
          ? current
          : stored.sheets[0]?.id ?? '',
      );
    }
  }, [stored?.id]);

  const sheet = sheets.find((item) => item.id === sheetId) ?? sheets[0];

  const personCount = useMemo(
    () => sheets.reduce((sum, item) => sum + item.people.length, 0),
    [sheets],
  );

  if (!stored || !sheet) {
    return null;
  }

  function currentTemplate(): Template {
    return {
      ...stored!,
      name: name.trim() || '未命名模板',
      sheets,
    };
  }

  async function persist(next: Template) {
    await upsertTemplate(next);
  }

  function updateSheet(sheetIdToUpdate: string, patch: Partial<TemplateSheet>) {
    const nextSheets = sheets.map((item) =>
      item.id === sheetIdToUpdate ? {...item, ...patch} : item,
    );
    setSheets(nextSheets);
    void persist({...currentTemplate(), sheets: nextSheets});
  }

  function addPerson() {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    const rowNumber =
      sheet.people.reduce((max, person) => Math.max(max, person.rowNumber), sheet.headerRow) + 1;
    const person: Person = {
      id: createId(),
      rowNumber,
      name: trimmed,
      fields: {},
      search: buildSearchKeys(trimmed, {}),
    };
    setNewName('');
    updateSheet(sheet.id, {people: [...sheet.people, person]});
  }

  async function save() {
    await upsertTemplate({...currentTemplate(), draft: false});
    setSavedFlash('模板已保存');
    window.setTimeout(() => setSavedFlash(''), 1600);
  }

  return (
    <Shell>
      <TopBar
        title={stored.draft ? '编辑模板' : '模板'}
        subtitle={stored.sourceFileName ?? `${personCount} 人`}
        onBack={() => go('/')}
        right={
          <Button className="h-10 px-3 text-sm" onClick={() => void save()}>
            保存
          </Button>
        }
      />
      <div className="space-y-3 px-4 pt-4">
        <TextField label="模板名称" value={name} onChange={(value) => {
          setName(value);
          void persist({...currentTemplate(), name: value.trim() || '未命名模板'});
        }} />
        {savedFlash ? <p className="text-xs text-mute">{savedFlash}</p> : null}
      </div>
      <main className="flex-1 overflow-y-auto px-4 py-3" data-testid="menu-swipe" {...swipeSheets}>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-mute"
            onClick={() => {
              setRenameValue(sheet.name);
              setRenameOpen(true);
            }}
          >
            工作表：{sheet.name}
          </button>
          {sheets.length > 1 ? (
            <button
              type="button"
              className="text-sm text-mute"
              onClick={() => {
                const next = sheets.filter((item) => item.id !== sheet.id);
                setSheets(next);
                setSheetId(next[0]?.id ?? '');
                void persist({...currentTemplate(), sheets: next});
              }}
            >
              删除此表
            </button>
          ) : null}
        </div>
        <ul className="space-y-2">
          {sheet.people.map((person, index) => (
            <li key={person.id} className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2">
              <span className="w-8 shrink-0 text-xs text-mute">{index + 1}</span>
              <input
                value={person.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  const nextPeople = sheet.people.map((item) =>
                    item.id === person.id
                      ? {
                          ...item,
                          name: nextName,
                          search: buildSearchKeys(nextName, item.fields),
                        }
                      : item,
                  );
                  updateSheet(sheet.id, {people: nextPeople});
                }}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-mute hover:bg-soft"
                onClick={() =>
                  updateSheet(sheet.id, {
                    people: sheet.people.filter((item) => item.id !== person.id),
                  })
                }
                aria-label="删除人员"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        {sheet.people.length === 0 ? (
          <p className="py-10 text-center text-sm text-mute">还没有人，在下方添加或返回导入 Excel。</p>
        ) : null}
      </main>
      <div className="border-t border-line bg-white px-4 pt-3">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addPerson();
          }}
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="添加姓名"
            className="h-11 flex-1 rounded-2xl border border-line px-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
          />
          <Button type="submit" className="px-3">
            <IconPlus className="h-4 w-4" />
          </Button>
        </form>
        <SheetTabs
          names={sheets}
          active={sheet.id}
          onChange={setSheetId}
          onAdd={() => {
            const created = emptySheet(`表${sheets.length + 1}`);
            const next = [...sheets, created];
            setSheets(next);
            setSheetId(created.id);
            void persist({...currentTemplate(), sheets: next});
          }}
        />
      </div>
      <Modal open={renameOpen} title="重命名工作表" onClose={() => setRenameOpen(false)}>
        <TextField value={renameValue} onChange={setRenameValue} />
        <Button
          className="mt-4 w-full"
          onClick={() => {
            updateSheet(sheet.id, {name: renameValue.trim() || sheet.name});
            setRenameOpen(false);
          }}
        >
          确定
        </Button>
      </Modal>
    </Shell>
  );
}
