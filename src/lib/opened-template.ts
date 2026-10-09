import {pushOpenedXlsx} from './open-with';
import {go} from '../router';

/** Opened files land on the import screen so the sheet mode can be chosen. */
export async function openOpenedWorkbook(file: File): Promise<void> {
  pushOpenedXlsx(file);
  go('/import');
}
