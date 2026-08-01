import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-s01-leakage-page',
  imports: [MatCardModule],
  template: `
    <header>
      <p class="eyebrow">S01 场景</p>
      <h1>DMA 漏损评估工作流</h1>
      <p>该页面展示已确定的后端工作流边界；算法节点、运行记录和漏损候选接口尚在开发中。</p>
    </header>
    <section class="notice">
      <strong>开发中：不展示模拟漏点、虚构损失量或伪造任务结果。</strong
      ><span>完成后将直接接入 assessment run、node run 与 leak candidate API。</span>
    </section>
    <section class="flow">
      @for (node of nodes; track node.title; let index = $index) {
        <mat-card
          ><span class="index">{{ index + 1 }}</span>
          <h2>{{ node.title }}</h2>
          <p>{{ node.description }}</p>
          <dl>
            <dt>输入</dt>
            <dd>{{ node.input }}</dd>
            <dt>输出</dt>
            <dd>{{ node.output }}</dd>
          </dl></mat-card
        >
        @if (index < nodes.length - 1) {
          <div class="arrow">↓</div>
        }
      }
    </section>
    <section class="requirements">
      <h2>实际运行所需数据</h2>
      <ul>
        <li>
          DMA 入口、出口/转输表流量，以及合法用水汇总；否则只能输出“风险”，不能称为真实漏损量。
        </li>
        <li>至少 14–28 天连续历史数据，用于建立正常流量与最小夜流基线。</li>
        <li>压力点、阀泵状态；若需定位至管段，还需 GIS 管网与传感器到节点映射。</li>
      </ul>
    </section>
  `,
  styles: `
    header p:not(.eyebrow) {
      color: #64748b;
    }
    .eyebrow {
      margin: 0;
      color: #0f4c81;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    h1,
    h2,
    p {
      margin-top: 0;
    }
    .notice {
      display: grid;
      gap: 4px;
      padding: 16px;
      margin: 18px 0;
      border-radius: 10px;
      background: #fffbeb;
      color: #92400e;
    }
    .flow {
      display: grid;
      justify-items: center;
      gap: 8px;
    }
    .flow mat-card {
      width: min(620px, 100%);
      box-sizing: border-box;
      padding: 18px;
      position: relative;
    }
    .index {
      position: absolute;
      right: 16px;
      top: 16px;
      color: #0f4c81;
      font-weight: 800;
    }
    .flow p,
    dd {
      color: #64748b;
    }
    .flow dl {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 6px;
      margin: 0;
    }
    .flow dt {
      font-weight: 700;
    }
    .flow dd {
      margin: 0;
    }
    .arrow {
      font-size: 28px;
      color: #94a3b8;
    }
    .requirements {
      margin-top: 18px;
      padding: 20px;
      border-radius: 12px;
      background: #fff;
      border: 1px solid #e2e8f0;
    }
    .requirements li {
      margin: 9px 0;
      color: #475569;
      line-height: 1.55;
    }
  `,
})
export class S01LeakagePage {
  readonly nodes = [
    {
      title: '数据质量与时序标准化',
      description: '复用 Qscore，校验缺失、重复、时间粒度与修复值选择。',
      input: '数据集版本、流量/压力时序',
      output: '合格时序与质量报告',
    },
    {
      title: 'DMA 水量平衡与最小夜流',
      description: '依据入口、出口、转输和合法用水计算夜间异常余量。',
      input: 'DMA 配置、流量、压力、夜间窗口',
      output: '平衡量、夜流特征',
    },
    {
      title: '正常基线与持续残差',
      description: '以 Seasonal Naive 作为基线，并使用 EWMA/CUSUM 识别持续性偏差。',
      input: '处理后流量、历史窗口',
      output: '预测基线、持续异常证据',
    },
    {
      title: '漏损证据融合',
      description: '融合夜流抬升、流量残差、压力变化和质量评分，保持可解释。',
      input: '多项证据与阈值策略',
      output: 'DMA 级风险与候选事件',
    },
    {
      title: '定位与人工确认（后续）',
      description: '具备管网拓扑时接入 EPANET 压力残差与灵敏度定位。',
      input: 'GIS、拓扑、传感器映射',
      output: '候选管段与处置建议',
    },
  ];
}
