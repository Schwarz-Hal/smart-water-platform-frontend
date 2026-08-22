import { Component } from '@angular/core';
import type { DockviewPanelApi } from 'dockview-angular';

export type WorkflowDocumentKind = 'root' | 'composite';

export interface WorkflowDocumentTabParams {
  kind: WorkflowDocumentKind;
  title: string;
  closable: boolean;
  path?: string;
}

@Component({
  selector: 'app-workflow-document-tab',
  standalone: true,
  template: `
    <span class="document-tab" [attr.data-document-kind]="params.kind">
      <span class="document-title">{{ params.title }}</span>
      @if (params.closable) {
        <button
          type="button"
          class="document-close"
          aria-label="关闭文档"
          title="关闭文档"
          (click)="close($event)"
        >
          ×
        </button>
      }
    </span>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .document-tab {
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      min-width: 0;
      gap: 6px;
      padding: 0 8px;
    }
    .document-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .document-close {
      display: inline-grid;
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      place-items: center;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    .document-close:hover {
      background: color-mix(in srgb, currentColor 14%, transparent);
    }
  `,
})
export class WorkflowDocumentTabComponent {
  api?: DockviewPanelApi;
  params: WorkflowDocumentTabParams = {
    kind: 'root',
    title: '工作流画布',
    closable: false,
  };

  close(event: MouseEvent): void {
    event.stopPropagation();
    if (this.params.closable) this.api?.close();
  }
}
