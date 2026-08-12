import { Component, input } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideFormlyCore } from '@ngx-formly/core';
import { applicationConfig, Meta, moduleMetadata, StoryObj } from '@storybook/angular';

import {
  FormlyJsonFieldTypeComponent,
  FormlySliderFieldTypeComponent,
  OperatorParameterFormComponent,
} from '../components/operator-parameter-form.component';
import { StatusChipComponent } from '../components/status-chip.component';

@Component({
  selector: 'app-token-catalog-story',
  template: `
    <section class="catalog" [class.workspace-dark]="dark()">
      <h2>{{ dark() ? 'DAG 深色工作区' : '水务浅色主题' }}</h2>
      <div class="swatches">
        <span class="primary">主色</span><span class="success">成功</span
        ><span class="warning">警告</span><span class="danger">错误</span>
      </div>
      <article>
        <strong>表面与文字</strong>
        <p>语义令牌同时驱动 Material、Dockview、Rete、AG Grid 和 ECharts。</p>
      </article>
    </section>
  `,
  styles: `
    .catalog {
      min-height: 260px;
      padding: 24px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-page);
      color: var(--sw-text);
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 20px 0;
    }
    .swatches span {
      padding: 16px 24px;
      border-radius: var(--sw-radius-md);
      font-weight: 700;
    }
    .primary {
      background: var(--sw-primary);
      color: var(--sw-on-primary);
    }
    .success {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .warning {
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
    }
    .danger {
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    article {
      padding: 18px;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
    }
  `,
})
class TokenCatalogStoryComponent {
  readonly dark = input(false);
}

@Component({
  selector: 'app-workspace-preview-story',
  template: `
    <section class="workspace">
      <button class="launcher left" aria-label="打开算子目录">☰</button>
      <button class="launcher right" aria-label="打开节点属性">⚙</button>
      <aside class="panel catalog-panel">
        <header>算子目录</header>
        <input placeholder="搜索名称或编码" />
        <strong>数据源</strong>
        <div class="operator">Dataset channel</div>
        <strong>算法</strong>
        <div class="operator">Data quality score</div>
      </aside>
      <main class="canvas">
        <div class="node">Dataset channel</div>
        <div class="connection"></div>
        <div class="node result">Data quality score</div>
      </main>
      <aside class="panel inspector">
        <header>节点属性</header>
        <p>Data quality score</p>
        <label>最低分数 <input value="80" /></label>
      </aside>
      <aside class="panel binding">
        <header>运行绑定</header>
        <p>数据资产：尚未绑定</p>
      </aside>
    </section>
  `,
  styles: `
    .workspace {
      position: relative;
      display: grid;
      grid-template-columns: 220px minmax(320px, 1fr) 240px;
      grid-template-rows: 260px 150px;
      min-height: 420px;
      overflow: hidden;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-canvas);
      color: var(--sw-text);
    }
    .panel {
      padding: 14px;
      background: var(--sw-surface);
      border-color: var(--sw-border);
      border-style: solid;
    }
    .panel header {
      font-weight: 800;
      margin-bottom: 12px;
    }
    .catalog-panel {
      grid-row: 1/3;
      border-width: 0 1px 0 0;
    }
    .canvas {
      position: relative;
      grid-row: 1/3;
      overflow: hidden;
      background-image:
        linear-gradient(var(--sw-canvas-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--sw-canvas-grid) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .inspector {
      border-width: 0 0 1px 1px;
    }
    .binding {
      border-width: 0 0 0 1px;
    }
    .operator,
    input {
      box-sizing: border-box;
      width: 100%;
      margin: 7px 0;
      padding: 9px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-raised);
      color: var(--sw-text);
    }
    .node {
      position: absolute;
      left: 60px;
      top: 120px;
      padding: 14px;
      border: 2px solid var(--sw-primary);
      border-radius: 10px;
      background: var(--sw-node);
      font-weight: 700;
    }
    .node.result {
      left: 260px;
    }
    .connection {
      position: absolute;
      left: 185px;
      top: 143px;
      width: 76px;
      border-top: 3px solid var(--sw-connection);
    }
    .launcher {
      position: absolute;
      z-index: 3;
      top: 8px;
      width: 44px;
      height: 44px;
      border: 1px solid var(--sw-border);
      border-radius: 12px;
      background: var(--sw-surface);
      color: var(--sw-primary);
    }
    .launcher.left {
      left: 8px;
    }
    .launcher.right {
      right: 8px;
    }
    @media (max-width: 800px) {
      .workspace {
        display: block;
      }
      .panel {
        display: none;
      }
      .canvas {
        min-height: 420px;
      }
    }
  `,
})
class WorkspacePreviewStoryComponent {}

const meta: Meta<TokenCatalogStoryComponent> = {
  title: 'Design System/Water Platform',
  component: TokenCatalogStoryComponent,
};

export default meta;
type Story = StoryObj<TokenCatalogStoryComponent>;

export const LightTokens: Story = { args: { dark: false } };
export const DarkWorkspaceTokens: Story = { args: { dark: true } };

export const Statuses: StoryObj = {
  render: () => ({
    template: `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <app-status-chip status="success" label="成功" />
        <app-status-chip status="running" label="运行中" />
        <app-status-chip status="warning" label="需要注意" />
        <app-status-chip status="failed" label="失败" />
      </div>
    `,
  }),
  decorators: [moduleMetadata({ imports: [StatusChipComponent] })],
};

export const DockableWorkspace: StoryObj = {
  render: () => ({ template: `<app-workspace-preview-story />` }),
  decorators: [moduleMetadata({ imports: [WorkspacePreviewStoryComponent] })],
};

export const OperatorParameters: StoryObj = {
  render: () => ({
    props: {
      schema: {
        type: 'object',
        required: ['window', 'threshold'],
        properties: {
          window: { type: 'integer', title: '窗口长度', minimum: 3, maximum: 96 },
          threshold: { type: 'number', title: '异常阈值', minimum: 0, maximum: 10 },
          enabled: { type: 'boolean', title: '启用修复' },
          strategy: { type: 'string', title: '处理策略', enum: ['flag_only', 'median'] },
        },
      },
      uiSchema: { threshold: { widget: 'slider', step: 0.1 } },
      model: { window: 12, threshold: 3, enabled: true, strategy: 'flag_only' },
    },
    template: `<div style="max-width:520px"><app-operator-parameter-form [schema]="schema" [uiSchema]="uiSchema" [model]="model" /></div>`,
  }),
  decorators: [
    moduleMetadata({ imports: [OperatorParameterFormComponent] }),
    applicationConfig({
      providers: [
        provideAnimationsAsync(),
        provideFormlyCore({
          types: [
            { name: 'sw-slider', component: FormlySliderFieldTypeComponent },
            { name: 'sw-json', component: FormlyJsonFieldTypeComponent },
          ],
        }),
      ],
    }),
  ],
};
