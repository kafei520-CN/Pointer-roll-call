import type {Template} from '../types';
import {fileStem} from './format';
import {consumeOpenedXlsx, pushOpenedXlsx} from './open-with';
import {go} from '../router';
import {createTemplateFromSheets} from './store';
import {buildTemplateSheets, defaultConfigs, parseWorkbook} from './xlsx';

export async function createTemplateFromOpenedFile(file: File): Promise<Template> {
  const parsed = parseWorkbook(await file.arrayBuffer(), file.name);
  if (parsed.sheets.length === 0) {
    throw new Error('这个文件里没有工作表');
  }
  const sheets = buildTemplateSheets(parsed, defaultConfigs(parsed));
  const people = sheets.reduce((sum, sheet) => sum + sheet.people.length, 0);
  if (sheets.length === 0 || people === 0) {
    throw new Error('没有可导入的人员');
  }
  return createTemplateFromSheets(fileStem(file.name) || '导入模板', parsed.fileName, sheets);
}

export async function openOpenedWorkbook(file: File): Promise<void> {
  try {
    const template = await createTemplateFromOpenedFile(file);
    consumeOpenedXlsx();
    go(`/template/${template.id}`);
  } catch {
    pushOpenedXlsx(file);
    go('/import');
  }
}
