export interface ExportHandoff {
  text: string;
  back: string;
}

let handoff: ExportHandoff | null = null;

export function stageExport(next: ExportHandoff): void {
  handoff = next;
}

export function currentExport(): ExportHandoff | null {
  return handoff;
}
