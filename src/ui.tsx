import {useEffect, useId, useRef, type ReactNode, type HTMLAttributes} from 'react';
import {IconBack, IconClose} from './icons';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Shell({children}: {children: ReactNode}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-paper text-ink">
      {children}
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl hover:bg-soft"
            aria-label="返回"
          >
            <IconBack className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-1" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="truncate text-xs text-mute">{subtitle}</p>
          ) : null}
        </div>
        <div className="shrink-0">{right}</div>
      </div>
    </header>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'outline' | 'ghost' | 'soft';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 text-sm font-medium transition-colors duration-200 disabled:opacity-40',
        variant === 'primary' && 'bg-ink text-white',
        variant === 'outline' && 'border border-ink bg-white text-ink',
        variant === 'ghost' && 'text-ink hover:bg-soft',
        variant === 'soft' && 'bg-soft text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  inputMode,
}: {
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = useId();
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      {label ? <span className="text-xs text-mute">{label}</span> : null}
      <input
        id={id}
        type={type}
        min={min}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm outline-none ring-ink/20 placeholder:text-mute/70 focus:ring-2"
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{value: T; label: string}>;
}) {
  return (
    <div className="grid grid-cols-2 rounded-2xl bg-soft p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'h-10 rounded-xl text-sm font-medium transition-colors duration-200',
            value === option.value ? 'bg-white text-ink shadow-sm' : 'text-mute',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SheetTabs({
  names,
  active,
  onChange,
  onAdd,
}: {
  names: Array<{id: string; name: string}>;
  active: string;
  onChange: (id: string) => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-t border-line bg-white px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {names.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cx(
            'h-10 shrink-0 rounded-xl px-3 text-sm',
            tab.id === active ? 'bg-ink text-white' : 'bg-soft text-ink',
          )}
        >
          {tab.name}
        </button>
      ))}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="h-10 w-10 shrink-0 rounded-xl bg-soft text-lg"
          aria-label="新增工作表"
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export function Empty({title, hint}: {title: string; hint: string}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-line bg-white">
        <span className="h-6 w-6 rounded-full border-2 border-ink" />
      </div>
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1 text-sm text-mute">{hint}</p>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="max-h-[85dvh] w-full min-w-0 max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="dialog-title" className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-soft"
            aria-label="收起"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CardButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-3xl border border-line bg-white p-4 text-left transition-colors duration-200 hover:bg-soft/60"
    >
      {children}
    </button>
  );
}
