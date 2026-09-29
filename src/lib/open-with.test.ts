import {describe, expect, it} from 'vitest';
import {fileFromPending} from './open-with';

describe('fileFromPending', () => {
  it('rebuilds a File from IPC payload', async () => {
    const hello = new TextEncoder().encode('hello');
    const file = fileFromPending({
      fileName: '班级.xlsx',
      data: Array.from(hello),
    });
    expect(file.name).toBe('班级.xlsx');
    expect(await file.text()).toBe('hello');
  });
});
