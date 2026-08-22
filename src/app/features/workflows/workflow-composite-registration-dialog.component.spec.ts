import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import {
  WorkflowCompositeRegistrationDialogComponent,
  deriveCompositeCandidates,
} from './workflow-composite-registration-dialog.component';

const graph = {
  contract_version: '1.0',
  nodes: [
    { id: 'source', node_code: 'dataset_channel_v1', node_version: '1.0.0', parameters: {} },
    { id: 'score', node_code: 'qscore_v1', node_version: '1.0.0', parameters: { threshold: 0.8 } },
  ],
  edges: [
    { source: { node_id: 'source', port: 'series' }, target: { node_id: 'score', port: 'series' } },
  ],
  outputs: [{ node_id: 'score', port: 'quality' }],
};

const definitions = [
  {
    node_code: 'dataset_channel_v1',
    version: '1.0.0',
    node_name: '数据通道',
    output_ports: [{ key: 'series', label: '时序数据', data_type: 'timeseries', unit: 'm3/h' }],
    parameter_schema: { properties: {} },
  },
  {
    node_code: 'qscore_v1',
    version: '1.0.0',
    node_name: '数据质量评分',
    output_ports: [{ key: 'quality', label: '质量评分', data_type: 'scalar' }],
    parameter_schema: {
      properties: { threshold: { type: 'number', default: 0.8, title: '质量阈值' } },
      required: ['threshold'],
    },
  },
];

describe('WorkflowCompositeRegistrationDialogComponent', () => {
  it('derives boundary inputs, declared outputs and internal parameters', () => {
    const result = deriveCompositeCandidates(graph, definitions);

    expect(result.errors).toEqual([]);
    expect(result.inputs[0]).toMatchObject({
      key: 'series',
      dataType: 'timeseries',
      unit: 'm3/h',
      source: { node_id: 'source', port: 'series' },
    });
    expect(result.outputs[0]).toMatchObject({
      key: 'quality',
      dataType: 'scalar',
      source: { node_id: 'score', port: 'quality' },
    });
    expect(result.parameters[0]).toMatchObject({
      key: 'threshold',
      nodeId: 'score',
      required: true,
      defaultValue: 0.8,
    });
  });

  it('loads the exact published graph and submits the selected interface', () => {
    const requests: Array<{ path: string; body?: unknown }> = [];
    const api = {
      get: <T>(path: string) => {
        requests.push({ path });
        return of({ graph, node_definitions: definitions } as T);
      },
      post: <T>(path: string, body: unknown) => {
        requests.push({ path, body });
        return of({} as T);
      },
    };
    const dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [WorkflowCompositeRegistrationDialogComponent],
      providers: [
        { provide: ApiClient, useValue: api },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            workflowVersionId: 18,
            workflowVersionNumber: 4,
            workflowName: 'Demo',
            draftDirty: true,
          },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    const fixture = TestBed.createComponent(WorkflowCompositeRegistrationDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.metadataForm.patchValue({ nodeName: '演示复合算子', nodeCode: 'demo_composite' });
    component.submit();

    expect(requests[0]?.path).toBe('/api/v1/workflow-versions/18/composite-graph');
    const submission = requests.find((item) => item.path.endsWith('/composite-operator'));
    expect(submission?.body).toMatchObject({
      node_code: 'demo_composite',
      node_version: '1.0.0',
      interface: {
        schema_version: '1.0',
        inputs: [{ source: { node_id: 'source', port: 'series' } }],
        outputs: [{ source: { node_id: 'score', port: 'quality' } }],
        parameters: [],
      },
    });
    expect(dialogRef.close).toHaveBeenCalledWith({
      registered: true,
      nodeCode: 'demo_composite',
      nodeName: '演示复合算子',
      nodeVersion: '1.0.0',
    });
  });

  it('rejects duplicate exposed keys and a graph without outputs', () => {
    const result = deriveCompositeCandidates({ ...graph, outputs: [] }, definitions);
    expect(result.errors.join(' ')).toContain('最终输出');

    const normal = deriveCompositeCandidates(graph, definitions);
    normal.outputs[0].key = normal.inputs[0].key;
    expect(new Set([normal.inputs[0].key, normal.outputs[0].key]).size).toBe(1);
  });

  it('recovers after an invalid form submission and can submit corrected values', () => {
    const requests: Array<{ path: string; body?: unknown }> = [];
    const api = {
      get: <T>(path: string) => {
        requests.push({ path });
        return of({ graph, node_definitions: definitions } as T);
      },
      post: <T>(path: string, body: unknown) => {
        requests.push({ path, body });
        return of({} as T);
      },
    };
    const dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [WorkflowCompositeRegistrationDialogComponent],
      providers: [
        { provide: ApiClient, useValue: api },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            workflowVersionId: 19,
            workflowVersionNumber: 5,
            workflowName: 'Demo',
            draftDirty: false,
          },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    const fixture = TestBed.createComponent(WorkflowCompositeRegistrationDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.metadataForm.patchValue({ nodeName: '', nodeCode: 'a', nodeVersion: '1.0' });
    component.submit();
    expect(requests.filter((item) => item.path.endsWith('/composite-operator'))).toHaveLength(0);

    component.metadataForm.patchValue({
      nodeName: '修复后的复合算子',
      nodeCode: 'fixed_composite',
      nodeVersion: '1.0.0-rc.1+build.2',
    });
    expect(component.canSubmit()).toBe(true);
    component.submit();
    expect(requests.some((item) => item.path.endsWith('/composite-operator'))).toBe(true);
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
