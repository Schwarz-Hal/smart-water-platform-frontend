import {
  AfterViewInit,
  Component,
  Injector,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { Subscription } from 'rxjs';
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularPlugin, Presets as AngularPresets } from 'rete-angular-plugin/21';

import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';
import { DataAssetSelection, OperatorSummary } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { WorkflowCacheService } from '../../core/services/workflow-cache.service';
import { OperatorNameService } from '../../core/services/operator-name.service';

interface Port {
  key: string;
  label: string;
  data_type: string;
  semantic_type?: string | null;
  unit?: string | null;
  required?: boolean;
  cardinality?: 'one' | 'many' | string;
}
export interface Definition {
  node_code: string;
  version: string;
  node_name: string;
  description: string;
  category: string;
  runtime_type: string;
  input_ports: Port[];
  output_ports: Port[];
  parameter_schema?: {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  ui_schema?: Record<string, Record<string, unknown>>;
}
export interface EditorNode {
  id: string;
  node_code: string;
  node_version: string;
  parameters: Record<string, unknown>;
  x: number;
  y: number;
  collapsed: boolean;
  definition?: Definition;
}
interface Edge {
  source: { node_id: string; port: string };
  target: { node_id: string; port: string };
}
interface StoredBinding {
  dataset_asset_id: number;
  dataset_version_id: number;
  monitor_point_id?: number;
  metric_code?: string;
  value_source?: 'raw' | 'processed';
  start?: string | null;
  end?: string | null;
}
export interface Graph {
  contract_version: string;
  nodes: Record<string, unknown>[];
  edges: Edge[];
  outputs: Array<{ node_id: string; port: string }>;
  bindings?: Record<string, StoredBinding>;
}

type DockKind = 'catalog' | 'inspector';
interface DockLayout {
  left: number | null;
  right: number | null;
  top: number;
  width: number;
  height: number | null;
}

interface DockGesture {
  kind: DockKind;
  mode: 'drag' | 'resize';
  startX: number;
  startY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  layoutWidth: number;
  layoutHeight: number;
}

@Component({
  selector: 'app-workflow-editor-page',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatSliderModule, DataAssetPickerComponent],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">工作流编排</p>
        <h1>{{ workflowName() }}</h1>
        <p class="lead">从节点目录拖入处理步骤，拖动端口建立数据流，保存后由服务端校验和发布。</p>
      </div>
      <div class="actions">
        <button mat-stroked-button (click)="validate()" [disabled]="busy()">校验图</button>
        <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
          保存草稿
        </button>
        <button
          mat-flat-button
          color="accent"
          (click)="publish()"
          [disabled]="busy() || !workflowId()"
        >
          发布版本
        </button>
        <button
          mat-flat-button
          color="primary"
          (click)="run()"
          [disabled]="busy() || !publishedVersionId() || !bindingsReady()"
        >
          运行已发布版本
        </button>
      </div>
    </header>
    @if (message()) {
      <div class="message" [class.error]="messageType() === 'error'">{{ message() }}</div>
    }
    <section class="layout">
      <aside
        class="panel catalog dock"
        [class.collapsed]="catalogCollapsed()"
        [style.left.px]="catalogDock().left"
        [style.top.px]="catalogDock().top"
        [style.width.px]="catalogCollapsed() ? 42 : catalogDock().width"
        [style.height.px]="catalogCollapsed() ? 42 : catalogDock().height"
      >
        <button
          class="dock-toggle"
          type="button"
          (click)="toggleDock('catalog')"
          [attr.aria-label]="catalogCollapsed() ? '展开算子目录' : '收起算子目录'"
        >
          {{ catalogCollapsed() ? '›' : '‹' }}
        </button>
        <div class="dock-scroll">
          @if (!catalogCollapsed()) {
            <div class="heading dock-drag-handle" (pointerdown)="startDockDrag($event, 'catalog')">
              <div>
                <span class="kicker">算子目录</span>
                <h2>可用节点</h2>
              </div>
              <small>{{ definitions().length }}</small>
            </div>
            <label class="search"
              >搜索<input [(ngModel)]="search" placeholder="名称或编码"
            /></label>
            <p class="catalog-help">点击添加或拖入画布。</p>
            <div class="catalog-groups">
              @for (group of groupedDefinitions(); track group.category) {
                <section class="catalog-group">
                  <button
                    class="group-header"
                    type="button"
                    (click)="toggleCategory(group.category)"
                  >
                    <span
                      ><b>{{ group.label }}</b
                      ><small>{{ group.items.length }}</small></span
                    ><span>{{ isCategoryOpen(group.category) ? '−' : '+' }}</span>
                  </button>
                  @if (isCategoryOpen(group.category)) {
                    <div class="catalog-items">
                      @for (item of group.items; track item.node_code) {
                        <button
                          class="catalog-item"
                          draggable="true"
                          (dragstart)="onCatalogDragStart($event, item)"
                          (click)="addNode(item)"
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
          }
        </div>
        <span
          class="dock-resize-handle"
          aria-hidden="true"
          (pointerdown)="startDockResize($event, 'catalog')"
        ></span>
      </aside>
      <main class="panel canvas-panel">
        <div class="toolbar">
          <span>{{ workflowId() ? '草稿 #' + draftRevision() : '未保存草稿' }}</span
          ><span class="save-state" [class.conflict]="autosaveState() === 'conflict'">{{
            autosaveLabel()
          }}</span
          ><span>{{ nodes().length }} 个节点 · {{ edges.length }} 条连接</span
          ><span class="hint">拖动节点、端口连线、滚轮缩放</span>
        </div>
        <div
          #editorHost
          class="rete-host"
          (dragover)="allowDrop($event)"
          (drop)="onCanvasDrop($event)"
        ></div>
        @if (!nodes().length) {
          <div class="canvas-empty">从左侧添加节点，或加载 S01 模板。</div>
        }
        <div class="canvas-tools">
          <button mat-stroked-button (click)="fitView()">适应画布</button
          ><button mat-stroked-button (click)="undo()" [disabled]="historyIndex() <= 0">撤销</button
          ><button
            mat-stroked-button
            (click)="redo()"
            [disabled]="historyIndex() >= history().length - 1"
          >
            重做
          </button>
        </div>
      </main>
      <aside
        class="panel inspector dock"
        [class.collapsed]="inspectorCollapsed()"
        [style.left.px]="inspectorDock().left"
        [style.right.px]="inspectorDock().right"
        [style.top.px]="inspectorDock().top"
        [style.width.px]="inspectorCollapsed() ? 42 : inspectorDock().width"
        [style.height.px]="inspectorCollapsed() ? 42 : inspectorDock().height"
      >
        <div class="heading dock-drag-handle" (pointerdown)="startDockDrag($event, 'inspector')">
          <div>
            <span class="kicker">节点属性</span>
            <h2>配置与运行</h2>
          </div>
          <button
            class="dock-toggle inspector-toggle"
            type="button"
            (pointerdown)="$event.stopPropagation()"
            (click)="toggleDock('inspector')"
            [attr.aria-label]="inspectorCollapsed() ? '展开节点属性' : '收起节点属性'"
          >
            {{ inspectorCollapsed() ? '‹' : '›' }}
          </button>
        </div>
        <div class="dock-scroll">
          @if (!inspectorCollapsed()) {
            @if (selectedNode(); as node) {
              <small>{{ node.node_code }} · {{ node.node_version }}</small>
              <p class="description">{{ node.definition?.description }}</p>
              <h3>端口</h3>
              <div class="ports">
                @for (port of node.definition?.input_ports || []; track port.key) {
                  <span class="in"
                    >← {{ port.label }}
                    <small
                      >{{ port.data_type }}{{ port.unit ? ' · ' + port.unit : '' }}</small
                    ></span
                  >
                }
                @for (port of node.definition?.output_ports || []; track port.key) {
                  <span class="out"
                    >{{ port.label }} →
                    <small
                      >{{ port.data_type }}{{ port.unit ? ' · ' + port.unit : '' }}</small
                    ></span
                  >
                }
              </div>
              <h3>参数</h3>
              @for (entry of parameterEntries(node); track entry.key) {
                <label class="parameter"
                  ><span>{{ entry.key }}</span>
                  @if (parameterSchema(node, entry.key)['enum']; as options) {
                    <select
                      [ngModel]="entry.value"
                      (ngModelChange)="setParameter(node.id, entry.key, $event)"
                    >
                      @for (option of options; track option) {
                        <option [ngValue]="option">{{ option }}</option>
                      }
                    </select>
                  } @else if (parameterSchema(node, entry.key)['type'] === 'boolean') {
                    <input
                      type="checkbox"
                      [checked]="entry.value === true"
                      (change)="setParameter(node.id, entry.key, $any($event.target).checked)"
                    />
                  } @else if (
                    parameterSchema(node, entry.key)['type'] === 'number' ||
                    parameterSchema(node, entry.key)['type'] === 'integer'
                  ) {
                    <input
                      type="number"
                      [ngModel]="entry.value"
                      (ngModelChange)="
                        setParameter(
                          node.id,
                          entry.key,
                          coerceNumber(
                            $event,
                            parameterSchema(node, entry.key)['type'] === 'integer'
                          )
                        )
                      "
                    />
                  } @else {
                    <input
                      [ngModel]="entry.value"
                      (ngModelChange)="setParameter(node.id, entry.key, $event)"
                    />
                  }
                </label>
              }
              <div class="output-ports">
                <b>工作流输出</b>
                @for (port of node.definition?.output_ports || []; track port.key) {
                  <label
                    ><input
                      type="checkbox"
                      [checked]="isOutputPort(node.id, port.key)"
                      (change)="toggleOutputPort(node.id, port.key)"
                    />
                    {{ port.label || port.key }}</label
                  >
                }
              </div>
              <button mat-stroked-button color="warn" (click)="removeNode(node.id)">
                移除节点
              </button>
            } @else {
              <div class="empty static">选择节点查看端口和参数。</div>
            }
            @if (selectedDataBinding(); as binding) {
              <section class="binding-panel">
                <hr />
                <h3>运行数据绑定</h3>
                <p class="help">
                  {{
                    binding.wholeAsset
                      ? '选择需要治理的完整数据版本。'
                      : '仅配置当前选中的数据通道。'
                  }}
                </p>
                <div class="binding">
                  <b>{{ binding.label }}</b>
                  <app-data-asset-picker
                    [selection]="binding.selection"
                    [channelRequired]="!binding.wholeAsset"
                    (selectionChange)="setBinding(binding.id, $event)"
                  />
                </div>
              </section>
            }
          }
        </div>
        <span
          class="dock-resize-handle"
          aria-hidden="true"
          (pointerdown)="startDockResize($event, 'inspector')"
        ></span>
      </aside>
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: #172033;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 16px;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      font-size: 32px;
      margin-top: 4px;
    }
    h2 {
      font-size: 17px;
      margin-top: 3px;
    }
    h3 {
      font-size: 13px;
      margin: 17px 0 7px;
    }
    .eyebrow,
    .kicker {
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .description,
    .help {
      color: #667085;
      font-size: 13px;
      line-height: 1.5;
      margin-top: 7px;
    }
    .actions,
    .canvas-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .message {
      padding: 10px 14px;
      border-radius: 9px;
      background: #ecfdf3;
      color: #087443;
      margin-bottom: 14px;
      font-size: 13px;
    }
    .message.error {
      background: #fef3f2;
      color: #b42318;
    }
    .layout {
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr) 330px;
      gap: 14px;
    }
    .panel {
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 13px;
      min-width: 0;
      box-shadow: 0 3px 12px #1018280a;
    }
    .catalog,
    .inspector {
      padding: 15px;
    }
    .heading,
    .toolbar {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .save-state {
      color: #087443;
    }
    .save-state.conflict {
      color: #b42318;
    }
    .heading small,
    .toolbar {
      color: #667085;
      font-size: 12px;
    }
    .search {
      display: grid;
      gap: 5px;
      color: #667085;
      font-size: 12px;
      margin: 16px 0 6px;
    }
    input,
    textarea,
    select {
      box-sizing: border-box;
      border: 1px solid #d0d5dd;
      border-radius: 7px;
      padding: 8px;
      font: inherit;
      font-size: 12px;
      min-width: 0;
    }
    select {
      width: 100%;
      background: #fff;
    }
    .catalog-help {
      color: #98a2b3;
      font-size: 11px;
      margin-bottom: 8px;
    }
    .catalog-item {
      display: grid;
      grid-template-columns: 9px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      text-align: left;
      background: #fff;
      border: 1px solid #eaecf0;
      border-radius: 8px;
      padding: 8px;
      width: 100%;
      margin: 5px 0;
      cursor: grab;
    }
    .catalog-item:hover {
      border-color: #84adf7;
      background: #f8fbff;
    }
    .catalog-item i {
      width: 8px;
      height: 8px;
      background: #16a34a;
      border-radius: 50%;
    }
    .catalog-item i.gpu {
      background: #9333ea;
    }
    .catalog-item b,
    .catalog-item small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .catalog-item b {
      font-size: 11px;
    }
    .catalog-item small {
      color: #98a2b3;
      font-size: 10px;
      margin-top: 3px;
    }
    .catalog-item em {
      font-style: normal;
      color: #667085;
      font-size: 10px;
    }
    .canvas-panel {
      min-height: 690px;
      overflow: hidden;
      position: relative;
    }
    .toolbar {
      padding: 13px 15px;
      border-bottom: 1px solid #eaecf0;
    }
    .toolbar .hint {
      color: #98a2b3;
    }
    .rete-host {
      height: 640px;
      position: relative;
      overflow: hidden;
      background-color: #f8fafc;
      background-image:
        linear-gradient(#e8edf4 1px, transparent 1px),
        linear-gradient(90deg, #e8edf4 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .canvas-empty {
      position: absolute;
      inset: 50px 0 50px;
      display: grid;
      place-items: center;
      pointer-events: none;
      color: #98a2b3;
      font-size: 13px;
    }
    .canvas-tools {
      position: absolute;
      left: 14px;
      bottom: 14px;
      background: #ffffffdd;
      padding: 6px;
      border-radius: 9px;
      box-shadow: 0 3px 12px #10182818;
    }
    .ports {
      display: grid;
      gap: 5px;
    }
    .ports span {
      display: flex;
      justify-content: space-between;
      gap: 5px;
      padding: 6px 7px;
      border-radius: 6px;
      font-size: 11px;
    }
    .ports small {
      color: #98a2b3;
      overflow-wrap: anywhere;
    }
    .ports .in {
      background: #f0fdf4;
      color: #166534;
    }
    .ports .out {
      background: #eff6ff;
      color: #1d4ed8;
    }
    .parameter {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px;
      gap: 8px;
      align-items: center;
      font-size: 12px;
      margin: 8px 0;
    }
    .parameter input[type='checkbox'] {
      width: auto;
      justify-self: start;
    }
    .output-ports {
      display: grid;
      gap: 6px;
      margin: 12px 0;
      color: #475467;
      font-size: 12px;
    }
    .output-ports b {
      font-size: 12px;
    }
    .output-ports label {
      display: flex;
      gap: 7px;
      align-items: center;
    }
    .output-ports input {
      width: auto;
    }
    .inspector button {
      width: 100%;
      margin-top: 12px;
    }
    .inspector hr {
      border: 0;
      border-top: 1px solid #eaecf0;
      margin: 19px 0;
    }
    .empty {
      display: grid;
      place-items: center;
      color: #98a2b3;
      font-size: 13px;
    }
    .static {
      min-height: 120px;
    }
    .help {
      font-size: 11px;
    }
    .binding {
      border: 1px solid #eaecf0;
      padding: 10px;
      border-radius: 9px;
      margin: 8px 0;
    }
    .binding > b {
      display: block;
      font-size: 12px;
      margin-bottom: 8px;
      overflow-wrap: anywhere;
    }
    .binding app-data-asset-picker {
      display: block;
    }
    .binding-panel[hidden] {
      display: none !important;
    }
    .selected-node-indicator {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 3px 8px;
      padding: 10px 11px;
      margin: 12px 0 7px;
      border: 1px solid #bfdbfe;
      border-radius: 9px;
      background: #eff6ff;
      min-width: 0;
    }
    .selected-node-indicator span {
      grid-column: 1/-1;
      color: #2563eb;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .selected-node-indicator strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }
    .selected-node-indicator em {
      grid-column: 1;
      color: #475467;
      font-size: 11px;
      font-style: normal;
      overflow-wrap: anywhere;
    }
    .selected-node-indicator code {
      grid-column: 2;
      grid-row: 2/4;
      align-self: center;
      color: #667085;
      font-size: 10px;
    }
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: 220px minmax(0, 1fr);
      }
      .inspector {
        grid-column: 1/-1;
      }
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
    }
    @media (max-width: 700px) {
      .layout {
        display: flex;
        flex-direction: column;
      }
      .canvas-panel {
        min-height: 500px;
      }
      .rete-host {
        height: 460px;
      }
      .layout .catalog {
        max-height: 360px;
        overflow: hidden;
      }
    }
    /* Workspace mode: docks float above a full-height Rete canvas. */
    .page-header {
      margin: 16px 18px 10px;
      align-items: center;
    }
    .layout {
      position: relative;
      display: block;
      height: calc(100dvh - 178px);
      min-height: 560px;
    }
    .canvas-panel {
      position: absolute;
      inset: 0;
      height: 100%;
      min-height: 0;
      border-radius: 0;
    }
    .canvas-panel .toolbar {
      min-height: 46px;
      box-sizing: border-box;
    }
    .rete-host {
      height: calc(100% - 48px);
      min-height: 0;
    }
    .catalog,
    .inspector {
      position: absolute;
      z-index: 20;
      top: 14px;
      max-height: calc(100% - 28px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 34px #10182824;
    }
    .catalog {
      left: 14px;
      width: 250px;
      box-sizing: border-box;
    }
    .dock-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
    .dock > .heading {
      flex: 0 0 auto;
    }
    .catalog.collapsed {
      width: 42px;
      height: 42px;
      padding: 7px;
      overflow: hidden;
    }
    .inspector {
      right: 14px;
      width: 330px;
      box-sizing: border-box;
    }
    .inspector.collapsed {
      width: 42px;
      height: 42px;
      padding: 7px;
      overflow: hidden;
    }
    .dock.collapsed .dock-scroll {
      display: none;
    }
    .inspector:not(.collapsed) .dock-toggle {
      position: absolute;
      top: 10px;
      left: 10px;
    }
    .inspector:not(.collapsed) .heading {
      padding-left: 32px;
    }
    .dock-toggle {
      width: 28px;
      height: 28px;
      border: 1px solid #d0d5dd;
      border-radius: 7px;
      background: #fff;
      color: #175cd3;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
    }
    .catalog:not(.collapsed) .dock-toggle {
      position: absolute;
      top: 10px;
      right: 10px;
    }
    .catalog:not(.collapsed) .heading {
      padding-right: 30px;
    }
    .catalog-groups {
      display: grid;
      gap: 8px;
    }
    .catalog-group {
      border-top: 1px solid #f2f4f7;
      padding-top: 6px;
    }
    .catalog-items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 6px;
    }
    .group-header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      border: 0;
      background: transparent;
      color: #344054;
      padding: 5px 2px;
      cursor: pointer;
      text-align: left;
    }
    .group-header span:first-child {
      display: flex;
      gap: 7px;
      align-items: center;
    }
    .group-header small {
      color: #98a2b3;
      font-size: 10px;
    }
    .catalog-item {
      grid-template-columns: 9px minmax(0, 1fr);
      min-width: 0;
      margin: 0;
    }
    .catalog-item b {
      font-size: 11px;
    }
    .inspector {
      transition:
        transform 0.2s ease,
        opacity 0.2s ease;
    }
    .dock-drag-handle {
      cursor: move;
      user-select: none;
      touch-action: none;
    }
    .dock-resize-handle {
      position: absolute;
      right: 4px;
      bottom: 4px;
      width: 15px;
      height: 15px;
      border-right: 2px solid #98a2b3;
      border-bottom: 2px solid #98a2b3;
      border-radius: 0 0 5px 0;
      cursor: nwse-resize;
      opacity: 0.75;
      touch-action: none;
      z-index: 5;
    }
    .dock-resize-handle:hover {
      border-color: #2563eb;
      opacity: 1;
    }
    .dock.collapsed .dock-resize-handle {
      display: none;
    }
    .inspector-toggle {
      position: static !important;
      flex: 0 0 auto;
      margin: 0 !important;
    }
    .inspector .heading {
      border-bottom: 1px solid #f2f4f7;
      padding-bottom: 8px;
    }
    .selected-node-indicator {
      display: none;
    }
    :host ::ng-deep [data-testid='node'].selected {
      outline: 3px solid #f79009;
      outline-offset: 3px;
      border-radius: 10px;
      box-shadow:
        0 0 0 6px #f7900926,
        0 8px 20px #f7900940;
    }
    .actions {
      justify-content: flex-end;
    }
    .canvas-tools {
      z-index: 30;
    }
    @media (max-width: 1050px) {
      .catalog {
        width: 220px;
      }
      .inspector {
        width: 300px;
      }
    }
    @media (max-width: 760px) {
      .page-header {
        margin: 10px 12px 8px;
      }
      .page-header .lead {
        display: none;
      }
      .layout {
        height: calc(100dvh - 125px);
        min-height: 520px;
      }
      .catalog,
      .inspector {
        top: 10px;
        max-height: calc(100% - 20px);
      }
      .catalog {
        left: 10px;
        width: min(78vw, 280px) !important;
      }
      .inspector {
        right: 10px;
        width: min(86vw, 330px) !important;
      }
      .canvas-tools {
        left: 10px;
        bottom: 10px;
      }
      .actions button {
        min-width: 0;
      }
    }
  `,
})
export class WorkflowEditorPage implements AfterViewInit, OnDestroy {
  readonly operatorNames = inject(OperatorNameService);
  @ViewChild('editorHost') editorHost?: ElementRef<HTMLDivElement>;
  private readonly api = inject(ApiClient);
  private readonly notice = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly workflowCache = inject(WorkflowCacheService);
  readonly definitions = signal<Definition[]>([]);
  readonly nodes = signal<EditorNode[]>([]);
  readonly graphLoaded = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly workflowId = signal<number | null>(null);
  readonly workflowName = signal('工作流编辑器');
  readonly publishedVersionId = signal<number | null>(null);
  readonly draftRevision = signal(1);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly messageType = signal<'info' | 'error'>('info');
  readonly autosaveState = signal<'saved' | 'dirty' | 'saving' | 'offline' | 'conflict'>('saved');
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (
      this.autosaveState() === 'dirty' ||
      this.autosaveState() === 'saving' ||
      this.autosaveState() === 'conflict'
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  readonly history = signal<Graph[]>([]);
  readonly historyIndex = signal(-1);
  search = '';
  readonly catalogCollapsed = signal(false);
  readonly inspectorCollapsed = signal(false);
  readonly catalogDock = signal<DockLayout>({
    left: 14,
    right: null,
    top: 14,
    width: 250,
    height: null,
  });
  readonly inspectorDock = signal<DockLayout>({
    left: null,
    right: 14,
    top: 14,
    width: 330,
    height: null,
  });
  private activeDockGesture?: DockGesture;
  private readonly onDockPointerMove = (event: PointerEvent) => this.updateDockGesture(event);
  private readonly onDockPointerUp = () => this.endDockGesture();
  private readonly onWindowResize = () => this.keepDocksInViewport();
  private readonly categoryState = new Set<string>([
    'data_source',
    'transform',
    'algorithm',
    'control',
    'output',
    'composite',
  ]);
  private readonly categoryLabels: Record<string, string> = {
    data_source: '数据源',
    transform: '数据转换',
    algorithm: '算法',
    control: '控制',
    output: '输出',
    composite: '复合算子',
  };
  readonly groupedDefinitions = computed(() => {
    const term = this.search.trim().toLowerCase();
    const groups = new Map<string, Definition[]>();
    for (const item of this.definitions()) {
      if (term && !this.operatorNames.matches(item.node_code, item.node_name, term)) continue;
      const items = groups.get(item.category) || [];
      items.push(item);
      groups.set(item.category, items);
    }
    return ['data_source', 'transform', 'algorithm', 'control', 'output', 'composite']
      .filter((category) => groups.has(category))
      .map((category) => ({
        category,
        label: this.categoryLabels[category],
        items: groups.get(category) || [],
      }));
  });
  edges: Edge[] = [];
  graphOutputs: Array<{ node_id: string; port: string }> = [];
  bindings = new Map<string, StoredBinding>();
  private readonly bindingSelections = new Map<string, DataAssetSelection>();
  private readonly bindingRevision = signal(0);
  private readonly invalidParameterNodes = signal(new Set<string>());
  readonly parametersValid = computed(() => this.invalidParameterNodes().size === 0);
  private reteEditor: any;
  private reteArea: any;
  private reteSelection: any;
  private reteSelectableNodes: any;
  private resizeObserver?: ResizeObserver;
  private reteNodes = new Map<string, any>();
  private definitionByCode = new Map<string, Definition>();
  private hydratingRete = false;
  private suppressReteSync = false;
  private subscriptions: Subscription[] = [];
  readonly filteredDefinitions = computed(() => {
    const term = this.search.trim().toLowerCase();
    return this.definitions().filter(
      (item) => !term || this.operatorNames.matches(item.node_code, item.node_name, term),
    );
  });
  readonly selectedNode = computed(
    () => this.nodes().find((item) => item.id === this.selectedId()) ?? null,
  );
  readonly selectedDataBinding = computed(() => {
    this.bindingRevision();
    const node = this.selectedNode();
    if (!node || !['dataset_channel_v1', 'dataset_asset_v1'].includes(node.node_code)) return null;
    return {
      id: node.id,
      label: this.operatorNames.displayName(node.node_code, node.definition?.node_name),
      selection: this.bindingSelections.get(node.id) ?? null,
      wholeAsset: node.node_code === 'dataset_asset_v1',
    };
  });
  readonly bindingNodes = computed(() =>
    this.nodes()
      .filter((node) => ['dataset_channel_v1', 'dataset_asset_v1'].includes(node.node_code))
      .map((node) => ({
        id: node.id,
        label: this.operatorNames.displayName(node.node_code, node.definition?.node_name),
      })),
  );
  readonly bindingsReady = computed(() => {
    this.bindingRevision();
    return this.bindingNodes().every((node) => Boolean(this.bindings.get(node.id)));
  });

  private readonly dockStorageKey = 'smart-water.workflow-editor.docks';

  private layoutElement(): HTMLElement | null {
    return this.editorHost?.nativeElement.closest('.layout') as HTMLElement | null;
  }

  private dockState(kind: DockKind): DockLayout {
    return kind === 'catalog' ? this.catalogDock() : this.inspectorDock();
  }

  private setDockState(kind: DockKind, state: DockLayout): void {
    if (kind === 'catalog') this.catalogDock.set(state);
    else this.inspectorDock.set(state);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  toggleDock(kind: DockKind): void {
    if (kind === 'catalog') this.catalogCollapsed.update((value) => !value);
    else this.inspectorCollapsed.update((value) => !value);
    queueMicrotask(() => {
      this.keepDocksInViewport();
      this.saveDockPreferences();
    });
  }

  private keepDocksInViewport(): void {
    const layout = this.layoutElement();
    if (!layout) return;
    const layoutRect = layout.getBoundingClientRect();
    if (layoutRect.width <= 0 || layoutRect.height <= 0) return;

    for (const kind of ['catalog', 'inspector'] as const) {
      const state = this.dockState(kind);
      const collapsed = kind === 'catalog' ? this.catalogCollapsed() : this.inspectorCollapsed();
      const dock = layout.querySelector<HTMLElement>(`.${kind}`);
      const minimumWidth = kind === 'catalog' ? 220 : 260;
      const maximumWidth = Math.max(42, layoutRect.width - 20);
      const width = collapsed
        ? state.width
        : this.clamp(state.width, Math.min(minimumWidth, maximumWidth), maximumWidth);
      const renderedWidth = collapsed
        ? 42
        : Math.min(dock?.getBoundingClientRect().width || width, width);
      const renderedHeight = collapsed
        ? 42
        : Math.min(
            dock?.getBoundingClientRect().height || state.height || layoutRect.height - 20,
            layoutRect.height - 20,
          );
      const currentLeft = state.left ?? layoutRect.width - (state.right ?? 10) - renderedWidth;
      const left = this.clamp(currentLeft, 0, Math.max(0, layoutRect.width - renderedWidth));
      const top = this.clamp(state.top, 0, Math.max(0, layoutRect.height - renderedHeight));
      const height = state.height === null ? null : Math.min(state.height, layoutRect.height - top);
      const next: DockLayout = { ...state, left, right: null, top, width, height };
      if (
        next.left !== state.left ||
        next.right !== state.right ||
        next.top !== state.top ||
        next.width !== state.width ||
        next.height !== state.height
      ) {
        this.setDockState(kind, next);
      }
    }
  }

  startDockDrag(event: PointerEvent, kind: DockKind): void {
    if (event.button !== 0) return;
    const layout = this.layoutElement();
    const dock = (event.currentTarget as HTMLElement | null)?.closest('.dock');
    if (!layout || !dock) return;
    const layoutRect = layout.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    this.activeDockGesture = {
      kind,
      mode: 'drag',
      startX: event.clientX,
      startY: event.clientY,
      left: dockRect.left - layoutRect.left,
      top: dockRect.top - layoutRect.top,
      width: dockRect.width,
      height: dockRect.height,
      layoutWidth: layoutRect.width,
      layoutHeight: layoutRect.height,
    };
    event.preventDefault();
    window.addEventListener('pointermove', this.onDockPointerMove);
    window.addEventListener('pointerup', this.onDockPointerUp, { once: true });
  }

  startDockResize(event: PointerEvent, kind: DockKind): void {
    if (event.button !== 0) return;
    const layout = this.layoutElement();
    const dock = (event.currentTarget as HTMLElement | null)?.closest('.dock');
    if (!layout || !dock) return;
    const layoutRect = layout.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    this.activeDockGesture = {
      kind,
      mode: 'resize',
      startX: event.clientX,
      startY: event.clientY,
      left: dockRect.left - layoutRect.left,
      top: dockRect.top - layoutRect.top,
      width: dockRect.width,
      height: dockRect.height,
      layoutWidth: layoutRect.width,
      layoutHeight: layoutRect.height,
    };
    event.preventDefault();
    event.stopPropagation();
    window.addEventListener('pointermove', this.onDockPointerMove);
    window.addEventListener('pointerup', this.onDockPointerUp, { once: true });
  }

  private updateDockGesture(event: PointerEvent): void {
    const gesture = this.activeDockGesture;
    if (!gesture) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const current = this.dockState(gesture.kind);
    if (gesture.mode === 'drag') {
      const left = this.clamp(
        gesture.left + dx,
        0,
        Math.max(0, gesture.layoutWidth - gesture.width),
      );
      const top = this.clamp(
        gesture.top + dy,
        0,
        Math.max(0, gesture.layoutHeight - gesture.height),
      );
      this.setDockState(gesture.kind, { ...current, left, right: null, top });
      return;
    }
    const minWidth = gesture.kind === 'catalog' ? 220 : 260;
    const width = this.clamp(
      gesture.width + dx,
      minWidth,
      Math.min(640, gesture.layoutWidth - gesture.left - 10),
    );
    const height = this.clamp(
      gesture.height + dy,
      220,
      Math.max(220, gesture.layoutHeight - gesture.top - 10),
    );
    this.setDockState(gesture.kind, { ...current, width, height });
  }

  private endDockGesture(): void {
    if (!this.activeDockGesture) return;
    this.activeDockGesture = undefined;
    this.keepDocksInViewport();
    this.saveDockPreferences();
  }

  private saveDockPreferences(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        this.dockStorageKey,
        JSON.stringify({
          catalog: this.catalogDock(),
          inspector: this.inspectorDock(),
          catalogCollapsed: this.catalogCollapsed(),
          inspectorCollapsed: this.inspectorCollapsed(),
        }),
      );
    } catch {
      // Layout preferences are optional and must never block editing.
    }
  }

  private restoreDockPreferences(): void {
    try {
      const raw = window.localStorage.getItem(this.dockStorageKey);
      if (!raw) return;
      const value = JSON.parse(raw) as Record<string, unknown>;
      const valid = (item: unknown): item is DockLayout => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Record<string, unknown>;
        return (
          (candidate['left'] === null || typeof candidate['left'] === 'number') &&
          (candidate['right'] === null || typeof candidate['right'] === 'number') &&
          typeof candidate['top'] === 'number' &&
          typeof candidate['width'] === 'number' &&
          (candidate['height'] === null || typeof candidate['height'] === 'number')
        );
      };
      if (valid(value['catalog'])) this.catalogDock.set(value['catalog']);
      if (valid(value['inspector'])) this.inspectorDock.set(value['inspector']);
      if (typeof value['catalogCollapsed'] === 'boolean')
        this.catalogCollapsed.set(value['catalogCollapsed']);
      if (typeof value['inspectorCollapsed'] === 'boolean')
        this.inspectorCollapsed.set(value['inspectorCollapsed']);
    } catch {
      // Ignore malformed browser preferences and use the defaults.
    }
  }

  isCategoryOpen(category: string): boolean {
    return Boolean(this.search.trim()) || this.categoryState.has(category);
  }

  toggleCategory(category: string): void {
    if (this.categoryState.has(category)) this.categoryState.delete(category);
    else this.categoryState.add(category);
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnload);
      window.addEventListener('resize', this.onWindowResize);
      this.restoreDockPreferences();
    }
    this.api
      .get<{ items: OperatorSummary[] }>('/api/v1/operators', { page: 1, page_size: 100 })
      .subscribe({
        next: ({ items }) => {
          const catalog = (items || [])
            .filter(
              (item) =>
                item.status === 'active' && item.available && item.active_version?.available,
            )
            .map((item) => this.operatorDefinition(item))
            .filter((item): item is Definition => item !== null);
          this.definitions.set(catalog);
          this.definitionByCode = new Map(catalog.map((item) => [item.node_code, item]));
          const workflowId = this.route?.snapshot.paramMap.get('workflowId');
          if (!workflowId) {
            this.showError('工作流草稿不存在，请先从工作流入口创建草稿。');
            return;
          }
          this.workflowId.set(Number(workflowId));
          this.api.get<Record<string, unknown>>('/api/v1/workflows/' + workflowId).subscribe({
            next: (workflow) => {
              this.workflowName.set(String(workflow['workflow_name'] || '工作流编辑器'));
              this.draftRevision.set(Number(workflow['draft_revision'] || 1));
              const baseVersionId = Number(workflow['draft_base_version_id']);
              this.publishedVersionId.set(Number.isInteger(baseVersionId) ? baseVersionId : null);
              this.loadGraph(workflow['draft_graph'] as Graph);
              this.restoreLatestPublishedVersion(Number(workflowId));
              this.checkRecovery(workflow);
            },
            error: () => this.showError('工作流草稿加载失败，可能已被删除或你没有访问权限。'),
          });
        },
        error: () => this.showError('算子目录加载失败，请检查工作流权限。'),
      });
  }

  private restoreLatestPublishedVersion(workflowId: number): void {
    this.api
      .get<Array<{ id: number; version: number; status: string }>>(
        `/api/v1/workflows/${workflowId}/versions`,
      )
      .subscribe({
        next: (versions) => {
          const latest = (versions || [])
            .filter((version) => version.status === 'published' || version.status === 'validated')
            .sort((left, right) => right.version - left.version)[0];
          this.publishedVersionId.set(latest?.id ?? null);
        },
        error: () => this.publishedVersionId.set(null),
      });
  }
  private operatorDefinition(item: OperatorSummary): Definition | null {
    const version = item.active_version;
    if (!version) return null;
    return {
      node_code: item.code,
      version: version.version,
      node_name: item.name,
      description: item.description,
      category: item.category,
      runtime_type: version.runtime_type,
      input_ports: version.input_ports as unknown as Port[],
      output_ports: version.output_ports as unknown as Port[],
      parameter_schema: version.parameter_schema as Definition['parameter_schema'],
      ui_schema: version.ui_schema as Definition['ui_schema'],
    };
  }
  ngAfterViewInit(): void {
    this.observeResize();
    if (this.nodes().length) void this.initializeRete();
    queueMicrotask(() => this.keepDocksInViewport());
  }

  attachEditorHost(element: HTMLDivElement): void {
    if (this.editorHost?.nativeElement === element && this.reteEditor) return;
    this.editorHost = new ElementRef(element);
    this.observeResize();
    void this.rebuildRete();
  }

  detachEditorHost(element: HTMLDivElement): void {
    if (this.editorHost?.nativeElement !== element) return;
    this.resizeObserver?.disconnect();
    this.editorHost = undefined;
  }

  ngOnDestroy(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnload);
      window.removeEventListener('resize', this.onWindowResize);
      window.removeEventListener('pointermove', this.onDockPointerMove);
      window.removeEventListener('pointerup', this.onDockPointerUp);
    }
    this.subscriptions.forEach((item) => item.unsubscribe());
    this.resizeObserver?.disconnect();
    this.reteArea?.destroy();
    this.reteEditor = undefined;
    this.reteArea = undefined;
  }
  loadGraph(graph: Graph): void {
    this.graphOutputs = [...(graph.outputs || [])];
    this.bindings.clear();
    this.bindingSelections.clear();
    for (const [nodeId, binding] of Object.entries(graph.bindings || {})) {
      if (!binding || !Number.isInteger(Number(binding.dataset_version_id))) continue;
      this.bindings.set(nodeId, { ...binding });
      this.bindingSelections.set(nodeId, this.selectionHint(binding));
    }
    this.bindingRevision.update((value) => value + 1);
    const loadedNodes = (graph.nodes || []).map((raw, index) => {
      const ui = (raw['ui'] || {}) as Record<string, unknown>;
      const position = (ui['position'] || {}) as Record<string, unknown>;
      return {
        id: String(raw['id']),
        node_code: String(raw['node_code']),
        node_version: String(raw['node_version']),
        parameters: (raw['parameters'] as Record<string, unknown>) || {},
        x: Number(position['x'] ?? 34 + (index % 2) * 285),
        y: Number(position['y'] ?? 30 + Math.floor(index / 2) * 145),
        collapsed: Boolean(ui['collapsed'] ?? false),
        definition: this.definitionByCode.get(String(raw['node_code'])),
      };
    });
    this.nodes.set(loadedNodes);
    const originalEdgeCount = (graph.edges || []).length;
    this.edges = this.sanitizeEdges(loadedNodes, graph.edges || []);
    this.graphOutputs = this.graphOutputs.filter((output) => {
      const node = loadedNodes.find((item) => item.id === output.node_id);
      return Boolean(node?.definition?.output_ports.some((port) => port.key === output.port));
    });
    if (this.edges.length !== originalEdgeCount) {
      this.messageType.set('info');
      this.message.set(`已清理 ${originalEdgeCount - this.edges.length} 条无效连接。`);
    }
    this.selectedId.set(this.nodes()[0]?.id ?? null);
    this.graphLoaded.set(true);
    this.pushHistory(this.graph());
    if (this.edges.length !== originalEdgeCount) this.markDirty();
    if (this.editorHost) void this.rebuildRete();
  }

  private sanitizeEdges(nodes: EditorNode[], edges: Edge[]): Edge[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const seen = new Set<string>();
    const valid: Edge[] = [];
    for (const edge of edges) {
      const source = byId.get(edge.source?.node_id);
      const target = byId.get(edge.target?.node_id);
      const sourcePort = source?.definition?.output_ports.find(
        (port) => port.key === edge.source?.port,
      );
      const targetPort = target?.definition?.input_ports.find(
        (port) => port.key === edge.target?.port,
      );
      if (!source || !target || !sourcePort || !targetPort || source.id === target.id) continue;
      const key = `${source.id}:${sourcePort.key}->${target.id}:${targetPort.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push({
        source: { node_id: source.id, port: sourcePort.key },
        target: { node_id: target.id, port: targetPort.key },
      });
    }
    return valid;
  }

  refreshEditorViewport(): void {
    this.reteArea?.area?.update?.();
  }
  private async rebuildRete(): Promise<void> {
    this.reteArea?.destroy();
    this.reteEditor = undefined;
    this.reteArea = undefined;
    this.reteNodes.clear();
    await this.initializeRete();
  }
  private async initializeRete(): Promise<void> {
    if (!this.editorHost || this.reteEditor) return;
    const host = this.editorHost.nativeElement;
    host.replaceChildren();
    this.reteEditor = new NodeEditor();
    this.reteArea = new AreaPlugin(host);
    this.reteSelection = AreaExtensions.selector();
    this.reteSelectableNodes = AreaExtensions.selectableNodes(this.reteArea, this.reteSelection, {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });
    this.installReteSync();
    const connection = new ConnectionPlugin();
    connection.addPreset(ConnectionPresets.classic.setup());
    const render = new AngularPlugin({ injector: this.injector });
    render.addPreset(AngularPresets.classic.setup() as any);
    // Register the area with the editor before attaching child plugins.
    // The renderer and connection plugin resolve their parent scope during registration.
    // Attaching them first leaves the area without a parent and prevents node views from mounting.
    this.reteEditor.use(this.reteArea);
    this.reteArea.use(render as any);
    this.reteArea.use(connection);
    this.hydratingRete = true;
    try {
      for (const item of this.nodes()) await this.addReteNode(item);
      const loadedEdges: Edge[] = [];
      for (const edge of this.edges) {
        if (await this.addReteConnection(edge)) loadedEdges.push(edge);
      }
      this.edges = loadedEdges;
      await AreaExtensions.zoomAt(this.reteArea, this.reteEditor.getNodes());
    } finally {
      this.hydratingRete = false;
    }
  }
  private observeResize(): void {
    const host = this.editorHost?.nativeElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const layout = this.layoutElement();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.reteArea?.area?.update?.();
      this.keepDocksInViewport();
    });
    this.resizeObserver.observe(host);
    if (layout) this.resizeObserver.observe(layout);
  }

  private installReteSync(): void {
    this.reteEditor.addPipe((context: any) => {
      if (context.type === 'connectioncreate') {
        const connection = context.data;
        const source = this.backendIdForRete(connection.source);
        const target = this.backendIdForRete(connection.target);
        if (!source || !target || source === target || this.wouldCreateCycle(source, target))
          return;
      }
      if (
        !this.hydratingRete &&
        !this.suppressReteSync &&
        (context.type === 'connectioncreated' || context.type === 'connectionremoved')
      ) {
        this.syncEdgesFromRete();
      }
      return context;
    });
    this.reteArea.addPipe((context: any) => {
      if (context.type === 'nodepicked') {
        const id = this.backendIdForRete(context.data.id);
        if (id) this.selectedId.set(id);
      }
      if (
        !this.hydratingRete &&
        (context.type === 'nodetranslated' || context.type === 'nodetranslate')
      ) {
        const id = this.backendIdForRete(context.data.id);
        if (id && context.data.position) {
          const x = Number(context.data.position.x);
          const y = Number(context.data.position.y);
          let changed = false;
          this.nodes.update((items) =>
            items.map((item) => {
              if (item.id !== id) return item;
              if (item.x === x && item.y === y) return item;
              changed = true;
              return { ...item, x, y };
            }),
          );
          if (changed) this.markDirty();
        }
      }
      return context;
    });
  }
  private wouldCreateCycle(source: string, target: string): boolean {
    const adjacency = new Map<string, string[]>();
    for (const edge of this.edges) {
      const next = adjacency.get(edge.source.node_id) || [];
      next.push(edge.target.node_id);
      adjacency.set(edge.source.node_id, next);
    }
    const pending = [target];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop() as string;
      if (current === source) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(adjacency.get(current) || []));
    }
    return false;
  }
  private backendIdForRete(reteId: string): string | null {
    for (const [backendId, node] of this.reteNodes.entries())
      if (node.id === reteId) return backendId;
    return null;
  }
  private syncEdgesFromRete(): void {
    if (!this.reteEditor) return;
    const nextEdges = this.reteEditor.getConnections().map((connection: any) => ({
      source: {
        node_id: this.backendIdForRete(connection.source) || connection.source,
        port: String(connection.sourceOutput),
      },
      target: {
        node_id: this.backendIdForRete(connection.target) || connection.target,
        port: String(connection.targetInput),
      },
    }));
    this.edges = this.sanitizeEdges(this.nodes(), nextEdges);
    this.pushHistory(this.graph());
    this.markDirty();
  }
  private async addReteNode(item: EditorNode): Promise<void> {
    const def = item.definition;
    if (!def) return;
    const node = new ClassicPreset.Node(
      this.operatorNames.displayName(def.node_code, def.node_name),
    ) as any;
    this.reteNodes.set(item.id, node);
    const sockets = new Map<string, ClassicPreset.Socket>();
    const socket = (port: Port) => {
      const key = `${port.data_type}:${port.semantic_type || ''}:${port.unit || ''}`;
      let current = sockets.get(key);
      if (!current) {
        current = new ClassicPreset.Socket(key);
        sockets.set(key, current);
      }
      return current;
    };
    for (const port of def.input_ports || [])
      node.addInput(
        port.key,
        new ClassicPreset.Input(socket(port), port.label || port.key, port.cardinality !== 'one'),
      );
    for (const port of def.output_ports || [])
      node.addOutput(
        port.key,
        new ClassicPreset.Output(socket(port), port.label || port.key, true),
      );
    await this.reteEditor.addNode(node);
    await this.reteArea.translate(node.id, { x: item.x, y: item.y });
    (node as any).__backendId = item.id;
    (node as any).__definition = def;
  }
  private async addReteConnection(edge: Edge): Promise<boolean> {
    const source = this.reteNodes.get(edge.source.node_id);
    const target = this.reteNodes.get(edge.target.node_id);
    if (
      !source ||
      !target ||
      !source.outputs?.[edge.source.port] ||
      !target.inputs?.[edge.target.port]
    )
      return false;
    const connection = new ClassicPreset.Connection(
      source,
      edge.source.port,
      target,
      edge.target.port,
    );
    return Boolean(await this.reteEditor.addConnection(connection as any));
  }
  onCatalogDragStart(event: DragEvent, definition: Definition): void {
    event.dataTransfer?.setData('application/x-node-code', definition.node_code);
  }
  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }
  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const code = event.dataTransfer?.getData('application/x-node-code');
    const definition = this.definitionByCode.get(code || '');
    if (definition) this.addNode(definition);
  }
  async addNode(definition: Definition): Promise<void> {
    const items = this.nodes();
    const item: EditorNode = {
      id: crypto.randomUUID(),
      node_code: definition.node_code,
      node_version: definition.version,
      parameters: this.defaultParameters(definition),
      x: 40 + (items.length % 3) * 260,
      y: 45 + Math.floor(items.length / 3) * 145,
      collapsed: false,
      definition,
    };
    this.nodes.set([...items, item]);
    this.selectedId.set(item.id);
    if (this.reteEditor) {
      await this.addReteNode(item);
      const rete = this.reteNodes.get(item.id);
      if (rete && this.reteSelectableNodes) {
        await this.reteSelectableNodes.select(rete.id, false);
      }
    }
    this.pushHistory(this.graph());
    this.markDirty();
  }
  select(id: string): void {
    this.selectedId.set(id);
  }
  async removeNode(id: string): Promise<void> {
    if (!confirm('移除该节点并删除其连接？')) return;
    this.nodes.update((items) => items.filter((item) => item.id !== id));
    this.edges = this.edges.filter(
      (edge) => edge.source.node_id !== id && edge.target.node_id !== id,
    );
    this.graphOutputs = this.graphOutputs.filter((output) => output['node_id'] !== id);
    this.bindings.delete(id);
    this.bindingSelections.delete(id);
    const rete = this.reteNodes.get(id);
    this.suppressReteSync = true;
    try {
      const connections = this.reteEditor?.getConnections?.() || [];
      for (const connection of connections) {
        const sourceId = this.backendIdForRete(connection.source);
        const targetId = this.backendIdForRete(connection.target);
        if (sourceId === id || targetId === id)
          await this.reteEditor?.removeConnection?.(connection.id);
      }
      if (rete) await this.reteEditor?.removeNode(rete.id);
    } finally {
      this.suppressReteSync = false;
    }
    this.reteNodes.delete(id);
    this.selectedId.set(null);
    this.pushHistory(this.graph());
    this.markDirty();
  }
  parameterEntries(node: EditorNode): Array<{ key: string; value: unknown }> {
    return Object.entries(node.parameters).map(([key, value]) => ({ key, value }));
  }
  parameterSchema(node: EditorNode, key: string): Record<string, any> {
    return (node.definition?.parameter_schema?.properties?.[key] || {}) as Record<string, any>;
  }
  defaultParameters(definition: Definition): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(definition.parameter_schema?.properties || {}).map(([key, schema]) => [
        key,
        schema['default'],
      ]),
    );
  }
  coerceNumber(value: unknown, integer: boolean): number {
    const number = Number(value);
    return integer ? Math.trunc(number) : number;
  }
  setParameter(id: string, key: string, value: unknown): void {
    this.nodes.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, parameters: { ...item.parameters, [key]: value } } : item,
      ),
    );
    const node = this.reteNodes.get(id);
    if (node) node.data = this.nodes().find((item) => item.id === id)?.parameters;
    this.markDirty();
  }
  setParameters(id: string, parameters: Record<string, unknown>): void {
    const current = this.nodes().find((item) => item.id === id)?.parameters;
    if (current && JSON.stringify(current) === JSON.stringify(parameters)) return;
    this.nodes.update((items) =>
      items.map((item) => (item.id === id ? { ...item, parameters: { ...parameters } } : item)),
    );
    const node = this.reteNodes.get(id);
    if (node) node.data = parameters;
    this.pushHistory(this.graph());
    this.markDirty();
  }
  setParameterValidity(id: string, valid: boolean): void {
    const next = new Set(this.invalidParameterNodes());
    if (valid) next.delete(id);
    else next.add(id);
    this.invalidParameterNodes.set(next);
  }
  isOutputPort(nodeId: string, port: string): boolean {
    return this.graphOutputs.some((output) => output['node_id'] === nodeId && output.port === port);
  }
  toggleOutputPort(nodeId: string, port: string): void {
    const exists = this.isOutputPort(nodeId, port);
    this.graphOutputs = exists
      ? this.graphOutputs.filter(
          (output) => !(output['node_id'] === nodeId && output.port === port),
        )
      : [...this.graphOutputs, { node_id: nodeId, port }];
    this.pushHistory(this.graph());
    this.markDirty();
  }
  graph(): Graph {
    const nodes = this.nodes();
    return {
      contract_version: '1.0',
      nodes: nodes.map(({ id, node_code, node_version, parameters, x, y, collapsed }) => ({
        id,
        node_code,
        node_version,
        parameters,
        ui: { position: { x, y }, collapsed },
      })),
      edges: this.sanitizeEdges(nodes, this.edges),
      outputs: this.graphOutputs.filter((output) => {
        const node = nodes.find((item) => item.id === output.node_id);
        return Boolean(node?.definition?.output_ports.some((port) => port.key === output.port));
      }),
      bindings: Object.fromEntries(this.bindings.entries()),
    };
  }
  private pushHistory(graph: Graph): void {
    const snapshot = JSON.parse(JSON.stringify(graph)) as Graph;
    const current = this.history();
    const next = current.slice(0, this.historyIndex() + 1);
    next.push(snapshot);
    this.history.set(next.slice(-50));
    this.historyIndex.set(Math.min(next.length - 1, 49));
  }
  undo(): void {
    const index = this.historyIndex();
    if (index <= 0) return;
    this.historyIndex.set(index - 1);
    this.loadGraph(JSON.parse(JSON.stringify(this.history()[index - 1])));
    this.markDirty();
  }
  redo(): void {
    const index = this.historyIndex();
    if (index >= this.history().length - 1) return;
    this.historyIndex.set(index + 1);
    this.loadGraph(JSON.parse(JSON.stringify(this.history()[index + 1])));
    this.markDirty();
  }
  async fitView(): Promise<void> {
    if (this.reteArea && this.reteEditor)
      await AreaExtensions.zoomAt(this.reteArea, this.reteEditor.getNodes());
  }
  shortNodeId(nodeId: string): string {
    return nodeId.length > 8 ? nodeId.slice(0, 8) : nodeId;
  }
  setBinding(nodeId: string, selection: DataAssetSelection | null): void {
    const previous = this.bindings.get(nodeId) as StoredBinding | undefined;
    const wholeAsset =
      this.nodes().find((node) => node.id === nodeId)?.node_code === 'dataset_asset_v1';
    if (!selection || (!wholeAsset && !selection.channel)) {
      this.bindingSelections.delete(nodeId);
      if (!previous) return;
      this.bindings.delete(nodeId);
      this.bindingRevision.update((value) => value + 1);
      this.markDirty();
      return;
    }
    const binding: StoredBinding = wholeAsset
      ? {
          dataset_asset_id: selection.asset.id,
          dataset_version_id: selection.version.id,
        }
      : {
          dataset_asset_id: selection.asset.id,
          dataset_version_id: selection.version.id,
          monitor_point_id: selection.channel!.monitor_point_id,
          metric_code: selection.channel!.metric_code,
          value_source: selection.value_source,
          start: selection.channel!.time_start,
          end: selection.channel!.time_end,
        };
    this.bindingSelections.set(nodeId, selection);
    if (previous && this.sameBinding(previous, binding)) return;
    this.bindings.set(nodeId, binding);
    this.bindingRevision.update((value) => value + 1);
    this.markDirty();
  }

  private sameBinding(left: StoredBinding, right: StoredBinding): boolean {
    return (
      left.dataset_asset_id === right.dataset_asset_id &&
      left.dataset_version_id === right.dataset_version_id &&
      left.monitor_point_id === right.monitor_point_id &&
      left.metric_code === right.metric_code &&
      left.value_source === right.value_source &&
      left.start === right.start &&
      left.end === right.end
    );
  }

  private selectionHint(binding: StoredBinding): DataAssetSelection {
    return {
      asset: { id: binding.dataset_asset_id },
      version: { id: binding.dataset_version_id },
      channel:
        binding.monitor_point_id && binding.metric_code
          ? {
              monitor_point_id: binding.monitor_point_id,
              metric_code: binding.metric_code,
            }
          : null,
      channels: [],
      value_source: binding.value_source ?? 'processed',
    } as unknown as DataAssetSelection;
  }
  validate(): void {
    if (!this.workflowId()) {
      this.showError('请先保存草稿，再由后端校验图结构。');
      return;
    }
    this.busy.set(true);
    this.api
      .post<{ valid: boolean; errors: string[] }, object>(
        `/api/v1/workflows/${this.workflowId()}/validate`,
        {},
      )
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          result.valid ? this.show('图校验通过。') : this.showError(result.errors.join('；'));
        },
        error: () => {
          this.busy.set(false);
          this.showError('图校验请求失败。');
        },
      });
  }
  save(): void {
    this.busy.set(true);
    const body = {
      workflow_code: `workflow_${Date.now()}`,
      workflow_name: '新建工作流',
      description: '从空白画布开始的工作流',
      visibility: 'private',
      graph: this.graph(),
    };
    const request = this.workflowId()
      ? this.api.put<Record<string, unknown>, object>(
          `/api/v1/workflows/${this.workflowId()}/draft`,
          { graph: this.graph(), expected_revision: this.draftRevision() },
        )
      : this.api.post<Record<string, unknown>, typeof body>('/api/v1/workflows', body);
    request.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.workflowId.set(Number(result['id'] || this.workflowId()));
        this.draftRevision.set(Number(result['draft_revision'] || this.draftRevision()));
        this.autosaveState.set('saved');
        const userId = this.auth.user()?.id;
        const id = this.workflowId();
        if (userId && id) void this.workflowCache.remove(userId, id);
        this.show('草稿已保存。');
      },
      error: (error: any) => {
        this.busy.set(false);
        this.autosaveState.set(
          error?.status === 409 ? 'conflict' : error?.status === 422 ? 'dirty' : 'offline',
        );
        this.showError(this.draftSaveErrorMessage(error));
      },
    });
  }
  publish(): void {
    this.busy.set(true);
    this.api
      .post<{ id: number }, object>(`/api/v1/workflows/${this.workflowId()}/publish`, {})
      .subscribe({
        next: (version) => {
          this.busy.set(false);
          this.publishedVersionId.set(version.id);
          this.show(`已发布版本 #${version.id}。`);
        },
        error: () => {
          this.busy.set(false);
          this.showError('发布失败，请先保存并通过校验。');
        },
      });
  }
  run(): void {
    if (!this.publishedVersionId() || !this.bindingsReady()) return;
    this.busy.set(true);
    const inputBindings = Object.fromEntries(this.bindings.entries());
    this.api
      .post<Record<string, unknown>, object>(
        `/api/v1/workflow-versions/${this.publishedVersionId()}/runs`,
        { input_bindings: inputBindings, parameter_overrides: {} },
      )
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          const runId = String(result['run_id'] || result['id'] || '');
          this.show('工作流已提交。');
          if (runId) void this.router.navigate(['/workflow-runs', runId]);
        },
        error: (error: any) => {
          this.busy.set(false);
          const detail = error?.error?.detail;
          this.showError(
            typeof detail === 'object' && detail?.message
              ? String(detail.message)
              : String(error?.error?.message || detail || '工作流提交失败。'),
          );
        },
      });
  }
  autosaveLabel(): string {
    return {
      saved: '已保存',
      dirty: '有未保存修改',
      saving: '正在保存',
      offline: '离线，已保存到本机',
      conflict: '保存冲突',
    }[this.autosaveState()];
  }

  private markDirty(): void {
    this.autosaveState.set('dirty');
    const userId = this.auth.user()?.id;
    const workflowId = this.workflowId();
    if (userId && workflowId) {
      void this.workflowCache.put({
        key: `${userId}:${workflowId}`,
        userId,
        workflowId,
        graph: this.graph() as unknown as Record<string, unknown>,
        baseRevision: this.draftRevision(),
        updatedAt: Date.now(),
      });
    }
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => this.autosave(), 3000);
  }

  private autosave(): void {
    const workflowId = this.workflowId();
    if (!workflowId) {
      this.autosaveState.set('offline');
      return;
    }
    this.autosaveState.set('saving');
    this.api
      .put<Record<string, unknown>, object>(`/api/v1/workflows/${workflowId}/draft`, {
        graph: this.graph(),
        expected_revision: this.draftRevision(),
      })
      .subscribe({
        next: (result) => {
          this.draftRevision.set(Number(result['draft_revision'] || this.draftRevision()));
          this.autosaveState.set('saved');
          const userId = this.auth.user()?.id;
          if (userId) void this.workflowCache.remove(userId, workflowId);
        },
        error: (error: any) => {
          this.autosaveState.set(
            error?.status === 409 ? 'conflict' : error?.status === 422 ? 'dirty' : 'offline',
          );
        },
      });
  }

  private checkRecovery(workflow: Record<string, unknown>): void {
    const userId = this.auth.user()?.id;
    const workflowId = this.workflowId();
    if (!userId || !workflowId) return;
    void this.workflowCache.get(userId, workflowId).then((draft) => {
      if (!draft || draft.updatedAt <= Date.parse(String(workflow['updated_at'] || 0))) return;
      if (draft.baseRevision !== this.draftRevision()) {
        this.autosaveState.set('conflict');
        this.showError('本机草稿与服务器修订不一致，请复制为新流程后再继续。');
        return;
      }
      if (typeof window !== 'undefined' && window.confirm('发现未同步的本机草稿，是否恢复？')) {
        this.loadGraph(draft.graph as unknown as Graph);
        this.markDirty();
      } else {
        void this.workflowCache.remove(userId, workflowId);
      }
    });
  }

  private draftSaveErrorMessage(error: any): string {
    const detail = error?.error?.detail;
    if (detail?.code === 'WORKFLOW_DRAFT_INVALID' && Array.isArray(detail.errors)) {
      return '草稿包含无效配置：' + detail.errors.join('；');
    }
    return '草稿保存失败，请检查图结构和权限。';
  }

  private show(text: string): void {
    this.messageType.set('info');
    this.message.set(text);
    this.notice.success(text);
  }
  private showError(text: string): void {
    this.messageType.set('error');
    this.message.set(text);
    this.notice.error(text);
  }
}
