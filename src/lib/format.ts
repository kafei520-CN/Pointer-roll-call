export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) {
    return `今天 ${hm}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `昨天 ${hm}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function defaultSessionName(templateName: string): string {
  const d = new Date();
  return `${templateName} ${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}
