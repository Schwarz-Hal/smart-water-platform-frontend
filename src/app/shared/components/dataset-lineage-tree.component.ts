import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as echarts from 'echarts';

import { DatasetLineageTree, DatasetLineageTreeNode } from '../../core/models/api.models';

export interface LineageChartNode {
  name: string;
  versionId?: number;
  children?: LineageChartNode[];
  warning?: boolean;
  itemStyle?: Record<string, unknown>;
  label?: Record<string, unknown>;
}

/** Converts the API's flat forest into the nested shape required by ECharts. */
export function buildLineageTree(tree: DatasetLineageTree): LineageChartNode | null {
  const nodes = new Map(tree.nodes.map((node) => [node.version_id, node]));
  const children = new Map<number, number[]>();
  const childIds = new Set<number>();
  let hasWarning = false;

  for (const edge of tree.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) {
      hasWarning = true;
      continue;
    }
    const siblings = children.get(edge.from) ?? [];
    siblings.push(edge.to);
    children.set(edge.from, siblings);
    childIds.add(edge.to);
  }

  const roots = tree.roots.filter((id) => nodes.has(id));
  for (const id of nodes.keys()) {
    if (!childIds.has(id) && !roots.includes(id)) roots.push(id);
  }
  if (!roots.length && nodes.size) {
    hasWarning = true;
    roots.push(...nodes.keys());
  }

  const build = (id: number, path: Set<number>): LineageChartNode => {
    const source = nodes.get(id) as DatasetLineageTreeNode;
    const cycle = path.has(id);
    if (cycle) hasWarning = true;
    const nextPath = new Set(path);
    nextPath.add(id);
    const quality = source.quality;
    const tone = source.is_synthetic ? '#7c3aed' : source.version_kind === 'imported' ? '#64748b' : '#16855b';
    const current = source.version_id === tree.current_version_id;
    const empty = source.record_count === 0;
    return {
      name: `${source.operation_name}\n${source.version_code.slice(0, 8)}`,
      versionId: source.version_id,
      warning: cycle || empty,
      itemStyle: {
        color: empty ? '#fef3c7' : current ? '#dbeafe' : '#ffffff',
        borderColor: empty ? '#d97706' : current ? '#2563eb' : tone,
        borderWidth: current ? 3 : 2,
      },
      label: {
        color: empty ? '#92400e' : '#0f172a',
        fontSize: 12,
        lineHeight: 17,
      },
      children: cycle ? [] : (children.get(id) ?? []).map((child) => build(child, nextPath)),
    };
  };

  const builtRoots = roots.map((id) => build(id, new Set<number>()));
  if (builtRoots.length === 1 && !hasWarning) return builtRoots[0];
  return {
    name: '数据资产',
    itemStyle: { color: '#eff6ff', borderColor: '#2563eb', borderWidth: 2 },
    label: { color: '#0f4c81', fontWeight: 'bold' },
    children: builtRoots,
  };
}

@Component({
  selector: 'app-dataset-lineage-tree',
  template: `
    <div class="lineage-host" #host role="img" aria-label="数据版本血缘树"></div>
    @if (!tree?.nodes?.length) {
      <p class="empty">暂无可展示的数据版本。</p>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .lineage-host { width: 100%; height: 440px; min-height: 320px; }
    .empty { color: #64748b; padding: 24px 0; }
  `,
})
export class DatasetLineageTreeComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() tree: DatasetLineageTree | null = null;
  @Input() selectedVersionId: number | null = null;
  @Output() versionSelected = new EventEmitter<number>();
  @ViewChild('host') private host?: ElementRef<HTMLDivElement>;

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    if (!this.host) return;
    this.chart = echarts.init(this.host.nativeElement);
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host.nativeElement);
    this.chart.on('click', (params) => {
      const versionId = (params.data as LineageChartNode | undefined)?.versionId;
      if (typeof versionId === 'number') this.versionSelected.emit(versionId);
    });
    this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private render(): void {
    if (!this.chart || !this.tree?.nodes?.length) {
      this.chart?.clear();
      return;
    }
    const root = buildLineageTree(this.tree);
    if (!root) return;
    this.chart.setOption(
      {
        animationDuration: 220,
        tooltip: { trigger: 'item', triggerOn: 'mousemove' },
        series: [
          {
            type: 'tree',
            data: [root],
            orient: 'LR',
            layout: 'orthogonal',
            roam: true,
            expandAndCollapse: true,
            initialTreeDepth: -1,
            symbol: 'roundRect',
            symbolSize: [138, 48],
            edgeShape: 'polyline',
            edgeForkPosition: '50%',
            lineStyle: { color: '#94a3b8', width: 1.5 },
            label: { position: 'inside', align: 'center' },
            leaves: { label: { position: 'inside' } },
            emphasis: { focus: 'descendant' },
          },
        ],
      },
      { notMerge: true },
    );
  }
}
