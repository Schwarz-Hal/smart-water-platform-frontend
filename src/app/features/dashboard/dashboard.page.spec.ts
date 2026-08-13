import { describe, expect, it } from 'vitest';

import { PortalSummary, PortalWorkloadLevel } from '../../core/models/api.models';
import { portalStatCards, workloadLabel } from './dashboard.page';

const summary = (scope: 'platform' | 'personal'): PortalSummary => ({
  scope,
  stats: {
    active_users: scope === 'platform' ? 12 : null,
    data_assets: 8,
    workflows: 5,
    running_tasks: 2,
    completed_runs_7d: 19,
    failed_tasks_24h: 1,
  },
  workload: {
    level: 'normal',
    queued: 0,
    running: 2,
    retrying: 0,
    oldest_wait_seconds: 0,
    reason_codes: [],
  },
  recent_datasets: [],
  recent_workflows: [],
  recent_tasks: [],
});

describe('role-aware portal presentation', () => {
  it('shows user totals only for platform scope', () => {
    expect(portalStatCards(summary('platform')).map((item) => item.label)).toContain('有效用户');
    expect(portalStatCards(summary('personal')).map((item) => item.label)).not.toContain(
      '有效用户',
    );
  });

  it('labels every workload level in Chinese', () => {
    const levels: PortalWorkloadLevel[] = ['idle', 'normal', 'busy', 'strained', 'degraded'];
    expect(levels.map(workloadLabel)).toEqual(['空闲', '正常', '繁忙', '高负载', '服务降级']);
  });
});
