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
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .status-running,
    .status-queued,
    .status-pending,
    .status-mapping,
    .status-importing {
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
    }
    .status-failed,
    .status-degraded {
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    .status-cancelled,
    .status-retired {
      background: var(--sw-color-neutral-soft);
      color: var(--sw-text-secondary);
    }
    .status-gpu,
    .status-warning {
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
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
