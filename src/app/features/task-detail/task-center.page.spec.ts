import { describe, expect, it } from 'vitest';

import { createTaskColumnDefs } from './task-center.page';

describe('task center columns', () => {
  it('keeps all audit columns on desktop', () => {
    const columns = createTaskColumnDefs(false);
    expect(columns.filter((column) => column.hide)).toHaveLength(0);
    expect(columns.some((column) => column.field === 'trace_id')).toBe(true);
  });

  it('hides secondary audit columns on narrow screens but keeps actions', () => {
    const columns = createTaskColumnDefs(true);
    expect(columns.find((column) => column.field === 'trace_id')?.hide).toBe(true);
    expect(columns.at(-1)?.headerName).toBe('操作');
    expect(columns.at(-1)?.hide).not.toBe(true);
  });
});
