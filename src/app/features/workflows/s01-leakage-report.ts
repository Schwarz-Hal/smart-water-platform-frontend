import { WorkflowArtifact } from '../../core/models/api.models';
import { TimeSeriesLine } from '../../shared/components/time-series-chart.component';

export interface LeakageRiskSummary {
  maximum: number;
  mean: number;
  startTime: string | null;
  endTime: string | null;
}

export function candidateRisk(candidate: Record<string, unknown>): number {
  for (const key of ['risk_score', 'max_risk_score', 'score']) {
    const value = Number(candidate[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export function candidateMeanRisk(candidate: Record<string, unknown>): number {
  const value = Number(candidate['mean_risk_score']);
  return Number.isFinite(value) ? value : candidateRisk(candidate);
}

export function unwrapLeakageReport(artifact: WorkflowArtifact): Record<string, unknown> {
  const root = artifact.payload ?? artifact.preview ?? {};
  const nested = root['payload'];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : root;
}

export function leakageCandidates(report: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = report['candidates'];
  return Array.isArray(candidates)
    ? candidates.filter(
        (candidate): candidate is Record<string, unknown> =>
          Boolean(candidate) && typeof candidate === 'object',
      )
    : [];
}

export function leakageRiskSummary(report: Record<string, unknown>): LeakageRiskSummary {
  const candidates = leakageCandidates(report);
  const summary =
    report['risk_summary'] && typeof report['risk_summary'] === 'object'
      ? (report['risk_summary'] as Record<string, unknown>)
      : {};
  const maximum = Number(summary['maximum']);
  const mean = Number(summary['mean']);
  const candidateMaximum = candidates.length ? Math.max(...candidates.map(candidateRisk)) : 0;
  const candidateMean = candidates.length
    ? candidates.reduce((total, item) => total + candidateMeanRisk(item), 0) / candidates.length
    : 0;
  const starts = candidates
    .map((item) => String(item['start_time'] ?? ''))
    .filter(Boolean)
    .sort();
  const ends = candidates
    .map((item) => String(item['end_time'] ?? ''))
    .filter(Boolean)
    .sort();
  return {
    maximum: Number.isFinite(maximum) ? maximum : candidateMaximum,
    mean: Number.isFinite(mean) ? mean : candidateMean,
    startTime: String(summary['start_time'] ?? starts[0] ?? '') || null,
    endTime: String(summary['end_time'] ?? ends.at(-1) ?? '') || null,
  };
}

export function leakageRiskLine(report: Record<string, unknown>): TimeSeriesLine[] {
  const timeline = report['risk_timeline'];
  if (!Array.isArray(timeline)) return [];
  const data: Array<[string, number | null]> = timeline.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const time = item['time'];
    const value = Number(item['risk_score'] ?? item['value']);
    return typeof time === 'string' ? [[time, Number.isFinite(value) ? value : null]] : [];
  });
  return data.length ? [{ name: '漏损风险', data, color: '#dc2626', area: true }] : [];
}

export function leakageEvidenceTypes(report: Record<string, unknown>): string[] {
  const values = new Set<string>();
  for (const candidate of leakageCandidates(report)) {
    const evidence = candidate['evidence'];
    if (Array.isArray(evidence))
      evidence
        .map(String)
        .filter(Boolean)
        .forEach((item) => values.add(item));
  }
  return [...values];
}
