export type ExportKind = 'md' | 'png' | 'xlsx';

export interface ExportHandoff {
  filename: string;
  blob: Blob;
  text: string;
  kind: ExportKind;
  back: string;
}

let handoff: ExportHandoff | null = null;

export function stageExport(next: ExportHandoff): void {
  handoff = next;
}

export function currentExport(): ExportHandoff | null {
  return handoff;
}
