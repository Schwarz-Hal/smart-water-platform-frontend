import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import { WorkflowCompositeCanvasPanelComponent } from './workflow-composite-canvas-panel.component';

describe('WorkflowCompositeCanvasPanelComponent', () => {
  it('shows a safe error when the composite graph cannot be loaded', () => {
    TestBed.configureTestingModule({
      imports: [WorkflowCompositeCanvasPanelComponent],
      providers: [
        {
          provide: ApiClient,
          useValue: { get: () => throwError(() => new Error('network failure')) },
        },
      ],
    });
    const fixture = TestBed.createComponent(WorkflowCompositeCanvasPanelComponent);
    fixture.componentInstance.params = { workflowVersionId: 42, readOnly: true };
    fixture.detectChanges();

    expect(fixture.componentInstance.errorMessage()).toContain('无法读取');
    expect(fixture.nativeElement.textContent).toContain('复合节点暂时无法打开');
  });
});
