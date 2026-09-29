export type Route =
  | {name: 'home'}
  | {name: 'import'}
  | {name: 'template'; id: string}
  | {name: 'session'; id: string};

export function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'import') {
    return {name: 'import'};
  }
  if (parts[0] === 'template' && parts[1]) {
    return {name: 'template', id: parts[1]};
  }
  if (parts[0] === 'session' && parts[1]) {
    return {name: 'session', id: parts[1]};
  }
  return {name: 'home'};
}

export function go(path: string): void {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}
