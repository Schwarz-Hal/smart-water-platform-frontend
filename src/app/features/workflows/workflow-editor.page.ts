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
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularPlugin, Presets as AngularPresets } from 'rete-angular-plugin/21';

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
  default_params?: Record<string, unknown>;
  algorithm?: Record<string, unknown> | null;
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

@Component({
  selector: 'app-workflow-editor-page',
  imports: [],
  template: `<div class="editor-host"></div>`,
  styles: ``,
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
  edges: Edge[] = [];
  graphOutputs: Array<{ node_id: string; port: string }> = [];
  private readonly bindings = new Map<string, StoredBinding>();
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

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnload);
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
      default_params:
        ((version.algorithm?.['active_release'] as Record<string, unknown> | null)?.[
          'default_params'
        ] as Record<string, unknown> | undefined) ||
        (version.algorithm?.['default_params'] as Record<string, unknown> | undefined),
    };
  }
  ngAfterViewInit(): void {
    this.observeResize();
    if (this.nodes().length) void this.initializeRete();
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.reteArea?.area?.update?.();
    });
    this.resizeObserver.observe(host);
  }

  private installReteSync(): void {
    this.reteEditor.addPipe((context: any) => {
      if (context.type === 'connectioncreate') {
        const connection = context.data;
        const source = this.backendIdForRete(connection.source);
        const target = this.backendIdForRete(connection.target);
        if (!source || !target || source === target || this.wouldCreateCycle(source, target))
          return;
        const sourceNode = this.nodes().find((n) => n.id === source);
        const targetNode = this.nodes().find((n) => n.id === target);
        const sourcePort = sourceNode?.definition?.output_ports?.find(
          (p) => p.key === String(connection.sourceOutput),
        );
        const targetPort = targetNode?.definition?.input_ports?.find(
          (p) => p.key === String(connection.targetInput),
        );
        if (sourcePort && targetPort && sourcePort.data_type !== targetPort.data_type) {
          this.showError(
            `无法连接：端口类型不匹配（${sourcePort.data_type} → ${targetPort.data_type}）`,
          );
          return;
        }
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
    const schemaDefaults = Object.fromEntries(
      Object.entries(definition.parameter_schema?.properties || {}).map(([key, schema]) => [
        key,
        schema['default'],
      ]),
    );
    return { ...schemaDefaults, ...(definition.default_params || {}) };
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
        error: (error: any) => {
          this.busy.set(false);
          this.showError(this.formatWorkflowError(error, '图校验请求失败。'));
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
        this.showError(this.formatWorkflowError(error, '草稿保存失败，请检查图结构和权限。'));
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
        error: (error: any) => {
          this.busy.set(false);
          this.showError(this.formatWorkflowError(error, '发布失败，请先保存并通过校验。'));
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
  private formatWorkflowError(error: unknown, fallback: string): string {
    if (!(error instanceof Object)) return fallback;

    const errBody = (error as any).error;
    const detail = errBody?.detail;

    // 解析结构化错误
    if (detail && typeof detail === 'object' && detail.code) {
      const codeMap: Record<string, string> = {
        WORKFLOW_BINDING_INVALID: '数据绑定不合法，请检查所有数据通道的绑定配置',
        WORKFLOW_BINDING_MISSING: '存在未绑定的数据通道，请完成所有数据节点的绑定',
        WORKFLOW_BINDING_DUPLICATE:
          '多个业务角色绑定了同一条数据通道，请为不同角色选择不同的指标通道',
        WORKFLOW_GRAPH_INVALID: '流程图结构校验失败，请检查节点连线是否完整',
        WORKFLOW_REVISION_CONFLICT: '草稿已被其他页面修改，请刷新后重试',
      };

      const mainMsg = codeMap[detail.code] ?? detail.message ?? fallback;
      if (!detail.errors?.length) return mainMsg;

      // 拼接子错误
      const subMsgs = detail.errors
        .slice(0, 2)
        .map((e: any) =>
          e.node_id
            ? `${e.node_id}: ${codeMap[e.code] ?? e.message}`
            : (codeMap[e.code] ?? e.message),
        );
      if (detail.errors.length > 2) {
        subMsgs.push(`另有 ${detail.errors.length - 2} 项错误`);
      }
      return `${mainMsg}：${subMsgs.join('；')}`;
    }

    // 兼容字符串错误
    return typeof detail === 'string' ? detail : (errBody?.message ?? fallback);
  }
}
