import type {ReactNode} from 'react';

interface IconProps {
  className?: string;
}

function Svg({className, children}: IconProps & {children: ReactNode}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconSearch({className}: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </Svg>
  );
}

export function IconPlus({className}: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconBack({className}: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function IconClose({className}: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconFile({className}: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </Svg>
  );
}

export function IconTrash({className}: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" />
    </Svg>
  );
}

export function IconCheck({className}: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12l5 5 9-10" />
    </Svg>
  );
}
