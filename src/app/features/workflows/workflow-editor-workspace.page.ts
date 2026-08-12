import { Component, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { provideFormlyCore } from '@ngx-formly/core';
import { withFormlyMaterial } from '@ngx-formly/material';
import {
  DockviewAngularModule,
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  themeDark,
  themeLight,
} from 'dockview-angular';

import { AuthService } from '../../core/services/auth.service';
import {
  FormlyJsonFieldTypeComponent,
  FormlySliderFieldTypeComponent,
} from '../../shared/components/operator-parameter-form.component';
import { WorkflowEditorPage } from './workflow-editor.page';
import {
  NodeInspectorPanelComponent,
  OperatorCatalogPanelComponent,
  RuntimeBindingPanelComponent,
  WorkflowCanvasPanelComponent,
  WorkflowEditorPanelBridge,
} from './workflow-editor-panels';
import {
  WorkspaceLayoutPreference,
  parseWorkspacePreference,
  workspacePreferenceKey,
} from './workflow-workspace-preferences';

type WorkspacePanelId = 'canvas' | 'catalog' | 'inspector' | 'bindings';

@Component({
  selector: 'app-workflow-editor-workspace-page',
  imports: [
    DockviewAngularModule,
    MatButtonModule,
    OperatorCatalogPanelComponent,
    NodeInspectorPanelComponent,
    RuntimeBindingPanelComponent,
    WorkflowCanvasPanelComponent,
  ],
  providers: [
    WorkflowEditorPanelBridge,
    provideFormlyCore([
      ...withFormlyMaterial(),
      {
        types: [
          { name: 'sw-slider', component: FormlySliderFieldTypeComponent },
          { name: 'sw-json', component: FormlyJsonFieldTypeComponent },
        ],
      },
    ]),
  ],
  template: `
    <section class="workspace-page" [class.workspace-dark]="darkWorkspace()">
      <header class="workspace-header">
        <div class="title">
          <span>工作流编排</span>
          <h1>{{ workflowName() }}</h1>
          <small
            >{{ workflowId() ? '草稿 #' + draftRevision() : '未保存草稿' }} ·
            {{ nodes().length }} 个节点 · {{ edges.length }} 条连接</small
          >
        </div>
        <div class="status" [class.conflict]="autosaveState() === 'conflict'">
          {{ autosaveLabel() }}
        </div>
        <div class="actions">
          <button mat-stroked-button (click)="validate()" [disabled]="busy() || !parametersValid()">
            校验图
          </button>
          <button mat-flat-button (click)="save()" [disabled]="busy()">保存草稿</button>
          <button
            mat-flat-button
            (click)="publish()"
            [disabled]="busy() || !workflowId() || !parametersValid()"
          >
            发布版本
          </button>
          <button
            mat-flat-button
            (click)="run()"
            [disabled]="busy() || !publishedVersionId() || !bindingsReady() || !parametersValid()"
          >
            运行已发布版本
          </button>
          <button mat-stroked-button (click)="toggleWorkspaceTheme()">
            {{ darkWorkspace() ? '浅色画布' : '深色画布' }}
          </button>
          <button mat-stroked-button (click)="resetWorkspaceLayout()">重置工作区</button>
        </div>
      </header>

      @if (message()) {
        <div class="message" [class.error]="messageType() === 'error'">{{ message() }}</div>
      }

      <div class="workspace-body" [class.mobile]="mobile()">
        <button
          class="panel-launcher catalog-launcher"
          type="button"
          (click)="openPanel('catalog')"
          aria-label="打开算子目录"
        >
          算子
        </button>
        <button
          class="panel-launcher inspector-launcher"
          type="button"
          (click)="openPanel('inspector')"
          aria-label="打开节点属性"
        >
          属性
        </button>

        @if (!mobile()) {
          <dv-dockview
            class="dockview-host"
            [components]="components"
            [theme]="dockviewTheme()"
            [floatingGroupBounds]="'boundedWithinViewport'"
            [getTabContextMenuItems]="emptyContextMenu"
            (ready)="onDockviewReady($event)"
          />
        } @else {
          <app-workflow-canvas-panel class="mobile-canvas" />
          @if (mobileCatalogOpen()) {
            <aside class="mobile-drawer left">
              <header>
                算子目录<button type="button" (click)="mobileCatalogOpen.set(false)">关闭</button>
              </header>
              <app-operator-catalog-panel />
            </aside>
          }
          @if (mobileInspectorOpen()) {
            <aside class="mobile-drawer right">
              <header>
                节点配置<button type="button" (click)="mobileInspectorOpen.set(false)">关闭</button>
              </header>
              <nav>
                <button
                  type="button"
                  [class.active]="mobileInspectorTab() === 'inspector'"
                  (click)="mobileInspectorTab.set('inspector')"
                >
                  属性</button
                ><button
                  type="button"
                  [class.active]="mobileInspectorTab() === 'bindings'"
                  (click)="mobileInspectorTab.set('bindings')"
                >
                  运行绑定
                </button>
              </nav>
              @if (mobileInspectorTab() === 'inspector') {
                <app-node-inspector-panel />
              } @else {
                <app-runtime-binding-panel />
              }
            </aside>
          }
        }
      </div>
    </section>
  `,
  styles: `
    :host,
    .workspace-page {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .workspace-page {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      background: var(--sw-page-bg);
      color: var(--sw-text-primary);
    }
    .workspace-header {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      align-items: center;
      gap: 14px;
      min-height: 88px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--sw-border);
      background: var(--sw-surface);
    }
    .title span {
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
    }
    .title h1 {
      margin: 2px 0;
      font-size: clamp(20px, 2vw, 27px);
    }
    .title small {
      color: var(--sw-text-muted);
    }
    .status {
      color: var(--sw-color-success);
      font-size: 12px;
      font-weight: 700;
    }
    .status.conflict {
      color: var(--sw-color-danger);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .message {
      margin: 8px 18px 0;
      padding: 9px 12px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
    }
    .message.error {
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    .workspace-body {
      position: relative;
      min-height: 0;
      overflow: hidden;
    }
    .dockview-host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .panel-launcher {
      position: absolute;
      top: 10px;
      z-index: var(--sw-z-launcher);
      width: 44px;
      height: 44px;
      border: 1px solid var(--sw-border-strong);
      border-radius: 12px;
      background: var(--sw-surface-raised);
      color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-sm);
      font-weight: 800;
      cursor: pointer;
    }
    .catalog-launcher {
      left: 10px;
    }
    .inspector-launcher {
      right: 10px;
    }
    .mobile-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .mobile-drawer {
      position: absolute;
      inset-block: 0;
      z-index: calc(var(--sw-z-launcher) - 1);
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      width: min(88vw, 380px);
      overflow: hidden;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-lg);
    }
    .mobile-drawer.left {
      left: 0;
    }
    .mobile-drawer.right {
      right: 0;
    }
    .mobile-drawer > header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 48px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--sw-border);
      font-weight: 800;
    }
    .mobile-drawer > header button,
    .mobile-drawer nav button {
      border: 0;
      background: transparent;
      color: var(--sw-color-primary);
      padding: 8px;
    }
    .mobile-drawer nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid var(--sw-border);
    }
    .mobile-drawer nav button.active {
      background: var(--sw-color-info-soft);
      font-weight: 800;
    }
    :host ::ng-deep .dv-dockview {
      --dv-background-color: var(--sw-canvas-bg);
      --dv-paneview-active-outline-color: var(--sw-focus);
      --dv-tabs-and-actions-container-background-color: var(--sw-surface-muted);
      --dv-activegroup-visiblepanel-tab-background-color: var(--sw-surface);
      --dv-activegroup-hiddenpanel-tab-background-color: var(--sw-surface-muted);
      --dv-inactivegroup-visiblepanel-tab-background-color: var(--sw-surface-muted);
      --dv-tab-divider-color: var(--sw-border);
      --dv-separator-border: var(--sw-border);
      --dv-activegroup-visiblepanel-tab-color: var(--sw-text-primary);
      --dv-inactivegroup-visiblepanel-tab-color: var(--sw-text-secondary);
    }
    @media (max-width: 1100px) {
      .workspace-header {
        grid-template-columns: 1fr auto;
      }
      .status {
        grid-column: 2;
        grid-row: 1;
      }
      .actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }
    }
    @media (max-width: 800px) {
      .workspace-header {
        min-height: 104px;
        padding: 8px 10px;
      }
      .actions {
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 2px;
      }
      .actions button {
        flex: 0 0 auto;
      }
      .panel-launcher {
        top: 8px;
      }
    }
  `,
})
export class WorkflowEditorWorkspacePage extends WorkflowEditorPage implements OnDestroy {
  private readonly bridge = inject(WorkflowEditorPanelBridge);
  private readonly workspaceAuth = inject(AuthService);
  private dockviewApi?: DockviewApi;
  private layoutSubscription?: { dispose(): void };
  private restoringLayout = false;
  readonly darkWorkspace = signal(false);
  readonly mobile = signal(typeof window !== 'undefined' && window.innerWidth < 800);
  readonly mobileCatalogOpen = signal(false);
  readonly mobileInspectorOpen = signal(false);
  readonly mobileInspectorTab = signal<'inspector' | 'bindings'>('inspector');
  readonly dockviewTheme = signal<DockviewTheme>(themeLight);
  readonly components = {
    canvas: WorkflowCanvasPanelComponent,
    catalog: OperatorCatalogPanelComponent,
    inspector: NodeInspectorPanelComponent,
    bindings: RuntimeBindingPanelComponent,
  };
  readonly emptyContextMenu = () => [];

  constructor() {
    super();
    this.bridge.host = this;
    this.ensureDockviewStyles();
    this.restoreThemePreference();
  }

  @HostListener('window:resize')
  handleWorkspaceResize(): void {
    const nextMobile = window.innerWidth < 800;
    if (nextMobile !== this.mobile()) this.mobile.set(nextMobile);
    queueMicrotask(() =>
      this.dockviewApi?.layout(window.innerWidth, Math.max(320, window.innerHeight - 150), true),
    );
  }

  onDockviewReady(event: DockviewReadyEvent): void {
    this.dockviewApi = event.api;
    if (!this.restoreWorkspaceLayout()) this.createDefaultLayout();
    this.layoutSubscription?.dispose();
    this.layoutSubscription = event.api.onDidLayoutChange(() => {
      if (!this.restoringLayout) this.saveWorkspaceLayout();
    });
  }

  openPanel(panelId: Exclude<WorkspacePanelId, 'canvas'>): void {
    if (this.mobile()) {
      if (panelId === 'catalog') this.mobileCatalogOpen.set(true);
      else {
        this.mobileInspectorTab.set(panelId === 'bindings' ? 'bindings' : 'inspector');
        this.mobileInspectorOpen.set(true);
      }
      return;
    }
    const panel = this.dockviewApi?.getPanel(panelId);
    if (panel) panel.api.setActive();
    else this.addSidePanel(panelId);
  }

  resetWorkspaceLayout(): void {
    if (!this.dockviewApi || this.mobile()) return;
    this.restoringLayout = true;
    try {
      this.dockviewApi.closeAllGroups();
      this.createDefaultLayout();
      window.localStorage.removeItem(this.preferenceKey());
      window.localStorage.removeItem('smart-water.workflow-editor.docks');
    } finally {
      this.restoringLayout = false;
      this.saveWorkspaceLayout();
    }
  }

  toggleWorkspaceTheme(): void {
    this.darkWorkspace.update((value) => !value);
    this.dockviewTheme.set(this.darkWorkspace() ? themeDark : themeLight);
    this.saveWorkspaceLayout();
  }

  override ngOnDestroy(): void {
    this.layoutSubscription?.dispose();
    this.bridge.host = undefined;
    super.ngOnDestroy();
  }

  private createDefaultLayout(): void {
    if (!this.dockviewApi) return;
    const canvas = this.dockviewApi.addPanel({
      id: 'canvas',
      component: 'canvas',
      title: '工作流画布',
      renderer: 'always',
    });
    this.dockviewApi.addPanel({
      id: 'catalog',
      component: 'catalog',
      title: '算子目录',
      initialWidth: 290,
      position: { referencePanel: canvas, direction: 'left' },
    });
    const inspector = this.dockviewApi.addPanel({
      id: 'inspector',
      component: 'inspector',
      title: '节点属性',
      initialWidth: 350,
      position: { referencePanel: canvas, direction: 'right' },
    });
    this.dockviewApi.addPanel({
      id: 'bindings',
      component: 'bindings',
      title: '运行绑定',
      initialHeight: 300,
      position: { referencePanel: inspector, direction: 'below' },
    });
    canvas.api.setActive();
  }

  private addSidePanel(panelId: Exclude<WorkspacePanelId, 'canvas'>): void {
    if (!this.dockviewApi) return;
    const canvas = this.dockviewApi.getPanel('canvas');
    if (!canvas) return;
    const title =
      panelId === 'catalog' ? '算子目录' : panelId === 'bindings' ? '运行绑定' : '节点属性';
    const panel = this.dockviewApi.addPanel({
      id: panelId,
      component: panelId,
      title,
      initialWidth: panelId === 'catalog' ? 290 : 350,
      position: { referencePanel: canvas, direction: panelId === 'catalog' ? 'left' : 'right' },
    });
    panel.api.setActive();
  }

  private preferenceKey(): string {
    return workspacePreferenceKey(this.workspaceAuth.user()?.id);
  }

  private saveWorkspaceLayout(): void {
    if (!this.dockviewApi || this.mobile()) return;
    try {
      const preference: WorkspaceLayoutPreference = {
        schemaVersion: 1,
        userId: this.workspaceAuth.user()?.id ?? 0,
        theme: this.darkWorkspace() ? 'workspace-dark' : 'water-light',
        layout: this.dockviewApi.toJSON(),
      };
      window.localStorage.setItem(this.preferenceKey(), JSON.stringify(preference));
    } catch {
      // Local layout preferences are optional and never block workflow editing.
    }
  }

  private restoreWorkspaceLayout(): boolean {
    if (!this.dockviewApi) return false;
    try {
      const preference = parseWorkspacePreference(
        window.localStorage.getItem(this.preferenceKey()),
        this.workspaceAuth.user()?.id ?? 0,
      );
      if (!preference) {
        window.localStorage.removeItem(this.preferenceKey());
        return false;
      }
      this.restoringLayout = true;
      this.dockviewApi.fromJSON(preference.layout as any);
      this.darkWorkspace.set(preference.theme === 'workspace-dark');
      this.dockviewTheme.set(this.darkWorkspace() ? themeDark : themeLight);
      window.localStorage.removeItem('smart-water.workflow-editor.docks');
      return Boolean(this.dockviewApi.getPanel('canvas'));
    } catch {
      window.localStorage.removeItem(this.preferenceKey());
      return false;
    } finally {
      this.restoringLayout = false;
    }
  }

  private restoreThemePreference(): void {
    try {
      const preference = parseWorkspacePreference(
        window.localStorage.getItem(this.preferenceKey()),
        this.workspaceAuth.user()?.id ?? 0,
      );
      if (!preference) return;
      this.darkWorkspace.set(preference.theme === 'workspace-dark');
      this.dockviewTheme.set(this.darkWorkspace() ? themeDark : themeLight);
    } catch {
      // Ignore malformed preferences.
    }
  }

  private ensureDockviewStyles(): void {
    if (typeof document === 'undefined' || document.querySelector('link[data-dockview-styles]'))
      return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/vendor/dockview/dockview.css';
    link.dataset['dockviewStyles'] = 'true';
    document.head.appendChild(link);
  }
}
