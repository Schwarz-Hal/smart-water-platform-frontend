import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
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
import { ApiClient } from '../../core/services/api-client.service';
import {
  FormlyJsonFieldTypeComponent,
  FormlySliderFieldTypeComponent,
} from '../../shared/components/operator-parameter-form.component';
import { Graph, WorkflowEditorPage } from './workflow-editor.page';
import {
  NodeInspectorPanelComponent,
  OperatorCatalogPanelComponent,
  WorkflowCanvasPanelComponent,
  WorkflowEditorPanelBridge,
} from './workflow-editor-panels';
import { WorkflowCompositeCanvasPanelComponent } from './workflow-composite-canvas-panel.component';
import {
  WorkspaceLayoutPreference,
  legacyWorkspacePreferenceKey,
  parseWorkspacePreference,
  workspacePreferenceKey,
} from './workflow-workspace-preferences';
import {
  WorkflowDocumentTabComponent,
  WorkflowDocumentTabParams,
} from './workflow-document-tab.component';

export const ROOT_CANVAS_PANEL_ID = 'canvas:root' as const;
export function isRootWorkflowDocumentPanelId(id: string): boolean {
  return id === ROOT_CANVAS_PANEL_ID;
}

type WorkspacePanelId = typeof ROOT_CANVAS_PANEL_ID | 'catalog' | 'inspector';
type OptionalWorkspacePanelId = Exclude<WorkspacePanelId, typeof ROOT_CANVAS_PANEL_ID>;

