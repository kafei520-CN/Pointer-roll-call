import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as XLSX from 'xlsx';

const root = dirname(fileURLToPath(import.meta.url));
const wb = XLSX.utils.book_new();
const classOne = [
  ['班级', '高一1班'],
  ['姓名', '学号', '组别'],
  ['张三', '2021001', 'A'],
  ['李四', '2021002', 'A'],
  ['王五', '2021003', 'B'],
  ['赵六', '2021004', 'B'],
  ['钱七', '2021005', 'C'],
  ['孙八', '2021006', 'C'],
];
const classTwo = [
  ['姓名', '学号'],
  ['周九', '2022001'],
  ['吴十', '2022002'],
  ['郑一', '2022003'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classOne), '一班');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classTwo), '二班');
const buffer = XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
writeFileSync(join(root, '..', 'public', 'sample-class.xlsx'), buffer);
console.log('wrote public/sample-class.xlsx');
