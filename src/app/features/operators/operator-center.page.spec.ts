import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { AlgorithmDocument, OperatorSummary } from '../../core/models/api.models';
import {
  clampOperatorCatalogWidth,
  countActiveOperatorFilters,
  currentAlgorithmDocumentVersion,
  extractParameterSpecs,
  linkedAlgorithmCode,
  operatorDocumentScopeKey,
} from './operator-center.page';

function operator(algorithm: Record<string, unknown> | null, code = 'dataset_channel_v1'): OperatorSummary {
  return {
    code,
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

  it('resolves document scope key with algorithm code priority and operator code fallback', () => {
    // 1. When linked algorithm exists, use its code
    expect(operatorDocumentScopeKey(operator({ code: 'chronos2_flow_forecast' }, 'chronos2_node'))).toBe(
      'chronos2_flow_forecast',
    );

    // 2. When linked algorithm is null or missing, fall back to operator code
    expect(operatorDocumentScopeKey(operator(null, 'align_timeseries_v1'))).toBe(
      'align_timeseries_v1',
    );
    expect(
      operatorDocumentScopeKey(
        operator({ reason: 'Algorithm version not found' }, 's01_minimum_night_flow_v1'),
      ),
    ).toBe('s01_minimum_night_flow_v1');

    // 3. When operator is null, return null
    expect(operatorDocumentScopeKey(null)).toBeNull();
  });
});

describe('operator documents', () => {
  it('renders only the explicitly selected current document version', () => {
    const document: AlgorithmDocument = {
      document_id: 'doc-1',
      title: 'Chronos-2 算法说明',
      doc_kind: 'reference',
      status: 'published',
      current_version_id: 'version-2',
      versions: [
        {
          document_version_id: 'version-1',
          version: '1.0.0',
          locale: 'zh-CN',
          source_type: 'markdown',
          status: 'published',
          markdown: '旧文档',
          created_at: '2026-08-01T00:00:00+08:00',
        },
        {
          document_version_id: 'version-2',
          version: '1.1.0',
          locale: 'zh-CN',
          source_type: 'markdown',
          status: 'published',
          markdown: '新文档',
          created_at: '2026-08-18T00:00:00+08:00',
        },
      ],
    };

    expect(currentAlgorithmDocumentVersion(document)?.markdown).toBe('新文档');
  });
});

describe('operator catalogue controls', () => {
  it('clamps the resizable list between 320px and 45 percent of the workspace', () => {
    expect(clampOperatorCatalogWidth(120, 1200)).toBe(320);
    expect(clampOperatorCatalogWidth(900, 1200)).toBe(540);
    expect(clampOperatorCatalogWidth(412.4, 1200)).toBe(412);
  });

  it('counts only selected filters', () => {
    expect(
      countActiveOperatorFilters({
        kind: 'algorithm',
        maturity: '',
        task: 'forecasting',
        learning: '',
      }),
    ).toBe(2);
  });
});

describe('parameter specification extraction', () => {
  it('extracts structured parameter specs with titles, constraints, and default values', () => {
    const op = operator({ default_params: { horizon: 96, mode: 'fast' } });
    if (op.active_version) {
      op.active_version.parameter_schema = {
        type: 'object',
        properties: {
          horizon: {
            title: '预测步长',
            type: 'integer',
            minimum: 1,
            maximum: 720,
            default: 96,
            description: '前向预测的时间步数',
          },
          mode: {
            title: '运行模式',
            type: 'string',
            enum: ['fast', 'accurate'],
            default: 'fast',
          },
        },
      };
      op.active_version.default_parameters = { horizon: 120, mode: 'accurate' };
      op.active_version.ui_schema = {
        horizon: { unit: '步' },
      };

      const specs = extractParameterSpecs(op.active_version);
      expect(specs.length).toBe(2);

      const horizonSpec = specs.find((s) => s.key === 'horizon');
      expect(horizonSpec).toBeDefined();
      expect(horizonSpec?.title).toBe('预测步长');
      expect(horizonSpec?.type).toBe('整数');
      expect(horizonSpec?.currentValue).toBe(120);
      expect(horizonSpec?.defaultValue).toBe(96);
      expect(horizonSpec?.constraints).toContain('[1, 720]');
      expect(horizonSpec?.unit).toBe('步');

      const modeSpec = specs.find((s) => s.key === 'mode');
      expect(modeSpec).toBeDefined();
      expect(modeSpec?.title).toBe('运行模式');
      expect(modeSpec?.type).toBe('文本');
      expect(modeSpec?.currentValue).toBe('accurate');
      expect(modeSpec?.constraints).toContain('fast | accurate');
    }
  });
});

