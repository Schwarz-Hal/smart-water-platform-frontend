import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-status-chip',
  template: `<span [class]="'status-chip status-' + normalized()">{{ label() }}</span>`,
  styles: `
    .status-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
    }
    .status-success,
    .status-ready,
    .status-ok,
    .status-active {
      background: #dcfce7;
      color: #166534;
    }
    .status-running,
    .status-queued,
    .status-pending,
    .status-mapping,
    .status-importing {
      background: #dbeafe;
      color: #1d4ed8;
    }
    .status-failed,
    .status-degraded {
      background: #fee2e2;
      color: #b91c1c;
    }
    .status-cancelled,
    .status-retired {
      background: #e5e7eb;
      color: #4b5563;
    }
    .status-gpu,
    .status-warning {
      background: #fef3c7;
      color: #92400e;
    }
  `,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly label = input<string>();
  readonly normalized = computed(() =>
    this.status()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
  );
}
