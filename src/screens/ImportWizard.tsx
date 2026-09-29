import {useEffect, useMemo, useRef, useState} from 'react';
import {IconFile} from '../icons';
import {fileStem} from '../lib/format';
import {createId} from '../lib/id';
import {consumeOpenedXlsx, subscribeOpenedXlsx} from '../lib/open-with';
import {createTemplateFromSheets} from '../lib/store';
import {
  columnLetter,
  defaultConfigs,
  extractPeople,
  parseWorkbook,
} from '../lib/xlsx';
import {go} from '../router';
import type {RawWorkbook, SheetImportConfig} from '../types';
import {Button, Shell, TextField, TopBar, cx} from '../ui';

export function ImportWizard() {
  const [book, setBook] = useState<RawWorkbook | null>(null);
  const [configs, setConfigs] = useState<SheetImportConfig[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const sheet = book?.sheets[activeSheet];
  const config = configs[activeSheet];

  const previewRows = useMemo(() => {
    if (!sheet) {
      return [];
    }
    return sheet.rows.slice(0, 80);
  }, [sheet]);

  const width = useMemo(() => {
    if (!sheet) {
      return 0;
    }
    return sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  }, [sheet]);

  useEffect(() => {
    return subscribeOpenedXlsx((file) => {
      if (file.size === 0) {
        return;
      }
      consumeOpenedXlsx();
      void onFile(file);
    });
  }, []);

  async function onFile(file: File) {
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbook(buffer, file.name);
      if (parsed.sheets.length === 0) {
        setError('这个文件里没有工作表');
        return;
      }
      const nextConfigs = defaultConfigs(parsed);
      setBook(parsed);
      setConfigs(nextConfigs);
      setActiveSheet(0);
      setSelectedRow(null);
      setTemplateName(fileStem(file.name));
    } catch {
      setError('无法读取该 Excel 文件');
    }
  }

  function patchConfig(index: number, patch: Partial<SheetImportConfig>) {
    setConfigs((current) =>
      current.map((item, i) => (i === index ? {...item, ...patch} : item)),
    );
  }

  async function finish() {
    if (!book) {
      return;
    }
    const included = configs
      .map((item, index) => ({item, sheet: book.sheets[index]}))
      .filter(({item}) => item.included);
    if (included.length === 0) {
      setError('请至少选择一个工作表');
      return;
    }
    const sheets = included.map(({item, sheet}) => {
      const extracted = extractPeople(sheet.rows, item);
      return {
        id: createId(),
        name: item.name,
        headerRow: item.headerRow,
        nameColumnLabel: extracted.nameColumnLabel,
        columns: extracted.columns,
        people: extracted.people,
      };
    });
    const template = await createTemplateFromSheets(
      templateName.trim() || fileStem(book.fileName),
      book.fileName,
      sheets,
    );
    go(`/template/${template.id}`);
  }

  return (
    <Shell>
      <TopBar
        title="导入为模板"
        subtitle="选择工作表和行号，数据只留在本机"
        onBack={() => go('/')}
      />
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        <button
          type="button"
          className="flex w-full cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-ink/30 bg-white px-4 py-8 text-center"
          onClick={() => fileRef.current?.click()}
        >
          <IconFile className="mb-2 h-8 w-8" />
          <p className="text-sm font-medium">选择 xlsx 文件</p>
          <p className="mt-1 text-xs text-mute">可含多个工作表，导入时再勾选</p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onFile(file);
            }
          }}
        />

        {error ? <p className="mt-3 text-sm">{error}</p> : null}

        {book && config && sheet ? (
          <div className="mt-5 space-y-4">
            <TextField label="模板名称" value={templateName} onChange={setTemplateName} />

            <section>
              <h2 className="mb-2 text-xs font-medium text-mute">工作表</h2>
              <div className="flex flex-wrap gap-2">
                {configs.map((item, index) => (
                  <button
                    key={item.name + String(index)}
                    type="button"
                    onClick={() => {
                      setActiveSheet(index);
                      setSelectedRow(null);
                    }}
                    className={cx(
                      'flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm',
                      activeSheet === index ? 'border-ink bg-ink text-white' : 'border-line bg-white',
                    )}
                  >
                    <span
                      role="checkbox"
                      aria-checked={item.included}
                      className={cx(
                        'flex h-4 w-4 items-center justify-center rounded border text-[10px]',
                        item.included
                          ? activeSheet === index
                            ? 'border-white bg-white text-ink'
                            : 'border-ink bg-ink text-white'
                          : activeSheet === index
                            ? 'border-white'
                            : 'border-line',
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        patchConfig(index, {included: !item.included});
                      }}
                    >
                      {item.included ? '✓' : ''}
                    </span>
                    {item.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-line bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">行号 · {config.name}</h2>
                <label className="flex items-center gap-2 text-xs text-mute">
                  <input
                    type="checkbox"
                    checked={config.included}
                    onChange={(event) =>
                      patchConfig(activeSheet, {included: event.target.checked})
                    }
                  />
                  导入此表
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="表头行（0 表示无表头）"
                  type="number"
                  min={0}
                  value={config.headerRow}
                  onChange={(value) =>
                    patchConfig(activeSheet, {headerRow: Number(value) || 0})
                  }
                />
                <label className="block space-y-1.5">
                  <span className="text-xs text-mute">姓名列</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
                    value={config.nameCol}
                    onChange={(event) =>
                      patchConfig(activeSheet, {nameCol: Number(event.target.value)})
                    }
                  >
                    {Array.from({length: Math.max(width, 1)}, (_, col) => {
                      const header =
                        config.headerRow > 0
                          ? sheet.rows[config.headerRow - 1]?.[col]
                          : '';
                      return (
                        <option key={col} value={col}>
                          {columnLetter(col)}
                          {header ? ` · ${header}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="起始行"
                  type="number"
                  min={1}
                  value={config.startRow}
                  onChange={(value) =>
                    patchConfig(activeSheet, {startRow: Number(value) || 1})
                  }
                />
                <TextField
                  label="结束行"
                  type="number"
                  min={1}
                  value={config.endRow}
                  onChange={(value) =>
                    patchConfig(activeSheet, {endRow: Number(value) || 1})
                  }
                />
              </div>
              {selectedRow ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="soft"
                    className="h-9 text-xs"
                    onClick={() => patchConfig(activeSheet, {headerRow: selectedRow})}
                  >
                    第 {selectedRow} 行设为表头
                  </Button>
                  <Button
                    variant="soft"
                    className="h-9 text-xs"
                    onClick={() => patchConfig(activeSheet, {startRow: selectedRow})}
                  >
                    设为起始行
                  </Button>
                  <Button
                    variant="soft"
                    className="h-9 text-xs"
                    onClick={() => patchConfig(activeSheet, {endRow: selectedRow})}
                  >
                    设为结束行
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-mute">点左侧行号，可把该行设为表头、起始或结束。</p>
              )}
            </section>

            <div className="overflow-auto rounded-3xl border border-line bg-white">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-soft">
                    <th className="sticky left-0 bg-soft px-2 py-2 text-left font-medium">#</th>
                    {Array.from({length: width}, (_, col) => (
                      <th key={col} className="px-2 py-2 text-left font-medium">
                        {columnLetter(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => {
                    const rowNumber = index + 1;
                    const isHeader = config.headerRow === rowNumber;
                    const inRange =
                      rowNumber >= config.startRow && rowNumber <= config.endRow;
                    return (
                      <tr
                        key={rowNumber}
                        className={cx(
                          isHeader && 'bg-ink text-white',
                          !isHeader && inRange && 'bg-soft/70',
                          selectedRow === rowNumber && !isHeader && 'outline outline-1 outline-ink',
                        )}
                      >
                        <th
                          className={cx(
                            'sticky left-0 cursor-pointer px-2 py-2 text-left font-medium',
                            isHeader ? 'bg-ink' : 'bg-white',
                          )}
                          onClick={() => setSelectedRow(rowNumber)}
                        >
                          {rowNumber}
                        </th>
                        {Array.from({length: width}, (_, col) => (
                          <td
                            key={col}
                            className={cx(
                              'max-w-32 truncate px-2 py-2',
                              col === config.nameCol && 'font-medium',
                            )}
                          >
                            {row[col] ?? ''}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sheet.rows.length > 80 ? (
                <p className="px-3 py-2 text-xs text-mute">仅预览前 80 行，导入仍按结束行截取。</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
      <div className="sticky bottom-0 border-t border-line bg-paper/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="w-full" disabled={!book} onClick={() => void finish()}>
          进入编辑
        </Button>
      </div>
    </Shell>
  );
}
