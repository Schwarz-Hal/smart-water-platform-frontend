import { describe, expect, it } from 'vitest';

import { ExternalAlgorithmPackage } from '../../core/models/api.models';
import { algorithmOnboardingStageDone } from './algorithm-package.page';

function packageState(overrides: Partial<ExternalAlgorithmPackage> = {}): ExternalAlgorithmPackage {
  return {
    id: 1,
    algorithm_code: 'rolling_zscore_anomaly',
    algorithm_name: 'Rolling Z-score',
    version: '1.0.0',
    task_type: 'external',
    runtime_type: 'external_cpu',
    status: 'validated',
    execution_status: 'ready',
    package_sha256: 'a'.repeat(64),
    package_size_bytes: 100,
    manifest: {},
    environment: null,
    operator_drafts: [],
    smoke_tests: [],
    models: [],
    ...overrides,
  };
}

describe('external algorithm onboarding progress', () => {
  it('does not mark an empty contract set as complete', () => {
    expect(algorithmOnboardingStageDone(packageState(), 'contract')).toBe(false);
  });

  it('requires a ready environment and successful smoke test', () => {
    const value = packageState({
      environment: {
        environment_id: 'env-1',
        status: 'ready',
        environment_digest: 'b'.repeat(64),
        python_version: '3.12',
        platform_tag: 'test',
        size_bytes: 10,
        provision_task_id: null,
        validation_report: {},
        error_code: null,
        error_message: null,
        prepared_at: null,
      },
      smoke_tests: [
        {
          smoke_test_id: 'smoke-1',
          operator_draft_id: 1,
          task_id: 'task-1',
          status: 'success',
          output_preview: {},
          error_code: null,
          error_message: null,
        },
      ],
    });
    expect(algorithmOnboardingStageDone(value, 'provisioning')).toBe(true);
    expect(algorithmOnboardingStageDone(value, 'smoke')).toBe(true);
  });
});
