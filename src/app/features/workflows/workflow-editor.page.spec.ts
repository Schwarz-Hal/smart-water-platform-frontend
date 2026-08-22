import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { delay, of } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { WorkflowEditorPage } from './workflow-editor.page';
import {
  ROOT_CANVAS_PANEL_ID,
  WorkflowEditorWorkspacePage,
  isRootWorkflowDocumentPanelId,
} from './workflow-editor-workspace.page';
import { WorkflowDocumentTabComponent } from './workflow-document-tab.component';

describe('WorkflowEditorPage', () => {
  let asyncApiResponses = false;
  let apiRequests: Array<{ method: string; path: string; body: unknown }> = [];
  let draftResponse: Record<string, unknown> = {};
  let publishResponse: Record<string, unknown> = { id: 20, version: 3 };
  let runResponse: Record<string, unknown> = {};

  beforeEach(async () => {
    asyncApiResponses = false;
    apiRequests = [];
    draftResponse = {};
    publishResponse = { id: 20, version: 3 };
    runResponse = {};
    const api = {
      get: <T>(path: string) => {
        const respond = (value: T) => (asyncApiResponses ? of(value).pipe(delay(0)) : of(value));
        if (/\/operators\/[^/]+\/versions\//.test(path)) {
          return respond({
            version: {
              version: '1.0.0',
              executor_type: 'composite_workflow',
              composite_workflow_version_id: 42,
            },
          } as T);
        }
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
      post: <T>(path: string, body: unknown) => {
        apiRequests.push({ method: 'POST', path, body });
        if (path.endsWith('/publish')) return of(publishResponse as T);
        if (path.includes('/runs')) return of(runResponse as T);
        return of({} as T);
      },
      put: <T>(path: string, body: unknown) => {
        apiRequests.push({ method: 'PUT', path, body });
        return of(draftResponse as T);
      },
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
    expect(page.publishedVersionNumber()).toBe(2);
  });

  it('shows the last saved validation result without issuing a validation request', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;

    page.validate();

    expect(apiRequests.some((request) => request.path.endsWith('/validate'))).toBe(false);
    expect(page.message()).toContain('保存草稿后将自动校验');
    expect(page.validationButtonLabel()).toBe('尚无记录');
  });

  it('keeps a successfully saved draft saved when validation reports issues', () => {
    draftResponse = {
      draft_revision: 2,
      draft_validation_status: 'invalid',
      draft_validation_revision: 2,
      draft_validation_issues: [{ code: 'MISSING_INPUT', message: '缺少输入' }],
    };
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;

    page.save();

    expect(page.autosaveState()).toBe('saved');
    expect(page.validationStatus()).toBe('invalid');
    expect(page.message()).toContain('发现 1 个校验问题');
  });

  it('saves a dirty draft before publishing and only publishes a valid result', () => {
    draftResponse = { draft_revision: 2, draft_validation_status: 'valid' };
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;
    page.setParameter('source', 'example', 1);

    page.publish();

    expect(apiRequests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'PUT /api/v1/workflows/1/draft',
      'POST /api/v1/workflows/1/publish',
    ]);
    expect(page.draftMatchesPublished()).toBe(true);
    expect(page.publishedVersionId()).toBe(20);
    expect(page.publishedVersionNumber()).toBe(3);
  });

  it('does not publish after a saved draft fails validation', () => {
    draftResponse = {
      draft_revision: 2,
      draft_validation_status: 'invalid',
      draft_validation_issues: [{ code: 'BAD_GRAPH', message: '图结构无效' }],
    };
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;
    page.setParameter('source', 'example', 1);

    page.publish();

    expect(apiRequests.map((request) => request.method)).toEqual(['PUT']);
    expect(page.draftMatchesPublished()).toBe(false);
  });

  it('confirms before running an unpublished draft and runs the exact published version', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;

    page.run();

    const runRequest = apiRequests.find((request) => request.path.includes('/runs'));
    expect(confirm).toHaveBeenCalled();
    expect(runRequest?.path).toBe('/api/v1/workflow-versions/12/runs');
    expect(runRequest?.body).toEqual({ input_bindings: {}, parameter_overrides: {} });
    confirm.mockRestore();
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

  it('uses a stable root document id and distinguishes composite document ids', () => {
    expect(ROOT_CANVAS_PANEL_ID).toBe('canvas:root');
    expect(ROOT_CANVAS_PANEL_ID).not.toBe('canvas');
    expect(isRootWorkflowDocumentPanelId('canvas:root')).toBe(true);
    expect(isRootWorkflowDocumentPanelId('canvas:root/composite:c1')).toBe(false);
  });

  it('does not render a close button for the root document tab', () => {
    const fixture = TestBed.createComponent(WorkflowDocumentTabComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.document-close')).toBeNull();

    const compositeFixture = TestBed.createComponent(WorkflowDocumentTabComponent);
    compositeFixture.componentInstance.params = {
      kind: 'composite',
      title: '复合算子 · C1',
      closable: true,
      path: 'root/c1',
    };
    compositeFixture.detectChanges();
    expect(compositeFixture.nativeElement.querySelector('.document-close')).toBeTruthy();
  });

  it('opens a composite document only after the same node is picked twice quickly', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;
    const definition = {
      node_code: 'water_adaptive_anomaly',
      version: '1.0.0',
      node_name: '水务自适应多变量异常检测',
      description: '',
      category: 'composite',
      runtime_type: 'platform',
      executor_type: 'composite_workflow',
      composite_workflow_version_id: 42,
      input_ports: [],
      output_ports: [],
    };
    page.nodes.set([
      {
        id: 'composite-1',
        node_code: definition.node_code,
        node_version: definition.version,
        parameters: {},
        x: 10,
        y: 10,
        collapsed: false,
        definition,
      },
    ]);
    const openDocument = vi.spyOn(page as any, 'openCompositeNodeDocument');

    (page as any).handleReteNodePicked('composite-1', 100);
    expect(openDocument).not.toHaveBeenCalled();
    (page as any).handleReteNodePicked('composite-1', 400);

    expect(openDocument).toHaveBeenCalledWith('composite-1');
    expect(page.selectedId()).toBe('composite-1');
  });

  it('does not open ordinary nodes or mutate the graph while double picking', () => {
    const page = TestBed.createComponent(WorkflowEditorPage).componentInstance;
    page.nodes.set([
      {
        id: 'ordinary-1',
        node_code: 'dataset_channel_v1',
        node_version: '1.0.0',
        parameters: {},
        x: 10,
        y: 10,
        collapsed: false,
        definition: {
          node_code: 'dataset_channel_v1',
          version: '1.0.0',
          node_name: '数据通道',
          description: '',
          category: 'data_source',
          runtime_type: 'platform',
          composite_interface: {},
          input_ports: [],
          output_ports: [{ key: 'series', label: 'Series', data_type: 'timeseries' }],
        },
      },
    ]);
    const before = JSON.stringify(page.graph());
    const openDocument = vi.spyOn(page as any, 'openCompositeNodeDocument');

    (page as any).handleReteNodePicked('ordinary-1', 100);
    (page as any).handleReteNodePicked('ordinary-1', 300);

    expect(openDocument).not.toHaveBeenCalled();
    expect(JSON.stringify(page.graph())).toBe(before);
  });

  it('opens the exact composite version instead of the newer active catalog version', async () => {
    asyncApiResponses = true;
    const fixture = TestBed.createComponent(WorkflowEditorWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const workspace = fixture.componentInstance;
    (workspace as any).mobile.set(false);
    const addedPanels: Array<Record<string, unknown>> = [];
    (workspace as any).dockviewApi = {
      getPanel: () => undefined,
      addPanel: (panel: Record<string, unknown>) => {
        addedPanels.push(panel);
        return { api: { setActive: () => undefined } };
      },
    };
    workspace.nodes.set([
      {
        id: 'legacy-composite',
        node_code: 'water_adaptive_anomaly',
        node_version: '1.0.0',
        parameters: {},
        x: 10,
        y: 10,
        collapsed: false,
        definition: {
          node_code: 'water_adaptive_anomaly',
          version: '2.0.0',
          node_name: '水务自适应多变量异常检测',
          description: '',
          category: 'composite',
          runtime_type: 'platform',
          executor_type: 'composite_workflow',
          composite_workflow_version_id: 999,
          input_ports: [],
          output_ports: [],
        },
      },
    ]);

    (workspace as any).openCompositeNodeDocument('legacy-composite');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect((addedPanels[0]?.['params'] as Record<string, unknown>)?.['workflowVersionId']).toBe(42);
    fixture.destroy();
  });
});
