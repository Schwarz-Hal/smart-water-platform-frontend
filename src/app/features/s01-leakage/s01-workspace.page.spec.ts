import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { S01Dma, S01Template } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackerService } from '../../core/services/task-tracker.service';
import { S01WorkspacePage } from './s01-workspace.page';

const template: S01Template = {
  template_code: 's01_leakage_assessment_v1',
  template_name: 'DMA 漏损评估',
  contract_version: 1,
  execution_mode: 'fixed_dag',
  required_binding_roles: ['inlet_flow', 'authorized_consumption', 'legitimate_night_use'],
  nodes: [],
  candidate_notice: '候选需要人工核验。',
};

const dma: S01Dma = {
  id: 1,
  code: 'demo-dma',
  name: '演示 DMA',
  description: null,
  timezone: 'Asia/Shanghai',
  status: 'active',
  created_by_user_id: 1,
  created_at: '2026-07-30T00:00:00Z',
};

describe('S01WorkspacePage', () => {
  beforeEach(async () => {
    const api = {
      get: <T>(path: string) => {
        if (path === '/api/v1/s01/template') return of(template as T);
        if (path === '/api/v1/s01/dmas') return of([dma] as T);
        if (path === '/api/v1/s01/dmas/1/bindings') return of([] as T);
        return of([] as T);
      },
      post: <T>() => of({} as T),
    };
    await TestBed.configureTestingModule({
      imports: [S01WorkspacePage],
      providers: [
        provideNoopAnimations(),
        { provide: ApiClient, useValue: api },
        { provide: AuthService, useValue: { hasPermission: () => true } },
        {
          provide: NotificationService,
          useValue: { success: () => undefined, error: () => undefined },
        },
        { provide: TaskTrackerService, useValue: { track: () => null } },
      ],
    }).compileComponents();
  });

  it('loads the S01 template and DMA list through the assessment API', () => {
    const fixture = TestBed.createComponent(S01WorkspacePage);
    const page = fixture.componentInstance;

    expect(page.assessmentTemplate()?.template_code).toBe('s01_leakage_assessment_v1');
    expect(page.dmas()).toEqual([dma]);
    expect(page.selectedDmaId()).toBe(1);
  });

  it('keeps the quality gate plus six reviewed S01 algorithm blocks editable', () => {
    const fixture = TestBed.createComponent(S01WorkspacePage);
    const page = fixture.componentInstance;

    expect(page.nodes()).toHaveLength(7);
    expect(page.nodes().map((node) => node.code)).toContain('s01_evidence_fusion_v1');
  });

  it('restores the selected block parameters to reviewed defaults', () => {
    const fixture = TestBed.createComponent(S01WorkspacePage);
    const page = fixture.componentInstance;
    const code = 's01_minimum_night_flow_v1';
    const node = page.nodes().find((item) => item.code === code);
    if (!node) throw new Error('Expected S01 node was not found');
    node.parameters[0].value = 23;

    page.reset(code);

    expect(page.nodes().find((item) => item.code === code)?.parameters[0].value).toBe(2);
  });
});
