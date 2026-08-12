import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { WorkflowEditorPage } from './workflow-editor.page';

describe('WorkflowEditorPage', () => {
  beforeEach(async () => {
    const api = {
      get: <T>(path: string) => {
        if (path.includes('operators')) {
          return of({
            items: [
              {
                code: 'dataset_channel_v1',
                name: 'Dataset channel',
                description: '',
                category: 'data_source',
                kind: 'data_source',
                status: 'active',
                available: true,
                active_version: {
                  version: '1.0.0',
                  runtime_type: 'platform',
                  executor_type: 'builtin_handler',
                  maturity: 'production',
                  available: true,
                  input_ports: [],
                  output_ports: [{ key: 'series', label: 'Series', data_type: 'timeseries' }],
                  parameter_schema: { properties: {} },
                  ui_schema: {},
                  visualization_schema: {},
                  algorithm: null,
                },
              },
            ],
          } as T);
        }
        return of({
          id: 1,
          workflow_name: 'Demo',
          draft_revision: 1,
          draft_graph: {
            contract_version: '1.0',
            nodes: [
              {
                id: 'source',
                node_code: 'dataset_channel_v1',
                node_version: '1.0.0',
                parameters: {},
              },
            ],
            edges: [],
            outputs: [{ node_id: 'source', port: 'series' }],
            bindings: {
              source: {
                dataset_asset_id: 2,
                dataset_version_id: 4,
                monitor_point_id: 8,
                metric_code: 'flow',
                value_source: 'processed',
                start: '2026-01-01T00:00:00',
                end: '2026-01-02T00:00:00',
              },
            },
          },
        } as T);
      },
      post: <T>() => of({} as T),
      put: <T>() => of({} as T),
    };
    await TestBed.configureTestingModule({
      imports: [WorkflowEditorPage],
      providers: [
        { provide: ApiClient, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '1' }, queryParamMap: { get: () => null } },
          },
        },
        {
          provide: NotificationService,
          useValue: { success: () => undefined, error: () => undefined },
        },
      ],
    }).compileComponents();
  });

  it('loads the server catalog and starter graph', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;
    expect(page.definitions()).toHaveLength(1);
    expect(page.nodes().map((node) => node.id)).toEqual(['source']);
    expect(page.workflowName()).toBe('Demo');
  });

  it('restores dataset bindings from the workflow draft graph', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;

    expect(page.graph().bindings?.['source']).toEqual({
      dataset_asset_id: 2,
      dataset_version_id: 4,
      monitor_point_id: 8,
      metric_code: 'flow',
      value_source: 'processed',
      start: '2026-01-01T00:00:00',
      end: '2026-01-02T00:00:00',
    });
    expect(page.bindingsReady()).toBe(true);
  });
});
