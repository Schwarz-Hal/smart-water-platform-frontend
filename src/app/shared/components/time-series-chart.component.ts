import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as echarts from 'echarts';

export interface TimeSeriesLine {
  name: string;
  data: Array<[string, number | null]>;
  color?: string;
  dashed?: boolean;
  area?: boolean;
  type?: 'line' | 'scatter';
}

@Component({
  selector: 'app-time-series-chart',
  template: `<div #host class="chart-host" [attr.aria-label]="title"></div>`,
  styles: `
    .chart-host {
      width: 100%;
      height: 340px;
      min-height: 260px;
    }
  `,
})
export class TimeSeriesChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = '时序图';
  @Input() yAxisName = '数值';
  @Input() lines: TimeSeriesLine[] = [];
  @ViewChild('host') private host?: ElementRef<HTMLDivElement>;

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    if (!this.host) {
      return;
    }
    this.chart = echarts.init(this.host.nativeElement);
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host.nativeElement);
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
    if (!this.chart) {
      return;
    }
    this.chart.setOption(
      {
        animation: false,
        color: this.lines.map((line) => line.color ?? '#2563eb'),
        grid: { top: 46, right: 28, bottom: 42, left: 56 },
        title: { text: this.title, textStyle: { fontSize: 14, fontWeight: 'normal' } },
        tooltip: { trigger: 'axis' },
        legend: { top: 22 },
        xAxis: { type: 'time', boundaryGap: false },
        yAxis: { type: 'value', name: this.yAxisName, scale: true },
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }],
        series: this.lines.map((line) => ({
          name: line.name,
          type: line.type ?? 'line',
          data: line.data,
          showSymbol: line.type === 'scatter',
          symbolSize: line.type === 'scatter' ? 8 : 4,
          connectNulls: false,
          lineStyle: { type: line.dashed ? 'dashed' : 'solid', width: 2 },
          areaStyle: line.area ? { opacity: 0.12 } : undefined,
        })),
      },
      { notMerge: true },
    );
  }
}
