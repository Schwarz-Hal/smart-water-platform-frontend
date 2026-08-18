import { CommonModule } from '@angular/common';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import {
  WorkflowArtifact,
  WorkflowNodeRun,
  WorkflowRunSummary,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { TimeSeriesChartComponent, TimeSeriesLine } from '../../shared/components/time-series-chart.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';
import {
  leakageCandidates,
  leakageEvidenceTypes,
  leakageRiskLine,
  leakageRiskSummary,
  unwrapLeakageReport,
} from '../workflows/s01-leakage-report';

/** 从 artifact 中解析出的候选漏点 */
interface S01Candidate {
  id: string | number;
  start_time: string;
  end_time: string;
  risk_score: number;
  mean_risk_score?: number;
  evidence: { evidence?: string[]; point_count?: number; mean_risk_score?: number; scope?: string };
  status: string;
}

type StepStatus = 'complete' | 'partial' | 'planned';
type StepId = 'warning' | 'location' | 'valve' | 'labeling' | 'evaluation' | 'cause' | 'disposal';

interface ProcessStep {
  id: StepId;
  name: string;
  status: StepStatus;
  desc: string;
}

const PROCESS_STEPS: ProcessStep[] = [
  { id: 'warning', name: '漏损预警报警', status: 'complete', desc: '基于夜间流量、水平衡、流量压力突变识别漏损风险时段' },
  { id: 'location', name: '漏损定位分析', status: 'partial', desc: '多维度证据评分，输出候选风险区域辅助现场定位' },
  { id: 'valve', name: '关阀分析', status: 'planned', desc: '基于水力模型的关阀方案分析与影响评估' },
  { id: 'labeling', name: '事件标注', status: 'partial', desc: '候选事件人工核验与状态标注，支撑模型迭代' },
  { id: 'evaluation', name: '漏损综合评价', status: 'complete', desc: '质量分、风险摘要、覆盖时段的综合评估结论' },
  { id: 'cause', name: '漏损成因分析', status: 'partial', desc: '证据类型分布与成因线索，关联规则库与案例库' },
  { id: 'disposal', name: '处置建议输出', status: 'planned', desc: '基于规则库、案例库、知识图谱生成智能处置建议' },
];

const EVIDENCE_LABELS: Record<string, string> = {
  night_flow_score: '夜间流量异常',
  balance_score: '水量平衡异常',
  residual_score: '基线残差异常',
  persistence_score: '持续变化特征',
};

@Component({
  selector: 'app-s01-run-result-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, TimeSeriesChartComponent, BeijingTimePipe],
  template: `
    <header class="page-head">
      <button class="back-btn" type="button" (click)="goBack()">← 返回场景中心</button>
      <div>
        <p class="eyebrow">S01 · 运行结果</p>
        <h1>DMA 分区漏损评估报告</h1>
        <p class="lead">运行 ID：{{ runId() }}</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button type="button" (click)="loadAll()">刷新</button>
      </div>
    </header>

    @if (loadError()) {
      <div class="alert error">{{ loadError() }}</div>
    }

    @if (run(); as detail) {
      <!-- 运行状态条 -->
      <section class="status-bar">
        <div class="status-item">
          <span class="status-label">运行状态</span>
          <span class="status-value" [class.success]="detail.status === 'success'" [class.failed]="detail.status === 'failed'">
            {{ statusLabel(detail.status) }}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">数据质量分</span>
          <span class="status-value highlight">{{ qualityScore() != null ? qualityScore()!.toFixed(2) : '—' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">候选漏点</span>
          <span class="status-value">{{ candidates().length }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">执行进度</span>
          <span class="status-value">{{ detail.progress }}%</span>
        </div>
      </section>

      <!-- 七步流程导航 -->
      <nav class="process-nav" aria-label="漏损评估业务流程">
        @for (step of processSteps; track step.id) {
          <button
            class="step-btn"
            [class.active]="currentStep() === step.id"
            type="button"
            (click)="selectStep(step.id)"
          >
            <span class="step-num" [class]="'num-' + step.status">{{ $index + 1 }}</span>
            <span class="step-name">{{ step.name }}</span>
            <span class="step-badge" [class]="'badge-' + step.status">{{ stepStatusLabel(step.status) }}</span>
          </button>
          @if (!$last) {
            <span class="step-arrow">›</span>
          }
        }
      </nav>

      <!-- 当前步骤内容 -->
      <section class="step-content">
        @switch (currentStep()) {
          <!-- ① 漏损预警报警 -->
          @case ('warning') {
            <div class="step-head">
              <h2>① 漏损预警报警</h2>
              <p class="step-desc">综合夜间最小流量、水平衡、流量/压力时序突变等规则，识别漏损风险时段。C1 异常筛查算法辅助预警。</p>
            </div>

            @if (riskLines().length) {
              <app-time-series-chart
                title="漏损风险时间线"
                yAxisName="风险分数"
                [lines]="riskLines()"
              />
            } @else {
              <div class="empty-box">暂无风险时间线数据</div>
            }

            <div class="warning-rules">
              <h3>预警规则</h3>
              <div class="rule-grid">
                <div class="rule-card">
                  <span class="rule-icon">🌙</span>
                  <div>
                    <strong>夜间最小流量法（MNF）</strong>
                    <p>夜间最小流量与合法夜间用水量的差值超过阈值时触发预警</p>
                  </div>
                </div>
                <div class="rule-card">
                  <span class="rule-icon">⚖️</span>
                  <div>
                    <strong>水平衡分析法</strong>
                    <p>进水量 − 授权用水量 − 已知损失 = 表观及真实漏损，异常时触发</p>
                  </div>
                </div>
                <div class="rule-card">
                  <span class="rule-icon">📈</span>
                  <div>
                    <strong>流量/压力突变法</strong>
                    <p>实时监测流量、压力时序突变点，C1 异常筛查辅助识别</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="stat-row">
              <div class="stat-card">
                <span class="stat-label">候选预警事件</span>
                <span class="stat-value">{{ candidates().length }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">最高风险分</span>
                <span class="stat-value">{{ riskSummary().maximum.toFixed(3) }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">平均风险分</span>
                <span class="stat-value">{{ riskSummary().mean.toFixed(3) }}</span>
              </div>
            </div>
          }

          <!-- ② 漏损定位分析 -->
          @case ('location') {
            <div class="step-head">
              <h2>② 漏损定位分析</h2>
              <p class="step-desc">结合压差法、模型法、听音法等传统定位手段，算法输出 B1/B2 候选风险区辅助现场定位。</p>
            </div>

            <div class="location-methods">
              <span class="method-tag">压差法</span>
              <span class="method-tag">模型法</span>
              <span class="method-tag">听音法</span>
              <span class="method-tag algorithm">B1/B2 候选风险区（算法辅助）</span>
            </div>

            @if (candidates().length) {
              <p class="hint">按风险分降序排列。候选仅用于人工核验，不代表漏点结论。</p>
              <div class="candidate-list">
                @for (c of sortedCandidates(); track c.id) {
                  <div class="candidate-row">
                    <div class="candidate-time">
                      <div class="time-range">{{ c.start_time | beijingTime:'MM-dd HH:mm' }} — {{ c.end_time | beijingTime:'MM-dd HH:mm' }}</div>
                      <div class="time-date">{{ c.start_time | beijingTime:'yyyy-MM-dd' }}</div>
                    </div>
                    <div class="candidate-risk">
                      <div class="risk-bar">
                        <div class="risk-fill" [class.risk-high]="c.risk_score >= 0.8" [class.risk-mid]="c.risk_score >= 0.6 && c.risk_score < 0.8" [style.width.%]="c.risk_score * 100"></div>
                      </div>
                      <span class="risk-score" [class.risk-high]="c.risk_score >= 0.8" [class.risk-mid]="c.risk_score >= 0.6 && c.risk_score < 0.8">
                        {{ (c.risk_score * 100).toFixed(1) }}%
                      </span>
                    </div>
                    <div class="candidate-meta">
                      @if (c.evidence.point_count != null) {
                        <span>{{ c.evidence.point_count }} 个数据点</span>
                      }
                      <span class="cand-status" [class]="'cs-' + c.status">{{ candidateStatusLabel(c.status) }}</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="empty-box">未识别到候选漏点。</div>
            }
          }

          <!-- ③ 关阀分析 -->
          @case ('valve') {
            <div class="step-head">
              <h2>③ 关阀分析</h2>
              <p class="step-desc">基于水力模型的关阀方案分析，评估关阀影响范围与最优关阀组合。</p>
            </div>
            <div class="planned-box">
              <span class="planned-icon">🔧</span>
              <h3>关阀分析模型 · 规划中</h3>
              <p>该功能依赖 SimuWater 水力模型对接，当前算法暂未输出关阀分析结果。后续将支持：关阀方案模拟、影响范围评估、最优关阀组合推荐。</p>
            </div>
          }

          <!-- ④ 事件标注 -->
          @case ('labeling') {
            <div class="step-head">
              <h2>④ 事件标注</h2>
              <p class="step-desc">对候选漏损事件进行人工核验与状态标注，标注结果回写用于模型迭代与阈值修正。</p>
            </div>

            <div class="label-methods">
              <span class="method-tag">有监督标注</span>
              <span class="method-tag">无监督标注</span>
              <span class="method-tag algorithm">自动化标注（算法辅助）</span>
            </div>

            @if (candidates().length) {
              <div class="status-filter">
                <button
                  class="filter-btn"
                  [class.active]="statusFilter() === 'all'"
                  type="button"
                  (click)="statusFilter.set('all')"
                >全部（{{ candidates().length }}）</button>
                @for (group of candidateStatusGroups; track group.label) {
                  <button
                    class="filter-btn"
                    [class.active]="statusFilter() === group.label"
                    type="button"
                    (click)="statusFilter.set(group.label)"
                  >{{ group.label }}（{{ statusCount(group) }}）</button>
                }
              </div>

              <div class="candidate-list">
                @for (c of filteredCandidates(); track c.id) {
                  <div class="candidate-row">
                    <div class="candidate-time">
                      <div class="time-range">{{ c.start_time | beijingTime:'MM-dd HH:mm' }} — {{ c.end_time | beijingTime:'MM-dd HH:mm' }}</div>
                      <div class="time-date">{{ c.start_time | beijingTime:'yyyy-MM-dd' }}</div>
                    </div>
                    <div class="candidate-risk">
                      <div class="risk-bar">
                        <div class="risk-fill" [class.risk-high]="c.risk_score >= 0.8" [class.risk-mid]="c.risk_score >= 0.6 && c.risk_score < 0.8" [style.width.%]="c.risk_score * 100"></div>
                      </div>
                      <span class="risk-score" [class.risk-high]="c.risk_score >= 0.8" [class.risk-mid]="c.risk_score >= 0.6 && c.risk_score < 0.8">
                        {{ (c.risk_score * 100).toFixed(1) }}%
                      </span>
                    </div>
                    <div class="candidate-meta">
                      <span class="cand-status" [class]="'cs-' + c.status">{{ candidateStatusLabel(c.status) }}</span>
                      <button class="label-btn" type="button" disabled title="标注功能开发中，待后端 workflow 体系标注接口就绪">标注</button>
                    </div>
                  </div>
                } @empty {
                  <div class="empty-box">当前筛选条件下无候选事件</div>
                }
              </div>
            } @else {
              <div class="empty-box">暂无候选事件可标注</div>
            }
          }

          <!-- ⑤ 漏损综合评价 -->
          @case ('evaluation') {
            <div class="step-head">
              <h2>⑤ 漏损综合评价</h2>
              <p class="step-desc">基于 Qscore 质量线索输入，综合数据质量、风险水平、覆盖时段给出漏损评估结论。</p>
            </div>

            <div class="eval-grid">
              <div class="eval-card">
                <span class="eval-label">数据质量分（Qscore）</span>
                <span class="eval-value highlight">{{ qualityScore() != null ? qualityScore()!.toFixed(2) : '—' }}</span>
                <span class="eval-sub">{{ qualityGateLabel() }}</span>
              </div>
              <div class="eval-card">
                <span class="eval-label">最高风险分</span>
                <span class="eval-value">{{ riskSummary().maximum.toFixed(3) }}</span>
              </div>
              <div class="eval-card">
                <span class="eval-label">平均风险分</span>
                <span class="eval-value">{{ riskSummary().mean.toFixed(3) }}</span>
              </div>
              <div class="eval-card">
                <span class="eval-label">候选事件数</span>
                <span class="eval-value">{{ candidates().length }}</span>
              </div>
            </div>

            <div class="coverage-box">
              <span class="coverage-label">风险覆盖时间</span>
              <span class="coverage-value">
                @if (riskSummary().startTime && riskSummary().endTime) {
                  {{ riskSummary().startTime | beijingTime }} 至 {{ riskSummary().endTime | beijingTime }}
                } @else {
                  —
                }
              </span>
            </div>

            <div class="qscore-note">
              <strong>Qscore 质量线索：</strong>数据质量评分作为漏损综合评价的输入约束，质量分过低时评估结果仅供参考。
            </div>
          }

          <!-- ⑥ 漏损成因分析 -->
          @case ('cause') {
            <div class="step-head">
              <h2>⑥ 漏损成因分析</h2>
              <p class="step-desc">基于证据类型分布识别漏损成因线索，后续将关联规则库、案例库、知识图谱实现 C2 异常分类与原因定位。</p>
            </div>

            @if (evidenceTypes().length) {
              <div class="evidence-section">
                <h3>证据类型分布</h3>
                <div class="evidence-tags">
                  @for (item of evidenceTypes(); track item) {
                    <span class="evidence-tag">{{ evidenceLabel(item) }}</span>
                  }
                </div>
                <div class="evidence-detail">
                  @for (item of evidenceTypes(); track item) {
                    <div class="evidence-item">
                      <strong>{{ evidenceLabel(item) }}</strong>
                      <p>{{ evidenceDesc(item) }}</p>
                    </div>
                  }
                </div>
              </div>
            } @else {
              <div class="empty-box">暂无证据类型数据</div>
            }

            <div class="cause-sources">
              <h3>成因知识库</h3>
              <div class="source-grid">
                <div class="source-card pending">
                  <span class="source-icon">📋</span>
                  <strong>规则库</strong>
                  <span class="source-status">待接入</span>
                </div>
                <div class="source-card pending">
                  <span class="source-icon">📚</span>
                  <strong>案例库</strong>
                  <span class="source-status">待接入</span>
                </div>
                <div class="source-card pending">
                  <span class="source-icon">🕸️</span>
                  <strong>知识图谱</strong>
                  <span class="source-status">待接入</span>
                </div>
              </div>
              <p class="hint">C2 异常分类与原因定位功能待后端知识库接口就绪后接入。</p>
            </div>
          }

          <!-- ⑦ 处置建议输出 -->
          @case ('disposal') {
            <div class="step-head">
              <h2>⑦ 处置建议输出</h2>
              <p class="step-desc">基于规则库、案例库、知识图谱与 C2 异常分类，生成可执行的漏损处置建议。</p>
            </div>
            <div class="planned-box">
              <span class="planned-icon">💡</span>
              <h3>智能处置建议 · 规划中</h3>
              <p>该功能依赖成因分析知识库（规则库/案例库/知识图谱）与 C2 异常分类能力。后续将支持：处置方案推荐、优先级排序、处置结果回写与模型迭代闭环。</p>
            </div>
          }
        }
      </section>

      <!-- 技术细节折叠区 -->
      <section class="tech-section">
        <button class="tech-toggle" type="button" (click)="showTech.set(!showTech())">
          <span>{{ showTech() ? '▼' : '▶' }}</span>
          {{ showTech() ? '收起' : '展开' }}技术细节（运行详情 + 节点执行）
        </button>
        @if (showTech()) {
          <div class="tech-content">
            <!-- 运行详情 -->
            <div class="card">
              <h2>运行详情</h2>
              <div class="detail-grid">
                <div class="detail-item"><span class="k">工作流</span><span class="v">{{ detail.workflow_name || '—' }}</span></div>
                <div class="detail-item"><span class="k">版本</span><span class="v">#{{ detail.workflow_version ?? '—' }}</span></div>
                <div class="detail-item"><span class="k">任务 ID</span><span class="v mono">{{ detail.task_id }}</span></div>
                <div class="detail-item"><span class="k">Trace ID</span><span class="v mono">{{ detail.trace_id }}</span></div>
                <div class="detail-item"><span class="k">创建时间</span><span class="v">{{ detail.created_at | beijingTime }}</span></div>
                <div class="detail-item"><span class="k">开始时间</span><span class="v">{{ detail.started_at ? (detail.started_at | beijingTime) : '—' }}</span></div>
                <div class="detail-item"><span class="k">结束时间</span><span class="v">{{ detail.finished_at ? (detail.finished_at | beijingTime) : '—' }}</span></div>
                <div class="detail-item"><span class="k">节点</span><span class="v">{{ detail.node_success_count }}/{{ detail.node_count }} 成功</span></div>
              </div>
              @if (detail.error_message) {
                <div class="alert error" style="margin-top:16px">
                  <strong>{{ detail.error_code }}：</strong>{{ detail.error_message }}
                </div>
              }
            </div>

            <!-- 节点执行 -->
            <div class="card">
              <h2>节点执行（{{ nodes().length }}）</h2>
              <div class="node-list">
                @for (node of nodes(); track node.id) {
                  <div class="node-row" [class.failed]="node.status === 'failed'">
                    <div class="node-main">
                      <span class="node-order">{{ $index + 1 }}</span>
                      <div class="node-info">
                        <div class="node-name">{{ nodeName(node) }}</div>
                        <div class="node-code">{{ node.node_code }}</div>
                      </div>
                      <span class="node-status" [class]="'st-' + node.status">{{ statusLabel(node.status) }}</span>
                      <span class="node-progress">{{ node.progress }}%</span>
                      <span class="node-time">
                        {{ node.started_at ? (node.finished_at ? duration(node.started_at, node.finished_at) : '运行中') : '—' }}
                      </span>
                    </div>
                    @if (node.error_message) {
                      <div class="node-error">{{ node.error_code }}：{{ node.error_message }}</div>
                    }
                  </div>
                } @empty {
                  <p class="placeholder">暂无节点执行记录。</p>
                }
              </div>
            </div>
          </div>
        }
      </section>
    } @else if (!loadError()) {
      <div class="loading">
        <span class="spinner"></span>
        <span>正在读取运行结果…</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 1080px;
      margin: 0 auto;
      color: var(--sw-text-primary);
    }
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .back-btn {
      background: none;
      border: none;
      color: var(--sw-color-primary);
      cursor: pointer;
      font-size: 13px;
      padding: 0 0 12px;
      font-weight: 600;
    }
    .back-btn:hover { text-decoration: underline; }
    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    h1 { margin: 4px 0 8px; font-size: clamp(24px, 3vw, 32px); }
    .lead { color: var(--sw-text-secondary); margin: 0; }
    .header-actions { display: flex; gap: 8px; }

    /* 运行状态条 */
    .status-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .status-item {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .status-label { font-size: 12px; color: var(--sw-text-muted); font-weight: 600; }
    .status-value { font-size: 22px; font-weight: 700; }
    .status-value.highlight { color: var(--sw-color-primary); }
    .status-value.success { color: var(--sw-color-success); }
    .status-value.failed { color: var(--sw-color-danger); }

    /* 七步流程导航 */
    .process-nav {
      display: flex;
      align-items: stretch;
      gap: 0;
      margin-bottom: 20px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .step-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 12px 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      cursor: pointer;
      min-width: 110px;
      flex: 1;
      transition: all 0.15s;
      font: inherit;
      color: inherit;
    }
    .step-btn:hover:not(.disabled) {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary-soft);
    }
    .step-btn.active {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary-soft);
      box-shadow: 0 0 0 2px var(--sw-color-primary);
    }
    .step-num {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
    }
    .step-num.num-complete { background: var(--sw-color-success); }
    .step-num.num-partial { background: #f59e0b; }
    .step-num.num-planned { background: var(--sw-text-muted); }
    .step-name { font-size: 12px; font-weight: 600; text-align: center; line-height: 1.3; }
    .step-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
    }
    .badge-complete { background: #dcfce7; color: #166534; }
    .badge-partial { background: #fef3c7; color: #92400e; }
    .badge-planned { background: var(--sw-surface-muted); color: var(--sw-text-muted); }
    .step-arrow {
      display: flex;
      align-items: center;
      color: var(--sw-text-muted);
      font-size: 18px;
      padding: 0 4px;
      flex-shrink: 0;
    }

    /* 步骤内容区 */
    .step-content {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 24px 28px;
      margin-bottom: 16px;
      box-shadow: var(--sw-shadow-sm);
      min-height: 300px;
    }
    .step-head { margin-bottom: 20px; }
    .step-head h2 { margin: 0 0 6px; font-size: 20px; }
    .step-desc { margin: 0; color: var(--sw-text-secondary); font-size: 13px; line-height: 1.6; }

    .hint { margin: 0 0 14px; color: var(--sw-text-muted); font-size: 13px; }
    .empty-box {
      text-align: center;
      padding: 40px 20px;
      color: var(--sw-text-muted);
      font-size: 14px;
      border: 1px dashed var(--sw-border);
      border-radius: var(--sw-radius-md);
    }

    /* 步骤① 预警 */
    .warning-rules { margin-top: 20px; }
    .warning-rules h3 { margin: 0 0 12px; font-size: 15px; }
    .rule-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .rule-card {
      display: flex;
      gap: 10px;
      padding: 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
    }
    .rule-icon { font-size: 22px; flex-shrink: 0; }
    .rule-card strong { display: block; font-size: 13px; margin-bottom: 4px; }
    .rule-card p { margin: 0; font-size: 12px; color: var(--sw-text-secondary); line-height: 1.5; }

    .stat-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 20px;
    }
    .stat-card {
      padding: 14px 18px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-label { font-size: 12px; color: var(--sw-text-muted); font-weight: 600; }
    .stat-value { font-size: 24px; font-weight: 700; }

    /* 步骤② 定位 */
    .location-methods, .label-methods {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .method-tag {
      padding: 4px 12px;
      border-radius: 999px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-secondary);
      font-size: 12px;
      font-weight: 600;
    }
    .method-tag.algorithm {
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary);
    }

    /* 候选漏点列表 */
    .candidate-list { display: flex; flex-direction: column; gap: 10px; }
    .candidate-row {
      display: grid;
      grid-template-columns: 200px 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 12px 16px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
    }
    .candidate-time .time-range { font-size: 13px; font-weight: 600; }
    .candidate-time .time-date { font-size: 11px; color: var(--sw-text-muted); }
    .candidate-risk { display: flex; align-items: center; gap: 10px; }
    .risk-bar { flex: 1; height: 8px; background: var(--sw-surface-muted); border-radius: 4px; overflow: hidden; }
    .risk-fill { height: 100%; background: var(--sw-color-success); transition: width 0.3s; }
    .risk-fill.risk-mid { background: #f59e0b; }
    .risk-fill.risk-high { background: var(--sw-color-danger); }
    .risk-score { font-size: 13px; font-weight: 700; min-width: 52px; text-align: right; }
    .risk-score.risk-mid { color: #b45309; }
    .risk-score.risk-high { color: var(--sw-color-danger); }
    .candidate-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-size: 12px; color: var(--sw-text-secondary); }
    .cand-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--sw-surface-muted); color: var(--sw-text-muted); }
    .cand-status.cs-confirmed { background: #fee2e2; color: #991b1b; }
    .cand-status.cs-excluded, .cand-status.cs-rejected { background: #e5e7eb; color: #4b5563; }
    .cand-status.cs-investigating { background: #dbeafe; color: #1e40af; }
    .label-btn {
      padding: 4px 14px;
      border: 1px solid var(--sw-border);
      border-radius: 6px;
      background: var(--sw-surface);
      color: var(--sw-text-muted);
      font-size: 12px;
      cursor: not-allowed;
      font: inherit;
    }

    /* 步骤④ 标注筛选 */
    .status-filter {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .filter-btn {
      padding: 6px 14px;
      border: 1px solid var(--sw-border);
      border-radius: 999px;
      background: var(--sw-surface);
      color: var(--sw-text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font: inherit;
    }
    .filter-btn.active {
      background: var(--sw-color-primary);
      color: #fff;
      border-color: var(--sw-color-primary);
    }

    /* 步骤⑤ 综合评价 */
    .eval-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .eval-card {
      padding: 16px 18px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .eval-label { font-size: 12px; color: var(--sw-text-muted); font-weight: 600; }
    .eval-value { font-size: 26px; font-weight: 700; }
    .eval-value.highlight { color: var(--sw-color-primary); }
    .eval-sub { font-size: 11px; color: var(--sw-text-muted); }
    .coverage-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-info-soft);
      margin-bottom: 16px;
    }
    .coverage-label { font-size: 13px; color: var(--sw-text-secondary); font-weight: 600; }
    .coverage-value { font-size: 14px; font-weight: 600; }
    .qscore-note {
      padding: 12px 16px;
      border-left: 4px solid var(--sw-color-warning);
      background: var(--sw-color-warning-soft);
      color: var(--sw-text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    /* 步骤⑥ 成因 */
    .evidence-section { margin-bottom: 24px; }
    .evidence-section h3, .cause-sources h3 { margin: 0 0 12px; font-size: 15px; }
    .evidence-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .evidence-tag {
      padding: 5px 12px;
      border-radius: 999px;
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 600;
    }
    .evidence-detail { display: flex; flex-direction: column; gap: 10px; }
    .evidence-item {
      padding: 12px 16px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
    }
    .evidence-item strong { font-size: 13px; }
    .evidence-item p { margin: 4px 0 0; font-size: 12px; color: var(--sw-text-secondary); line-height: 1.5; }

    .source-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 10px;
    }
    .source-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 20px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
    }
    .source-card.pending { opacity: 0.6; }
    .source-icon { font-size: 28px; }
    .source-card strong { font-size: 14px; }
    .source-status {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
    }

    /* 规划中占位 */
    .planned-box {
      text-align: center;
      padding: 48px 24px;
      border: 2px dashed var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface-muted);
    }
    .planned-icon { font-size: 40px; display: block; margin-bottom: 12px; }
    .planned-box h3 { margin: 0 0 8px; font-size: 18px; color: var(--sw-text-secondary); }
    .planned-box p { margin: 0 auto; max-width: 500px; color: var(--sw-text-muted); font-size: 13px; line-height: 1.7; }

    /* 技术细节折叠区 */
    .tech-section { margin-bottom: 16px; }
    .tech-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      color: var(--sw-text-secondary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font: inherit;
    }
    .tech-toggle:hover { background: var(--sw-surface-raised); }
    .tech-content { margin-top: 12px; display: flex; flex-direction: column; gap: 16px; }

    .card {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 20px 24px;
      box-shadow: var(--sw-shadow-sm);
    }
    .card h2 { margin: 0 0 16px; font-size: 17px; }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px;
    }
    .detail-item { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    .detail-item .k { color: var(--sw-text-muted); }
    .detail-item .v { font-weight: 600; text-align: right; word-break: break-all; }
    .detail-item .v.mono { font-family: monospace; font-size: 12px; }
    .alert {
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
    }
    .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

    .node-list { display: flex; flex-direction: column; gap: 8px; }
    .node-row {
      padding: 12px 16px;
      border: 1px solid var(--sw-border);
      border-radius: 10px;
      background: var(--sw-surface-raised);
    }
    .node-row.failed { border-color: var(--sw-color-danger); background: #fef2f2; }
    .node-main {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .node-order {
      width: 24px; height: 24px;
      display: grid; place-items: center;
      border-radius: 50%;
      background: var(--sw-surface-muted);
      font-size: 12px; font-weight: 700;
      color: var(--sw-text-secondary);
    }
    .node-info { flex: 1; min-width: 120px; }
    .node-name { font-size: 14px; font-weight: 600; }
    .node-code { font-size: 11px; color: var(--sw-text-muted); font-family: monospace; }
    .node-status {
      font-size: 11px; font-weight: 700;
      padding: 2px 8px; border-radius: 999px;
      background: var(--sw-surface-muted); color: var(--sw-text-muted);
    }
    .node-status.st-success { background: #dcfce7; color: #166534; }
    .node-status.st-failed { background: #fee2e2; color: #991b1b; }
    .node-status.st-running, .node-status.st-queued { background: #dbeafe; color: #1e40af; }
    .node-progress { font-size: 12px; color: var(--sw-text-secondary); min-width: 40px; }
    .node-time { font-size: 12px; color: var(--sw-text-muted); min-width: 60px; }
    .node-error { margin-top: 8px; font-size: 12px; color: #991b1b; }
    .placeholder { color: var(--sw-text-muted); font-size: 13px; text-align: center; padding: 20px; }

    .loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px; color: var(--sw-text-secondary); }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--sw-border);
      border-top-color: var(--sw-color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 900px) {
      .rule-grid, .stat-row, .source-grid { grid-template-columns: 1fr; }
      .eval-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 700px) {
      .status-bar { grid-template-columns: repeat(2, 1fr); }
      .detail-grid { grid-template-columns: 1fr; }
      .candidate-row { grid-template-columns: 1fr; }
      .candidate-meta { align-items: flex-start; }
      .step-btn { min-width: 90px; padding: 10px 8px; }
      .step-name { font-size: 11px; }
    }
  `,
})
export class S01RunResultPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly notice = inject(NotificationService);

  readonly runId = signal('');
  readonly run = signal<WorkflowRunSummary | null>(null);
  readonly nodes = signal<WorkflowNodeRun[]>([]);
  readonly artifacts = signal<WorkflowArtifact[]>([]);
  readonly loadError = signal('');

  readonly currentStep = signal<StepId>('warning');
  readonly showTech = signal(false);
  readonly statusFilter = signal<string>('all');

  readonly processSteps = PROCESS_STEPS;

  readonly candidateStatusGroups = [
    { label: '待核验', values: ['pending', 'open'] },
    { label: '已确认', values: ['confirmed'] },
    { label: '已排除', values: ['excluded', 'rejected'] },
    { label: '核查中', values: ['investigating'] },
  ];

  /** leakage_report artifact 解析后的报告数据 */
  private readonly report = computed(() => {
    const artifact = this.artifacts().find(
      (a) => a.data_type === 'report' && a.semantic_type === 'leakage_report',
    );
    return artifact ? unwrapLeakageReport(artifact) : {};
  });

  readonly riskLines = computed<TimeSeriesLine[]>(() => leakageRiskLine(this.report()));
  readonly riskSummary = computed(() => leakageRiskSummary(this.report()));
  readonly evidenceTypes = computed(() => leakageEvidenceTypes(this.report()));

  /** 从 artifacts 中解析出的质量分 */
  readonly qualityScore = computed<number | null>(() => {
    for (const artifact of this.artifacts()) {
      if (artifact.data_type === 'scalar' && /quality/i.test(artifact.semantic_type || '')) {
        const value = Number((artifact.payload ?? artifact.preview)?.['value']);
        if (Number.isFinite(value)) return value;
      }
    }
    const qs = Number(this.report()['quality_score']);
    return Number.isFinite(qs) ? qs : null;
  });

  /** 从 artifacts 中解析出的候选漏点列表 */
  readonly candidates = computed<S01Candidate[]>(() => {
    const result: S01Candidate[] = [];
    for (const artifact of this.artifacts()) {
      if (artifact.data_type !== 'candidate_list') continue;
      const payload = (artifact.payload ?? artifact.preview)?.['payload'];
      if (!Array.isArray(payload)) continue;
      for (let i = 0; i < payload.length; i++) {
        const row = payload[i] as Record<string, unknown>;
        if (!row || typeof row !== 'object') continue;
        const risk = Number(row['risk_score'] ?? row['max_risk_score'] ?? 0);
        result.push({
          id: String(row['id'] ?? `${artifact.id}-${i}`),
          start_time: String(row['start_time'] ?? row['start'] ?? ''),
          end_time: String(row['end_time'] ?? row['end'] ?? ''),
          risk_score: Number.isFinite(risk) ? risk : 0,
          mean_risk_score: Number(row['mean_risk_score']) || undefined,
          evidence: (row['evidence'] as S01Candidate['evidence']) || {},
          status: String(row['status'] ?? 'pending'),
        });
      }
    }
    if (result.length === 0) {
      for (const row of leakageCandidates(this.report())) {
        const risk = Number(row['risk_score'] ?? row['max_risk_score'] ?? 0);
        result.push({
          id: String(row['id'] ?? `report-${result.length}`),
          start_time: String(row['start_time'] ?? ''),
          end_time: String(row['end_time'] ?? ''),
          risk_score: Number.isFinite(risk) ? risk : 0,
          evidence: (row['evidence'] as S01Candidate['evidence']) || {},
          status: String(row['status'] ?? 'pending'),
        });
      }
    }
    return result;
  });

  readonly sortedCandidates = computed(() =>
    [...this.candidates()].sort((a, b) => b.risk_score - a.risk_score),
  );

  readonly filteredCandidates = computed(() => {
    const filter = this.statusFilter();
    if (filter === 'all') return this.sortedCandidates();
    const group = this.candidateStatusGroups.find((g) => g.label === filter);
    return group
      ? this.sortedCandidates().filter((c) => group.values.includes(c.status))
      : this.sortedCandidates();
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('runId') || '';
      this.runId.set(id);
      if (id) this.loadAll();
    });
  }

  loadAll(): void {
    const id = this.runId();
    if (!id) return;
    this.loadError.set('');
    forkJoin({
      run: this.api.get<WorkflowRunSummary>(`/api/v1/workflow-runs/${id}`),
      nodes: this.api.get<WorkflowNodeRun[]>(`/api/v1/workflow-runs/${id}/nodes`),
      artifacts: this.api.get<WorkflowArtifact[]>(`/api/v1/workflow-runs/${id}/artifacts`),
    }).subscribe({
      next: ({ run, nodes, artifacts }) => {
        this.run.set(run);
        this.nodes.set(nodes);
        this.artifacts.set(artifacts);
      },
      error: (err) => {
        const message = err?.error?.detail || err?.message || '读取运行结果失败';
        this.loadError.set(message);
        this.notice.error(message);
      },
    });
  }

  selectStep(id: StepId): void {
    this.currentStep.set(id);
  }

  statusCount(group: { values: string[] }): number {
    return this.candidates().filter((c) => group.values.includes(c.status)).length;
  }

  qualityGateLabel(): string {
    const gate = this.report()['quality_gate'];
    if (!gate || typeof gate !== 'object') return '质量门未记录';
    const passed = (gate as Record<string, unknown>)['passed'];
    return passed === true ? '质量门通过' : passed === false ? '质量门未通过' : '质量门未记录';
  }

  evidenceLabel(value: string): string {
    return EVIDENCE_LABELS[value] ?? value;
  }

  evidenceDesc(value: string): string {
    const map: Record<string, string> = {
      night_flow_score: '夜间最小流量超出合法夜间用水量基准，提示存在持续漏损。',
      balance_score: '进水量与授权用水量、已知损失的水平衡出现显著偏差。',
      residual_score: '实际值与模型基线预测值的残差异常增大，提示突发漏损。',
      persistence_score: '异常特征持续存在，排除瞬时波动，确认漏损趋势。',
    };
    return map[value] ?? '算法输出的证据维度。';
  }

  nodeName(node: WorkflowNodeRun): string {
    const params = node.params_snapshot as Record<string, unknown> | undefined;
    const label = params?.['label'] ?? params?.['node_name'];
    if (typeof label === 'string' && label) return label;
    return node.node_code;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      queued: '排队中',
      running: '运行中',
      success: '成功',
      failed: '失败',
      cancelled: '已取消',
      skipped: '已跳过',
    };
    return map[status] || status;
  }

  stepStatusLabel(status: StepStatus): string {
    const map: Record<StepStatus, string> = {
      complete: '已输出',
      partial: '部分数据',
      planned: '规划中',
    };
    return map[status];
  }

  candidateStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: '待核验',
      open: '待核验',
      confirmed: '已确认',
      excluded: '已排除',
      rejected: '已排除',
      investigating: '核查中',
    };
    return map[status] || status;
  }

  duration(start: string, end: string): string {
    try {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms < 1000) return `${ms}ms`;
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      return `${min}m${sec % 60}s`;
    } catch {
      return '—';
    }
  }

  goBack(): void {
    void this.router.navigate(['/scenes']);
  }
}
