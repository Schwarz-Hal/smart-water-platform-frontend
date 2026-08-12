import {
  AfterViewInit,
  Component,
  ElementRef,
  Injectable,
  OnDestroy,
  Signal,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { DataAssetSelection } from '../../core/models/api.models';
import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';
import { OperatorNameService } from '../../core/services/operator-name.service';
import {
  OperatorParameterFormComponent,
  ParameterSchema,
} from '../../shared/components/operator-parameter-form.component';
import type { Definition, EditorNode } from './workflow-editor.page';

export interface SelectedRuntimeBinding {
  id: string;
  label: string;
  selection: DataAssetSelection | null;
  wholeAsset: boolean;
}

export interface WorkflowEditorPanelHost {
  readonly definitions: Signal<Definition[]>;
  readonly nodes: Signal<EditorNode[]>;
  readonly selectedNode: Signal<EditorNode | null>;
  readonly selectedDataBinding: Signal<SelectedRuntimeBinding | null>;
  readonly history: Signal<unknown[]>;
  readonly historyIndex: Signal<number>;
  readonly edges: unknown[];
  addNode(definition: Definition): Promise<void>;
  onCatalogDragStart(event: DragEvent, definition: Definition): void;
  allowDrop(event: DragEvent): void;
  onCanvasDrop(event: DragEvent): void;
  attachEditorHost(element: HTMLDivElement): void;
  detachEditorHost(element: HTMLDivElement): void;
  fitView(): Promise<void>;
  undo(): void;
  redo(): void;
  parameterEntries(node: EditorNode): Array<{ key: string; value: unknown }>;
  parameterSchema(node: EditorNode, key: string): Record<string, any>;
  setParameter(id: string, key: string, value: unknown): void;
  setParameters(id: string, parameters: Record<string, unknown>): void;
  setParameterValidity(id: string, valid: boolean): void;
  coerceNumber(value: unknown, integer: boolean): number;
  isOutputPort(nodeId: string, port: string): boolean;
  toggleOutputPort(nodeId: string, port: string): void;
  removeNode(id: string): Promise<void>;
  setBinding(nodeId: string, selection: DataAssetSelection | null): void;
}

@Injectable()
export class WorkflowEditorPanelBridge {
  host?: WorkflowEditorPanelHost;

  requireHost(): WorkflowEditorPanelHost {
    if (!this.host) throw new Error('Workflow editor panel host is not ready');
    return this.host;
  }
}

@Component({
  selector: 'app-operator-catalog-panel',
  imports: [FormsModule],
  template: `
    <section class="panel-content catalog-panel">
      <header class="panel-heading">
        <div>
          <span>算子目录</span>
          <h2>可用节点</h2>
        </div>
        <small>{{ host.definitions().length }}</small>
      </header>
      <label class="search">搜索<input [(ngModel)]="search" placeholder="名称或编码" /></label>
      <p class="help">点击添加，或拖入画布。</p>
      <div class="catalog-groups">
        @for (group of groups(); track group.category) {
          <section class="catalog-group">
            <button class="group-heading" type="button" (click)="toggle(group.category)">
              <span
                ><b>{{ group.label }}</b
                ><small>{{ group.items.length }}</small></span
              >
              <span>{{ isOpen(group.category) ? '−' : '+' }}</span>
            </button>
            @if (isOpen(group.category)) {
              <div class="catalog-items">
                @for (item of group.items; track item.node_code) {
                  <button
                    class="catalog-item"
                    draggable="true"
                    (dragstart)="host.onCatalogDragStart($event, item)"
                    (click)="host.addNode(item)"
                  >
                    <i [class.gpu]="item.runtime_type === 'builtin_gpu'"></i>
                    <span
                      ><b>{{ operatorNames.displayName(item.node_code, item.node_name) }}</b
                      ><small>{{ item.node_code }}</small></span
                    >
                  </button>
                }
              </div>
            }
          </section>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .panel-content {
      height: 100%;
      overflow: auto;
      padding: 14px;
      background: var(--sw-surface);
      color: var(--sw-text-primary);
    }
    .panel-heading,
    .group-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .panel-heading span {
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
    }
    h2 {
      margin: 2px 0 0;
      font-size: 18px;
    }
    .search {
      display: grid;
      gap: 5px;
      margin-top: 12px;
      font-size: 12px;
    }
    .search input {
      width: 100%;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      padding: 9px 10px;
      background: var(--sw-surface-raised);
      color: inherit;
    }
    .help {
      margin: 6px 0 10px;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .catalog-group {
      border-top: 1px solid var(--sw-border);
      padding-top: 7px;
    }
    .group-heading {
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 8px 2px;
      text-align: left;
    }
    .group-heading small {
      margin-left: 7px;
      color: var(--sw-text-muted);
    }
    .catalog-items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 6px;
      padding-bottom: 8px;
    }
    .catalog-item {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr);
      align-items: center;
      gap: 7px;
      min-height: 50px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
      color: inherit;
      padding: 7px 9px;
      text-align: left;
      cursor: grab;
    }
    .catalog-item:hover {
      border-color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-sm);
    }
    .catalog-item i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sw-color-success);
    }
    .catalog-item i.gpu {
      background: #8b5cf6;
    }
    .catalog-item b,
    .catalog-item small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .catalog-item b {
      font-size: 12px;
    }
    .catalog-item small {
      margin-top: 3px;
      color: var(--sw-text-muted);
      font-size: 10px;
    }
  `,
})
export class OperatorCatalogPanelComponent {
  readonly host = inject(WorkflowEditorPanelBridge).requireHost();
  readonly operatorNames = inject(OperatorNameService);
  search = '';
  private readonly openCategories = new Set([
    'data_source',
    'transform',
    'algorithm',
    'control',
    'output',
    'composite',
  ]);
  private readonly labels: Record<string, string> = {
    data_source: '数据源',
    transform: '数据转换',
    algorithm: '算法',
    control: '控制',
    output: '输出',
    composite: '复合算子',
  };

  groups(): Array<{ category: string; label: string; items: Definition[] }> {
    const term = this.search.trim().toLowerCase();
    const groups = new Map<string, Definition[]>();
    for (const item of this.host.definitions()) {
      if (term && !this.operatorNames.matches(item.node_code, item.node_name, term)) continue;
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return ['data_source', 'transform', 'algorithm', 'control', 'output', 'composite']
      .filter((category) => groups.has(category))
      .map((category) => ({
        category,
        label: this.labels[category] ?? category,
        items: groups.get(category) ?? [],
      }));
  }

  isOpen(category: string): boolean {
    return Boolean(this.search.trim()) || this.openCategories.has(category);
  }
  toggle(category: string): void {
    if (this.openCategories.has(category)) this.openCategories.delete(category);
    else this.openCategories.add(category);
  }
}

@Component({
  selector: 'app-workflow-canvas-panel',
  imports: [MatButtonModule],
  template: `
    <section class="canvas-shell">
      <div
        #editorHost
        class="rete-host"
        (dragover)="host.allowDrop($event)"
        (drop)="host.onCanvasDrop($event)"
      ></div>
      @if (!host.nodes().length) {
        <div class="canvas-empty">从算子目录添加节点。</div>
      }
      <div class="canvas-tools">
        <button mat-stroked-button (click)="host.fitView()">适应画布</button>
        <button mat-stroked-button (click)="host.undo()" [disabled]="host.historyIndex() <= 0">
          撤销
        </button>
        <button
          mat-stroked-button
          (click)="host.redo()"
          [disabled]="host.historyIndex() >= host.history().length - 1"
        >
          重做
        </button>
      </div>
    </section>
  `,
  styles: `
    :host,
    .canvas-shell,
    .rete-host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .canvas-shell {
      position: relative;
      overflow: hidden;
      background: var(--sw-canvas-bg);
    }
    .rete-host {
      background-image:
        linear-gradient(var(--sw-border) 1px, transparent 1px),
        linear-gradient(90deg, var(--sw-border) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .canvas-empty {
      position: absolute;
      inset: 50% auto auto 50%;
      translate: -50% -50%;
      color: var(--sw-text-muted);
      pointer-events: none;
    }
    .canvas-tools {
      position: absolute;
      left: 12px;
      bottom: 12px;
      display: flex;
      gap: 7px;
      padding: 5px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: color-mix(in srgb, var(--sw-surface) 92%, transparent);
      box-shadow: var(--sw-shadow-sm);
      z-index: var(--sw-z-toolbar);
    }
    :host ::ng-deep [data-testid='node'].selected {
      outline: 3px solid var(--sw-node-selected);
      outline-offset: 3px;
      border-radius: 10px;
      box-shadow:
        0 0 0 6px color-mix(in srgb, var(--sw-node-selected) 18%, transparent),
        0 8px 20px color-mix(in srgb, var(--sw-node-selected) 28%, transparent);
    }
    :host ::ng-deep [data-testid='node'].selected [data-testid='input'],
    :host ::ng-deep [data-testid='node'].selected [data-testid='output'],
    :host ::ng-deep [data-testid='node'].selected [data-testid='socket'] {
      outline: none !important;
      box-shadow: none !important;
    }
  `,
})
export class WorkflowCanvasPanelComponent implements AfterViewInit, OnDestroy {
  readonly host = inject(WorkflowEditorPanelBridge).requireHost();
  @ViewChild('editorHost', { static: true }) private editorHost!: ElementRef<HTMLDivElement>;
  ngAfterViewInit(): void {
    this.host.attachEditorHost(this.editorHost.nativeElement);
  }
  ngOnDestroy(): void {
    this.host.detachEditorHost(this.editorHost.nativeElement);
  }
}

@Component({
  selector: 'app-node-inspector-panel',
  imports: [FormsModule, MatButtonModule, DataAssetPickerComponent, OperatorParameterFormComponent],
  template: `
    <section class="panel-content">
      @if (host.selectedNode(); as node) {
        <header>
          <span>节点属性</span>
          <h2>{{ operatorNames.displayName(node.node_code, node.definition?.node_name) }}</h2>
        </header>
        <small>{{ node.node_code }} · {{ node.node_version }}</small>
        <p>{{ node.definition?.description }}</p>
        <h3>端口</h3>
        <div class="ports">
          @for (port of node.definition?.input_ports || []; track port.key) {
            <span class="input"
              >← {{ port.label }}
              <small>{{ port.data_type }}{{ port.unit ? ' · ' + port.unit : '' }}</small></span
            >
          }
          @for (port of node.definition?.output_ports || []; track port.key) {
            <span class="output"
              >{{ port.label }} →
              <small>{{ port.data_type }}{{ port.unit ? ' · ' + port.unit : '' }}</small></span
            >
          }
        </div>
        <h3>参数</h3>
        <app-operator-parameter-form
          [schema]="node.definition?.parameter_schema || {}"
          [uiSchema]="node.definition?.ui_schema || {}"
          [model]="node.parameters"
          (parametersChange)="host.setParameters(node.id, $event)"
          (validityChange)="host.setParameterValidity(node.id, $event)"
        />
        @if (host.selectedDataBinding(); as binding) {
          <section class="runtime-binding">
            <h3>运行数据绑定</h3>
            <p>
              {{
                binding.wholeAsset
                  ? '选择该数据节点使用的完整数据版本。'
                  : '选择该数据节点使用的点位与指标通道。'
              }}
            </p>
            <app-data-asset-picker
              [selection]="binding.selection"
              [channelRequired]="!binding.wholeAsset"
              (selectionChange)="host.setBinding(binding.id, $event)"
            />
          </section>
        }
        <div class="outputs">
          <b>工作流输出</b>
          @for (port of node.definition?.output_ports || []; track port.key) {
            <label
              ><input
                type="checkbox"
                [checked]="host.isOutputPort(node.id, port.key)"
                (change)="host.toggleOutputPort(node.id, port.key)"
              />{{ port.label || port.key }}</label
            >
          }
        </div>
        <button mat-stroked-button color="warn" (click)="host.removeNode(node.id)">移除节点</button>
      } @else {
        <div class="empty">在画布中选择节点以查看属性。</div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .panel-content {
      height: 100%;
      overflow: auto;
      padding: 15px;
      background: var(--sw-surface);
      color: var(--sw-text-primary);
    }
    header span {
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
    }
    h2 {
      margin: 3px 0 5px;
      font-size: 18px;
    }
    h3 {
      margin: 18px 0 8px;
      font-size: 14px;
    }
    p,
    small {
      color: var(--sw-text-muted);
    }
    .ports {
      display: grid;
      gap: 5px;
    }
    .ports span {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: var(--sw-radius-sm);
      font-size: 12px;
    }
    .ports .input {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .ports .output {
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
    }
    .outputs {
      display: grid;
      gap: 7px;
      margin: 18px 0;
    }
    .outputs label {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .runtime-binding {
      margin-top: 18px;
      padding-top: 2px;
      border-top: 1px solid var(--sw-border);
    }
    .runtime-binding p {
      margin: -2px 0 12px;
      font-size: 12px;
    }
    .empty {
      display: grid;
      height: 100%;
      place-items: center;
      color: var(--sw-text-muted);
      text-align: center;
    }
  `,
})
export class NodeInspectorPanelComponent {
  readonly host = inject(WorkflowEditorPanelBridge).requireHost();
  readonly operatorNames = inject(OperatorNameService);
}
