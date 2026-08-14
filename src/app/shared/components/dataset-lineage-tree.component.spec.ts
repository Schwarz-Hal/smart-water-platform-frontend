import { describe, expect, it } from 'vitest';

import { buildLineageTree } from './dataset-lineage-tree.component';
import { DatasetLineageTree } from '../../core/models/api.models';

const node = (version_id: number, parent_version_id: number | null, operation_name: string) => ({
  version_id,
  parent_version_id,
  version_code: `version-${version_id}`,
  version_kind: parent_version_id ? 'derived' : 'imported',
  operation_code: parent_version_id ? 'governance' : 'csv_import',
  operation_name,
  is_synthetic: false,
  record_count: 10,
  time_start: null,
  time_end: null,
  quality: null,
  created_by_task_id: null,
  workflow_run_id: null,
  version_note: null,
  created_at: '2026-01-01T00:00:00Z',
});

describe('dataset lineage tree conversion', () => {
  it('builds a single-root parent-child tree', () => {
    const tree: DatasetLineageTree = {
      dataset_id: 1,
      current_version_id: 2,
      roots: [1],
      nodes: [node(1, null, '初始导入'), node(2, 1, '治理生成')],
      edges: [{ from: 1, to: 2 }],
    };
    const result = buildLineageTree(tree);
    expect(result?.versionId).toBe(1);
    expect(result?.children?.[0].versionId).toBe(2);
    expect(result?.children?.[0].itemStyle?.['borderWidth']).toBe(3);
  });

  it('adds a virtual root for multiple imports and flags empty versions', () => {
    const tree: DatasetLineageTree = {
      dataset_id: 1,
      current_version_id: 3,
      roots: [1, 2],
      nodes: [node(1, null, '初始导入'), { ...node(2, null, '重复导入'), record_count: 0 }, node(3, 1, '治理生成')],
      edges: [{ from: 1, to: 3 }],
    };
    const result = buildLineageTree(tree);
    expect(result?.name).toBe('数据资产');
    expect(result?.children).toHaveLength(2);
    expect(result?.children?.find((item) => item.versionId === 2)?.warning).toBe(true);
  });

  it('keeps orphan nodes visible instead of throwing', () => {
    const tree: DatasetLineageTree = {
      dataset_id: 1,
      current_version_id: 1,
      roots: [1],
      nodes: [node(1, null, '初始导入'), node(2, 99, '孤立版本')],
      edges: [{ from: 99, to: 2 }],
    };
    const result = buildLineageTree(tree);
    expect(result?.name).toBe('数据资产');
    expect(result?.children?.some((item) => item.versionId === 2)).toBe(true);
  });
});
