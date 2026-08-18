import { describe, expect, it } from 'vitest';

import { OperatorSummary } from '../../core/models/api.models';
import { linkedAlgorithmCode } from './operator-center.page';

function operator(algorithm: Record<string, unknown> | null): OperatorSummary {
  return {
    code: 'dataset_channel_v1',
    name: 'Dataset channel',
    description: '',
    kind: 'data_source',
    category: 'data_source',
    status: 'active',
    visibility: 'public',
    disabled_reason: null,
    available: true,
    unavailable_reason: null,
    can_manage: false,
    version_count: 1,
    active_version: {
      id: 1,
      version: '1.0.0',
      status: 'active',
      runtime_type: 'builtin_cpu',
      executor_type: 'builtin_handler',
      maturity: 'production',
      contract_sha256: null,
      input_ports: [],
      output_ports: [],
      parameter_schema: {},
      ui_schema: {},
      visualization_schema: {},
      algorithm,
      available: true,
    },
  };
}

describe('operator lifecycle links', () => {
  it('uses the linked algorithm code instead of the node code', () => {
    expect(linkedAlgorithmCode(operator({ code: 'qscore_v1' }))).toBe('qscore_v1');
  });

  it('does not construct algorithm requests for non-algorithm nodes', () => {
    expect(linkedAlgorithmCode(operator(null))).toBeNull();
    expect(linkedAlgorithmCode(operator({ reason: 'Algorithm version not found' }))).toBeNull();
  });
});
