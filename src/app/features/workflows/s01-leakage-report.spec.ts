import { describe, expect, it } from 'vitest';

import { WorkflowArtifact } from '../../core/models/api.models';
import {
  candidateMeanRisk,
  candidateRisk,
  leakageCandidates,
  leakageEvidenceTypes,
  leakageRiskLine,
  leakageRiskSummary,
  unwrapLeakageReport,
} from './s01-leakage-report';

const artifact = (payload: Record<string, unknown>): WorkflowArtifact => ({
  id: 1,
  node_run_id: 1,
  node_instance_id: 'report',
  node_code: 's01_assessment_report_v1',
  port_key: 'report',
  data_type: 'report',
  semantic_type: 'leakage_report',
  unit: null,
  content_type: 'application/json',
  storage: 'inline',
  size_bytes: 100,
  sha256: null,
  preview: { kind: 'report', payload },
  created_at: '2026-08-13T08:00:00+08:00',
});

describe('S01 leakage report compatibility', () => {
  it('uses standard and historical candidate risk fields in priority order', () => {
    expect(candidateRisk({ risk_score: 0.9, max_risk_score: 0.8, score: 0.7 })).toBe(0.9);
    expect(candidateRisk({ max_risk_score: 0.8, score: 0.7 })).toBe(0.8);
    expect(candidateRisk({ score: 0.7 })).toBe(0.7);
    expect(candidateMeanRisk({ mean_risk_score: 0.5, risk_score: 0.9 })).toBe(0.5);
  });

  it('derives a stable summary for historical reports', () => {
    const report = unwrapLeakageReport(
      artifact({
        candidates: [
          {
            start_time: '2026-08-01T00:00:00+08:00',
            end_time: '2026-08-01T01:00:00+08:00',
            max_risk_score: 0.8,
            mean_risk_score: 0.6,
            evidence: ['balance_score'],
          },
          {
            start_time: '2026-08-02T00:00:00+08:00',
            end_time: '2026-08-02T01:00:00+08:00',
            score: 0.7,
            evidence: ['night_flow_score'],
          },
        ],
        risk_timeline: [{ time: '2026-08-01T00:00:00+08:00', value: 0.8 }],
      }),
    );

    expect(leakageCandidates(report)).toHaveLength(2);
    const summary = leakageRiskSummary(report);
    expect(summary.maximum).toBe(0.8);
    expect(summary.mean).toBeCloseTo(0.65);
    expect(summary.startTime).toBe('2026-08-01T00:00:00+08:00');
    expect(summary.endTime).toBe('2026-08-02T01:00:00+08:00');
    expect(leakageRiskLine(report)[0].data).toEqual([['2026-08-01T00:00:00+08:00', 0.8]]);
    expect(leakageEvidenceTypes(report)).toEqual(['balance_score', 'night_flow_score']);
  });
});
