import { Component, inject, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface BusinessScene {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'online' | 'coming';
  icon: string;
  route?: string;
  queryParams?: Record<string, string>;
}

@Component({
  selector: 'app-scenes-page',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">算法能力中心</p>
        <h1>水务业务场景库</h1>
        <p class="lead">
          覆盖供水、排水、水质、能耗全链路12大智慧水务算法场景，开箱即用，一键进入编排与分析。
        </p>
      </div>
      <div class="header-actions">
        <button
          mat-stroked-button
          [class.active]="filterCategory() === ''"
          (click)="filterCategory.set('')"
        >
          全部场景
        </button>
        <button
          mat-stroked-button
          [class.active]="filterCategory() === '供水'"
          (click)="filterCategory.set('供水')"
        >
          供水业务
        </button>
        <button
          mat-stroked-button
          [class.active]="filterCategory() === '排水'"
          (click)="filterCategory.set('排水')"
        >
          排水业务
        </button>
        <button
          mat-stroked-button
          [class.active]="filterCategory() === '运营'"
          (click)="filterCategory.set('运营')"
        >
          运营管理
        </button>
      </div>
    </header>

    <section class="scene-grid">
      @for (scene of displayScenes(); track scene.id) {
        <article
          class="scene-card"
          [class.offline]="scene.status === 'coming'"
          [class.clickable]="scene.status === 'online'"
          (click)="handleSceneClick(scene)"
        >
          <div class="card-head">
            <span class="scene-icon">{{ scene.icon }}</span>
            <span class="status-tag" [class.online]="scene.status === 'online'">
              {{ scene.status === 'online' ? '已上线' : '即将上线' }}
            </span>
          </div>

          <h3>{{ scene.name }}</h3>
          <p class="desc">{{ scene.description }}</p>

          <div class="card-foot">
            <span class="category-tag">{{ scene.category }}</span>
            @if (scene.status === 'online') {
              <span class="enter-text">立即使用 →</span>
            }
          </div>
        </article>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: var(--sw-text-primary);
    }

    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      margin-bottom: 24px;
    }

    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    h1 {
      margin: 4px 0 8px;
      font-size: clamp(26px, 3vw, 36px);
    }

    .lead {
      max-width: 680px;
      color: var(--sw-text-secondary);
      line-height: 1.6;
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .header-actions button.active {
      background: var(--sw-color-primary-soft);
      border-color: var(--sw-color-primary);
      color: var(--sw-color-primary);
    }

    .scene-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .scene-card {
      display: flex;
      flex-direction: column;
      padding: 20px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
      transition: all 0.2s ease;
    }

    .scene-card.clickable {
      cursor: pointer;
    }

    .scene-card.clickable:hover {
      border-color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-md);
      transform: translateY(-2px);
    }

    .scene-card.offline {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }

    .scene-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--sw-color-primary-soft), var(--sw-color-info-soft));
      font-size: 22px;
    }

    .status-tag {
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
    }

    .status-tag.online {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }

    h3 {
      margin: 0 0 6px;
      font-size: 17px;
    }

    .desc {
      flex: 1;
      margin: 0 0 16px;
      color: var(--sw-text-secondary);
      font-size: 13px;
      line-height: 1.55;
      min-height: 40px;
    }

    .card-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid var(--sw-border);
    }

    .category-tag {
      font-size: 12px;
      color: var(--sw-text-muted);
    }

    .enter-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--sw-color-primary);
    }

    @media (max-width: 900px) {
      .page-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .header-actions {
        justify-content: flex-start;
      }
    }

    @media (max-width: 600px) {
      .scene-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ScenesPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly filterCategory = signal('');

  private readonly allScenes: BusinessScene[] = [
    // ========== 已上线场景（2个） ==========
    {
      id: 's01-leakage',
      name: 'DMA分区漏损评估',
      description: '基于水量平衡与夜间流量分析，智能识别漏损风险时段与候选区域，支撑管网漏损排查。',
      category: '供水',
      status: 'online',
      icon: '💧',
      route: '/s01-leakage',
    },
    {
      id: 'water-quality-anomaly',
      name: '水质异常智能检测',
      description: '基于通用时序异常检测算法，自定义数据与参数，自动识别水质指标突变点。',
      category: '供水',
      status: 'online',
      icon: '🧪',
      route: '/operators',
      queryParams: { kind: 'algorithm' },
    },

    // ========== 即将上线场景（10个） ==========
    {
      id: 'water-demand-forecast',
      name: '区域供水量预测',
      description: '结合气象、节假日等多因子，精准预测未来时段区域用水量，辅助调度决策。',
      category: '供水',
      status: 'coming',
      icon: '📈',
    },
    {
      id: 'pressure-optimization',
      name: '管网压力智能调度',
      description: '基于压力监测数据与水力模型，动态优化泵站压力，降低漏损与能耗。',
      category: '供水',
      status: 'coming',
      icon: '⚙️',
    },
    {
      id: 'secondary-water-safety',
      name: '二次供水安全分析',
      description: '多维度监测二次供水水质与设备状态，异常预警保障末端供水安全。',
      category: '供水',
      status: 'coming',
      icon: '🏢',
    },
    {
      id: 'pipe-burst-warning',
      name: '管网爆管风险预警',
      description: '结合压力、流量时序特征与管网属性，提前预警爆管风险，减少事故影响。',
      category: '供水',
      status: 'coming',
      icon: '⚠️',
    },
    {
      id: 'data-quality-governance',
      name: '时序数据质量治理',
      description: '自动化完成缺失值修复、异常值处理、数据对齐，提升水务数据可用率。',
      category: '运营',
      status: 'coming',
      icon: '🔧',
    },
    {
      id: 'pump-energy-optimization',
      name: '泵站能耗优化分析',
      description: '分析泵站运行工况与能效水平，给出优化建议，降低运行成本。',
      category: '运营',
      status: 'coming',
      icon: '⚡',
    },
    {
      id: 'sewer-sediment-warning',
      name: '排水管网淤积预警',
      description: '基于液位、流量数据识别淤积特征，指导管网清疏计划，提升排水能力。',
      category: '排水',
      status: 'coming',
      icon: '🕳️',
    },
    {
      id: 'sewage-process-optimize',
      name: '污水处理工艺优化',
      description: '智能优化曝气、加药等工艺参数，保障出水达标同时降低药耗能耗。',
      category: '排水',
      status: 'coming',
      icon: '♻️',
    },
    {
      id: 'source-water-forecast',
      name: '水源地水质趋势预测',
      description: '预测水源地关键水质指标变化趋势，为原水调度与处理工艺调整提供依据。',
      category: '供水',
      status: 'coming',
      icon: '🌊',
    },
    {
      id: 'pipe-life-assessment',
      name: '管网资产寿命评估',
      description: '综合管龄、材质、爆管历史等多维度数据，评估管网剩余寿命与更新优先级。',
      category: '运营',
      status: 'coming',
      icon: '📅',
    },
  ];

  readonly displayScenes = computed(() => {
    const category = this.filterCategory();
    if (!category) return this.allScenes;
    return this.allScenes.filter((scene) => scene.category === category);
  });

  handleSceneClick(scene: BusinessScene): void {
    if (scene.status !== 'online' || !scene.route) return;
    void this.router.navigate([scene.route], {
      queryParams: scene.queryParams,
    });
  }
}