@Component({
  selector: 'app-workflow-editor-workspace-page',
  imports: [
    DockviewAngularModule,
    MatButtonModule,
    MatMenuModule,
    OperatorCatalogPanelComponent,
    NodeInspectorPanelComponent,
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
          <button mat-stroked-button (click)="validate()" [disabled]="busy()">
            {{ validationButtonLabel() }}
          </button>
          <button mat-flat-button (click)="save()" [disabled]="busy()">保存草稿</button>
          <button mat-flat-button (click)="publish()" [disabled]="busy() || !workflowId()">
            发布版本
          </button>
          <button mat-flat-button (click)="run()" [disabled]="busy() || !publishedVersionId()">
            运行已发布版本
          </button>
          <button mat-stroked-button (click)="toggleWorkspaceTheme()">
            {{ darkWorkspace() ? '浅色画布' : '深色画布' }}
          </button>
          <button mat-stroked-button [matMenuTriggerFor]="windowMenu">窗口</button>
          <mat-menu #windowMenu="matMenu">
            @for (panel of windowPanels; track panel.id) {
              <button
                mat-menu-item
                type="button"
                role="menuitemcheckbox"
                [attr.aria-checked]="isPanelOpen(panel.id)"
                (click)="togglePanel(panel.id)"
              >
                <span class="window-check" aria-hidden="true">
                  {{ isPanelOpen(panel.id) ? '✓' : '' }}
                </span>
                <span>{{ panel.label }}</span>
              </button>
            }
          </mat-menu>
          <button mat-stroked-button (click)="resetWorkspaceLayout()">重置工作区</button>
        </div>
        @if (!guideDismissed()) {
          <div class="onboarding-guide">
            <span class="guide-icon">💡</span>
            <div class="guide-text">
              <strong>快速上手三步法</strong>
              <span
                >① 依次选中左侧 3 个「数据通道」节点绑定数据 → ② 点击「校验图」验证合法性 → ③
                保存草稿后发布版本</span
              >
            </div>
            <button
              class="guide-close"
              type="button"
              (click)="dismissGuide()"
              aria-label="关闭指引"
            >
              ×
            </button>
          </div>
        }
      </header>

      <div class="message-slot" aria-live="polite">
        @if (message()) {
          <div class="message" [class.error]="messageType() === 'error'">{{ message() }}</div>
        }
      </div>

      <div #workspaceBody class="workspace-body" [class.mobile]="mobile()">
        @if (!mobile()) {
          <dv-dockview
            class="dockview-host"
            [components]="components"
            [tabComponents]="tabComponents"
            [theme]="dockviewTheme()"
            [floatingGroupBounds]="'boundedWithinViewport'"
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
                节点属性<button type="button" (click)="mobileInspectorOpen.set(false)">关闭</button>
              </header>
              <app-node-inspector-panel />
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
    .message-slot:empty {
      min-height: 0;
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
    .window-check {
      display: inline-flex;
      width: 22px;
      color: var(--sw-color-primary);
      font-weight: 900;
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
    .mobile-drawer > header button {
      border: 0;
      background: transparent;
      color: var(--sw-color-primary);
      padding: 8px;
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
    }
    .onboarding-guide {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      margin: 0 16px 12px;
      border-radius: var(--sw-radius-md);
      background: color-mix(in srgb, var(--sw-color-primary) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 25%, transparent);
      color: var(--sw-text-primary);
      font-size: 13px;
    }

    .guide-icon {
      flex: 0 0 auto;
      font-size: 18px;
    }

    .guide-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: baseline;
    }

    .guide-text strong {
      color: var(--sw-color-primary);
      font-weight: 600;
    }

    .guide-text span {
      color: var(--sw-text-secondary);
    }

    .guide-close {
      flex: 0 0 auto;
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border: 0;
      background: transparent;
      color: var(--sw-text-muted);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      border-radius: 4px;
      padding: 0;
    }

    .guide-close:hover {
      background: var(--sw-surface-raised);
      color: var(--sw-text-primary);
    }

    @media (max-width: 720px) {
      .onboarding-guide {
        margin: 0 12px 10px;
        flex-wrap: wrap;
      }
    }
  `,
})
export class WorkflowEditorWorkspacePage extends WorkflowEditorPage implements OnDestroy {
  @ViewChild('workspaceBody') private workspaceBody?: ElementRef<HTMLDivElement>;
  private readonly bridge = inject(WorkflowEditorPanelBridge);
  private readonly workspaceAuth = inject(AuthService);
  private readonly workspaceApi = inject(ApiClient);
  private readonly exactCompositeVersions = new Map<
    string,
    { executorType: string; workflowVersionId: number | null }
  >();
  private readonly exactCompositeLookups = new Set<string>();
  private dockviewApi?: DockviewApi;
  private layoutSubscription?: { dispose(): void };
  private panelRemovalSubscription?: { dispose(): void };
  private restoringLayout = false;
  private workspaceInitialized = false;
  private rootRecoveryScheduled = false;
  private initializationFrame?: number;
  private readonly guideStorageKey = 'smart-water.workflow.onboarding.dismissed';
  readonly guideDismissed = signal(this.readGuideDismissed());
  readonly darkWorkspace = signal(false);
  readonly mobile = signal(typeof window !== 'undefined' && window.innerWidth < 800);
  readonly mobileCatalogOpen = signal(false);
  readonly mobileInspectorOpen = signal(false);
  readonly openPanels = signal<ReadonlySet<OptionalWorkspacePanelId>>(new Set());
  readonly windowPanels: ReadonlyArray<{ id: OptionalWorkspacePanelId; label: string }> = [
    { id: 'catalog', label: '算子目录' },
    { id: 'inspector', label: '节点属性' },
  ];
  readonly dockviewTheme = signal<DockviewTheme>(themeLight);
  readonly components = {
    canvas: WorkflowCanvasPanelComponent,
    catalog: OperatorCatalogPanelComponent,
    inspector: NodeInspectorPanelComponent,
    compositeCanvas: WorkflowCompositeCanvasPanelComponent,
  };
  readonly tabComponents = {
    documentTab: WorkflowDocumentTabComponent,
  };
  private readGuideDismissed(): boolean {
    try {
      return localStorage.getItem(this.guideStorageKey) === '1';
    } catch {
      return false;
    }
  }
  dismissGuide(): void {
    this.guideDismissed.set(true);
    try {
      localStorage.setItem(this.guideStorageKey, '1');
    } catch {
      // 忽略存储失败
    }
  }
  constructor() {
    super();
    this.bridge.host = this;
    this.restoreThemePreference();
  }

  @HostListener('window:resize')
  handleWorkspaceResize(): void {
    const nextMobile = window.innerWidth < 800;
    if (nextMobile !== this.mobile()) this.mobile.set(nextMobile);
    queueMicrotask(() => this.layoutWorkspace());
  }

  onDockviewReady(event: DockviewReadyEvent): void {
    this.dockviewApi = event.api;
    window.localStorage.removeItem(legacyWorkspacePreferenceKey(this.workspaceAuth.user()?.id));
    this.layoutSubscription?.dispose();
    this.panelRemovalSubscription?.dispose();
    this.layoutSubscription = event.api.onDidLayoutChange(() => {
      this.syncOpenPanels();
      if (!this.restoringLayout) this.saveWorkspaceLayout();
    });
    this.panelRemovalSubscription = event.api.onDidRemovePanel((panel) => {
      if (
        isRootWorkflowDocumentPanelId(panel.id) &&
        this.workspaceInitialized &&
        !this.restoringLayout
      ) {
        this.scheduleRootCanvasRecovery();
      }
    });
    this.scheduleWorkspaceInitialization();
  }

  openPanel(panelId: OptionalWorkspacePanelId): void {
    if (this.mobile()) {
      if (panelId === 'catalog') this.mobileCatalogOpen.set(true);
      else this.mobileInspectorOpen.set(true);
      return;
    }
    const panel = this.dockviewApi?.getPanel(panelId);
    if (panel) panel.api.setActive();
    else this.addSidePanel(panelId);
  }

  togglePanel(panelId: OptionalWorkspacePanelId): void {
    if (this.mobile()) {
      if (panelId === 'catalog') this.mobileCatalogOpen.update((value) => !value);
      else this.mobileInspectorOpen.update((value) => !value);
      return;
    }
    const panel = this.dockviewApi?.getPanel(panelId);
    if (panel) panel.api.close();
    else this.addSidePanel(panelId);
  }

  isPanelOpen(panelId: OptionalWorkspacePanelId): boolean {
    if (this.mobile()) {
      return panelId === 'catalog' ? this.mobileCatalogOpen() : this.mobileInspectorOpen();
    }
    return this.openPanels().has(panelId);
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
    if (this.initializationFrame !== undefined) cancelAnimationFrame(this.initializationFrame);
    this.layoutSubscription?.dispose();
    this.panelRemovalSubscription?.dispose();
    this.bridge.host = undefined;
    super.ngOnDestroy();
  }

  override loadGraph(graph: Graph): void {
    super.loadGraph(graph);
    this.scheduleWorkspaceInitialization();
  }

  override openCompositeNodeDocument(nodeId: string): void {
    if (!this.dockviewApi || this.mobile()) return;
    const node = this.nodes().find((item) => item.id === nodeId);
    if (!node) return;
    const key = `${node.node_code}@${node.node_version}`;
    const cached = this.exactCompositeVersions.get(key);
    if (!cached) {
      if (this.exactCompositeLookups.has(key)) return;
      this.exactCompositeLookups.add(key);
      this.workspaceApi
        .get<Record<string, unknown>>(
          `/api/v1/operators/${encodeURIComponent(node.node_code)}/versions/${encodeURIComponent(node.node_version)}`,
        )
        .subscribe({
          next: (response) => {
            this.exactCompositeLookups.delete(key);
            const metadata = this.exactCompositeVersionMetadata(response, node.node_version);
            this.exactCompositeVersions.set(key, metadata);
            if (metadata.executorType === 'composite_workflow' && metadata.workflowVersionId) {
              this.openResolvedCompositeNodeDocument(nodeId, metadata.workflowVersionId);
            }
          },
          error: () => {
            this.exactCompositeLookups.delete(key);
            this.showError('无法读取该复合节点的版本信息，请稍后重试。');
          },
        });
      return;
    }
    if (cached.executorType !== 'composite_workflow' || !cached.workflowVersionId) return;
    this.openResolvedCompositeNodeDocument(nodeId, cached.workflowVersionId);
  }

  private exactCompositeVersionMetadata(
    response: Record<string, unknown>,
    expectedVersion: string,
  ): { executorType: string; workflowVersionId: number | null } {
    const rawVersion = (response['version'] || response) as Record<string, unknown>;
    if (String(rawVersion['version'] || '') !== expectedVersion) {
      return { executorType: '', workflowVersionId: null };
    }
    const workflowVersionId = Number(rawVersion['composite_workflow_version_id']);
    return {
      executorType: String(rawVersion['executor_type'] || ''),
      workflowVersionId: Number.isInteger(workflowVersionId) ? workflowVersionId : null,
    };
  }

  private openResolvedCompositeNodeDocument(nodeId: string, versionId: number): void {
    if (!this.dockviewApi || this.mobile()) return;
    const node = this.nodes().find((item) => item.id === nodeId);
    if (!node) return;
    const panelId = `canvas:composite:${nodeId}`;
    const existing = this.dockviewApi.getPanel(panelId);
    if (existing) {
      existing.api.setActive();
      return;
    }
    const title = `复合节点 · ${this.operatorNames.displayName(
      node.node_code,
      node.definition?.node_name,
    )}`;
    const panel = this.dockviewApi.addPanel({
      id: panelId,
      component: 'compositeCanvas',
      tabComponent: 'documentTab',
      title,
      params: {
        kind: 'composite',
        title,
        closable: true,
        path: `root/${nodeId}`,
        workflowVersionId: versionId,
        workflowName: this.workflowName(),
        nodeId,
        readOnly: true,
      },
      position: { referencePanel: ROOT_CANVAS_PANEL_ID, direction: 'within' },
      renderer: 'always',
    });
    panel.api.setActive();
    this.saveWorkspaceLayout();
  }

  private createDefaultLayout(): void {
    if (!this.dockviewApi) return;
    const canvas = this.addRootCanvasPanel();
    this.dockviewApi.addPanel({
      id: 'catalog',
      component: 'catalog',
      title: '算子目录',
      initialWidth: 290,
      position: { referencePanel: canvas, direction: 'left' },
    });
    this.dockviewApi.addPanel({
      id: 'inspector',
      component: 'inspector',
      title: '节点属性',
      initialWidth: 350,
      position: { referencePanel: canvas, direction: 'right' },
    });
    canvas.api.setActive();
    this.syncOpenPanels();
  }

  private addSidePanel(panelId: OptionalWorkspacePanelId): void {
    if (!this.dockviewApi) return;
    const canvas = this.dockviewApi.getPanel(ROOT_CANVAS_PANEL_ID);
    if (!canvas) return;
    const title = panelId === 'catalog' ? '算子目录' : '节点属性';
    const panel = this.dockviewApi.addPanel({
      id: panelId,
      component: panelId,
      title,
      initialWidth: panelId === 'catalog' ? 290 : 350,
      position: { referencePanel: canvas, direction: panelId === 'catalog' ? 'left' : 'right' },
    });
    panel.api.setActive();
    this.syncOpenPanels();
  }

  private syncOpenPanels(): void {
    if (!this.dockviewApi) return;
    this.openPanels.set(
      new Set(
        this.windowPanels
          .filter((panel) => Boolean(this.dockviewApi?.getPanel(panel.id)))
          .map((panel) => panel.id),
      ),
    );
  }

  private preferenceKey(): string {
    return workspacePreferenceKey(this.workspaceAuth.user()?.id);
  }

  private saveWorkspaceLayout(): void {
    if (!this.dockviewApi || this.mobile()) return;
    try {
      const preference: WorkspaceLayoutPreference = {
        schemaVersion: 2,
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
      return Boolean(this.dockviewApi.getPanel(ROOT_CANVAS_PANEL_ID));
    } catch {
      window.localStorage.removeItem(this.preferenceKey());
      return false;
    } finally {
      this.restoringLayout = false;
    }
  }

  private addRootCanvasPanel() {
    if (!this.dockviewApi) throw new Error('Dockview is not ready');
    return this.dockviewApi.addPanel({
      id: ROOT_CANVAS_PANEL_ID,
      component: 'canvas',
      tabComponent: 'documentTab',
      title: '工作流画布',
      params: {
        kind: 'root',
        title: '工作流画布',
        closable: false,
      } satisfies WorkflowDocumentTabParams,
      renderer: 'always',
    });
  }

  private scheduleRootCanvasRecovery(): void {
    if (this.rootRecoveryScheduled || !this.dockviewApi) return;
    this.rootRecoveryScheduled = true;
    queueMicrotask(() => {
      this.rootRecoveryScheduled = false;
      if (
        !this.dockviewApi ||
        this.restoringLayout ||
        this.dockviewApi.getPanel(ROOT_CANVAS_PANEL_ID)
      ) {
        return;
      }
      try {
        const canvas = this.addRootCanvasPanel();
        canvas.api.setActive();
        this.syncOpenPanels();
        this.layoutWorkspace();
        this.saveWorkspaceLayout();
      } catch {
        // A transient Dockview layout error is retried by the next layout event.
      }
    });
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

  private scheduleWorkspaceInitialization(): void {
    if (this.mobile() || this.workspaceInitialized || this.initializationFrame !== undefined)
      return;
    let attempts = 0;
    const initialize = () => {
      this.initializationFrame = undefined;
      const api = this.dockviewApi;
      const rect = this.workspaceBody?.nativeElement.getBoundingClientRect();
      if (!api || !this.graphLoaded() || !rect || rect.width < 1 || rect.height < 1) {
        if (attempts++ < 120) this.initializationFrame = requestAnimationFrame(initialize);
        return;
      }

      api.layout(Math.floor(rect.width), Math.floor(rect.height), true);
      if (!this.restoreWorkspaceLayout()) {
        api.closeAllGroups();
        this.createDefaultLayout();
      }
      this.workspaceInitialized = true;
      this.syncOpenPanels();
      requestAnimationFrame(() => {
        this.layoutWorkspace();
        this.refreshEditorViewport();
      });
    };
    this.initializationFrame = requestAnimationFrame(initialize);
  }

  private layoutWorkspace(): void {
    const rect = this.workspaceBody?.nativeElement.getBoundingClientRect();
    if (!this.dockviewApi || !rect || rect.width < 1 || rect.height < 1) return;
    this.dockviewApi.layout(Math.floor(rect.width), Math.floor(rect.height), true);
    this.refreshEditorViewport();
  }
}
