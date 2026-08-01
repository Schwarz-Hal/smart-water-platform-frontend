import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { WorkflowEditorPage } from './workflow-editor.page';

describe('WorkflowEditorPage', () => {
  beforeEach(async () => {
    const api = {
      get: <T>(path: string) =>
        path.includes('node-definitions')
          ? of([
              {
                node_code: 'dataset_channel_v1',
                version: '1.0.0',
                node_name: 'Dataset channel',
                description: '',
                category: 'data_source',
                runtime_type: 'platform',
                input_ports: [],
                output_ports: [],
                parameter_schema: { properties: {} },
              },
            ] as T)
          : of({
              graph: {
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
              },
            } as T),
      post: <T>() => of({} as T),
      put: <T>() => of({} as T),
    };
    await TestBed.configureTestingModule({
      imports: [WorkflowEditorPage],
      providers: [
        { provide: ApiClient, useValue: api },
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
  });
});
