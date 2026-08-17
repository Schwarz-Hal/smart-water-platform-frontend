import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { delay, of } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { WorkflowEditorPage } from './workflow-editor.page';
import { WorkflowEditorWorkspacePage } from './workflow-editor-workspace.page';

describe('WorkflowEditorPage', () => {
  let asyncApiResponses = false;

  beforeEach(async () => {
    asyncApiResponses = false;
    const api = {
      get: <T>(path: string) => {
        const respond = (value: T) => (asyncApiResponses ? of(value).pipe(delay(0)) : of(value));
        if (path.includes('operators')) {
          return respond({
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
        if (path.endsWith('/versions')) {
          return respond([
            { id: 12, version: 2, status: 'published' },
            { id: 11, version: 1, status: 'published' },
          ] as T);
        }
        return respond({
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
      imports: [WorkflowEditorPage, WorkflowEditorWorkspacePage],
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

  it('restores the latest published version when reopening an existing workflow', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;

    expect(page.publishedVersionId()).toBe(12);
  });

  it('drops connections whose node or port is no longer available', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;

    page.loadGraph({
      contract_version: '1.0',
      nodes: [
        {
          id: 'source',
          node_code: 'dataset_channel_v1',
          node_version: '1.0.0',
          parameters: {},
        },
        {
          id: 'retired-node',
          node_code: 's01_assessment_v1',
          node_version: '1.0.0',
          parameters: {},
        },
      ],
      edges: [
        {
          source: { node_id: 'source', port: 'series' },
          target: { node_id: 'retired-node', port: 'inlet_flow' },
        },
      ],
      outputs: [],
    });

    expect(page.graph().edges).toEqual([]);
    expect(page.message()).toContain('1 条无效连接');
  });

  it('keeps a dedicated message row so the workspace remains in the flexible grid row', async () => {
    asyncApiResponses = true;
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    const fixture = TestBed.createComponent(WorkflowEditorWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    const messageSlot = fixture.nativeElement.querySelector('.message-slot');
    const workspaceBody = fixture.nativeElement.querySelector('.workspace-body');

    expect(messageSlot).toBeTruthy();
    expect(messageSlot.textContent.trim()).toBe('');
    expect(workspaceBody).toBeTruthy();
  });
});
