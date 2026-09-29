import type {Session, SessionSheet, Status} from '../types';
import {STATUSES} from '../types';

export const STATUS_LABEL: Record<Status, string> = {
  unset: '未点',
  present: '到',
  absent: '缺',
  leave: '假',
  late: '迟',
};

export function nextStatus(status: Status): Status {
  const index = STATUSES.indexOf(status);
  return STATUSES[(index + 1) % STATUSES.length];
}

export interface SheetStats {
  total: number;
  unset: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
}

export function sheetStats(sheet: SessionSheet): SheetStats {
  const stats: SheetStats = {
    total: sheet.people.length,
    unset: 0,
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
  };
  for (const person of sheet.people) {
    stats[person.status] += 1;
  }
  return stats;
}

export function sessionStats(session: Session): SheetStats {
  const stats: SheetStats = {
    total: 0,
    unset: 0,
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
  };
  for (const sheet of session.sheets) {
    const one = sheetStats(sheet);
    stats.total += one.total;
    stats.unset += one.unset;
    stats.present += one.present;
    stats.absent += one.absent;
    stats.leave += one.leave;
    stats.late += one.late;
  }
  return stats;
}
