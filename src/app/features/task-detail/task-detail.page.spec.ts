import { describe, expect, it } from 'vitest';

import { TaskDetailPage } from './task-detail.page';

describe('TaskDetailPage', () => {
  it('maps task types to human-readable labels', () => {
    const proto = TaskDetailPage.prototype;
    expect(proto.taskTypeLabel('workflow')).toBe('工作流运行');
    expect(proto.taskTypeLabel('workflow_node')).toBe('工作流节点');
    expect(proto.taskTypeLabel('ingestion')).toBe('数据导入');
    expect(proto.taskTypeLabel('algorithm_package_validation')).toBe('算法包校验');
    expect(proto.taskTypeLabel('s01_assessment')).toBe('DMA 分区漏损评估');
    expect(proto.taskTypeLabel('unknown_type')).toBe('unknown_type');
  });
});
