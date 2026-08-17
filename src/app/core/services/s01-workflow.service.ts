import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { DataAssetSelection } from '../models/api.models';
import { ApiClient } from './api-client.service';

/** S01 四路数据绑定角色（后端模板要求全部必填） */
export type S01BindingRole = 'inlet_flow' | 'authorized_consumption' | 'legitimate_night_use' | 'pressure';

/** 工作流 graph 中存储的数据绑定格式（与 workflow-editor 一致） */
export interface WorkflowStoredBinding {
  dataset_asset_id: number;
  dataset_version_id: number;
  monitor_point_id?: number;
  metric_code?: string;
  value_source?: 'raw' | 'processed';
  start?: string | null;
  end?: string | null;
}

/** 工作流 graph 节点（精简结构） */
export interface WorkflowGraphNode {
  id: string;
  node_code: string;
  node_version?: string;
  parameters?: Record<string, unknown>;
  ui?: { position?: { x: number; y: number } };
  [key: string]: unknown;
}

/** 工作流 graph 结构（精简） */
export interface WorkflowGraph {
  contract_version: string;
  nodes: WorkflowGraphNode[];
  edges: Array<{ source: { node_id: string; port: string }; target: { node_id: string; port: string } }>;
  outputs: Array<{ node_id: string; port: string }>;
  bindings?: Record<string, WorkflowStoredBinding>;
  [key: string]: unknown;
}

/** 模板接口响应结构：{ template_code, graph } */
export interface S01TemplateResponse {
  template_code: string;
  graph: WorkflowGraph;
}

/** S01 模板解析结果 */
export interface S01TemplateInfo {
  /** 角色 → 数据节点 ID */
  dataNodeIds: Record<S01BindingRole, string | null>;
  /** S01 算法节点 ID（用于 parameter_overrides） */
  algorithmNodeId: string | null;
  /** 模板 code（用于 from-template 创建） */
  templateCode: string;
  /** 模板版本号（用于 from-template 创建） */
  templateVersion: string;
  /** 原始模板 graph */
  graph: WorkflowGraph;
}

/** S01 运行参数 */
export interface S01RunParams {
  quality_gate_min: number;
  expected_interval_seconds: number;
}

/** S01 运行提交结果 */
export interface S01RunSubmission {
  run_id: string;
  task_id: string;
  workflow_id: number;
  version_id: number;
}

/**
 * S01 场景工作流服务
 *
 * 封装从"获取 S01 内置模板 → 创建草稿 → 绑定数据 → 发布 → 运行"的完整链路，
 * 使黑盒场景页无需暴露工作流编排细节。
 *
 * 所有接口统一走 /api/v1/workflows* 体系，不再使用已废弃的 /api/v1/s01/* 专用接口。
 */
@Injectable({ providedIn: 'root' })
export class S01WorkflowService {
  private readonly api = inject(ApiClient);

  private static readonly TEMPLATE_PATH = '/api/v1/workflows/templates/s01-leakage';

  /** 黑盒页暴露的四路必填角色（后端模板要求全部绑定） */
  private static readonly REQUIRED_ROLES: S01BindingRole[] = [
    'inlet_flow',
    'authorized_consumption',
    'legitimate_night_use',
    'pressure',
  ];

  // ---------------------------------------------------------------------------
  // 模板解析
  // ---------------------------------------------------------------------------

  /** 获取 S01 内置模板并解析出数据节点 / 算法节点映射 */
  async getTemplateInfo(): Promise<S01TemplateInfo> {
    // 模板接口返回 { template_code, graph }，ApiClient 已解包 data 层
    const response = await firstValueFrom(
      this.api.get<S01TemplateResponse>(S01WorkflowService.TEMPLATE_PATH),
    );
    return this.parseTemplate(response);
  }

  /**
   * 从模板响应中解析：
   * 1. 数据节点（dataset_channel_v1）→ 角色映射（通过 parameters.binding_key）
   * 2. S01 算法节点 ID（用于 parameter_overrides）
   * 3. template_code / version（用于 from-template）
   */
  private parseTemplate(response: S01TemplateResponse): S01TemplateInfo {
    const { template_code, graph } = response;

    const dataNodes = (graph.nodes || []).filter((n) =>
      ['dataset_channel_v1', 'dataset_asset_v1'].includes(n.node_code),
    );

    const dataNodeIds: Record<S01BindingRole, string | null> = {
      inlet_flow: null,
      authorized_consumption: null,
      legitimate_night_use: null,
      pressure: null,
    };

    // 通过 parameters.binding_key 精确匹配（后端约定字段）
    for (const node of dataNodes) {
      const bindingKey = String(node.parameters?.['binding_key'] || '');
      if (bindingKey && (S01WorkflowService.REQUIRED_ROLES as string[]).includes(bindingKey)) {
        dataNodeIds[bindingKey as S01BindingRole] = node.id;
      }
    }

    // 算法节点：node_code 包含 s01_assessment（模板中为 s01_assessment_v1）
    const algorithmNode =
      (graph.nodes || []).find((n) => /s01_assessment|s01_water_balance/i.test(n.node_code)) ||
      (graph.nodes || []).find((n) => /s01|leakage|dma/i.test(n.node_code)) ||
      null;

    // 版本号：从算法节点的 node_version 推断，fallback 1.0.0
    const templateVersion = algorithmNode?.node_version || '1.0.0';

    return {
      dataNodeIds,
      algorithmNodeId: algorithmNode?.id ?? null,
      templateCode: template_code,
      templateVersion,
      graph,
    };
  }

  // ---------------------------------------------------------------------------
  // 数据绑定转换
  // ---------------------------------------------------------------------------

  /** 将 DataAssetSelection 转换为工作流存储格式 */
  toWorkflowBinding(selection: DataAssetSelection): WorkflowStoredBinding {
    return {
      dataset_asset_id: selection.asset.id,
      dataset_version_id: selection.version.id,
      monitor_point_id: selection.channel?.monitor_point_id,
      metric_code: selection.channel?.metric_code,
      value_source: selection.value_source,
    };
  }

  // ---------------------------------------------------------------------------
  // 完整运行链路
  // ---------------------------------------------------------------------------

  /**
   * 一键运行 S01 场景：
   * 1. 获取 S01 内置模板 graph
   * 2. 直接用 graph 创建工作流草稿
   * 3. 获取草稿（含 draft_revision）
   * 4. 绑定四路数据到 graph.bindings 并保存
   * 5. 发布工作流
   * 6. 提交运行（传入 input_bindings + parameter_overrides）
   *
   * @param workflowName 工作流名称（即 DMA 分区名称）
   * @param bindings 角色 → 数据选择 映射
   * @param params 分析参数
   * @param onStep 进度回调
   */
  async runScene(
    workflowName: string,
    bindings: Record<S01BindingRole, DataAssetSelection | null>,
    params: S01RunParams,
    onStep?: (step: string) => void,
  ): Promise<S01RunSubmission> {
    // 1. 获取模板信息（解析数据节点 / 算法节点 / template_code）
    onStep?.('加载场景模板…');
    const template = await this.getTemplateInfo();

    // 校验：所有必填角色都必须在模板中找到对应数据节点
    const missingRoles = S01WorkflowService.REQUIRED_ROLES.filter(
      (role) => !template.dataNodeIds[role],
    );
    if (missingRoles.length > 0) {
      throw new Error(
        `场景模板解析失败：未找到数据节点「${missingRoles.join('、')}」。请联系后端确认模板结构是否变更。`,
      );
    }
    if (!template.algorithmNodeId) {
      throw new Error('场景模板解析失败：未找到 S01 算法节点。请联系后端确认模板结构是否变更。');
    }

    // 2. 直接用模板 graph 创建工作流（S01 专用模板未注册到 workflow-templates，不能走 from-template）
    onStep?.('创建工作流草稿…');
    const workflowCode = `s01-${Date.now().toString(36)}`;
    const created = await firstValueFrom(
      this.api.post<{ id: number }, object>('/api/v1/workflows', {
        workflow_code: workflowCode,
        workflow_name: workflowName.trim(),
        description: 'S01 DMA 分区漏损评估（黑盒场景自动创建）',
        visibility: 'private',
        graph: template.graph,
      }),
    );
    const workflowId = created.id;

    // 3. 获取草稿详情（拿到 draft_graph 和 draft_revision）
    onStep?.('读取草稿结构…');
    const workflowDetail = await firstValueFrom(
      this.api.get<Record<string, unknown>>(`/api/v1/workflows/${workflowId}`),
    );
    const draftGraph = workflowDetail['draft_graph'] as WorkflowGraph;
    const draftRevision = Number(workflowDetail['draft_revision'] || 1);

    // 4. 绑定数据到 graph.bindings 并保存
    onStep?.('配置数据绑定…');
    const graphBindings: Record<string, WorkflowStoredBinding> = {};
    for (const role of S01WorkflowService.REQUIRED_ROLES) {
      const selection = bindings[role];
      const nodeId = template.dataNodeIds[role];
      if (selection && nodeId) {
        graphBindings[nodeId] = this.toWorkflowBinding(selection);
      }
    }
    const savedGraph: WorkflowGraph = {
      ...draftGraph,
      bindings: { ...(draftGraph.bindings || {}), ...graphBindings },
    };
    await firstValueFrom(
      this.api.put<Record<string, unknown>, object>(
        `/api/v1/workflows/${workflowId}/draft`,
        { graph: savedGraph, expected_revision: draftRevision },
      ),
    );

    // 5. 发布工作流
    onStep?.('发布工作流…');
    const published = await firstValueFrom(
      this.api.post<{ id: number }, object>(`/api/v1/workflows/${workflowId}/publish`, {}),
    );
    const versionId = published.id;

    // 6. 提交运行
    onStep?.('提交运行…');
    const inputBindings: Record<string, WorkflowStoredBinding> = { ...graphBindings };
    const parameterOverrides: Record<string, Record<string, unknown>> = {};
    if (template.algorithmNodeId) {
      parameterOverrides[template.algorithmNodeId] = {
        quality_gate_min: params.quality_gate_min,
        expected_interval_seconds: params.expected_interval_seconds,
      };
    }

    const runResult = await firstValueFrom(
      this.api.post<Record<string, unknown>, object>(
        `/api/v1/workflow-versions/${versionId}/runs`,
        { input_bindings: inputBindings, parameter_overrides: parameterOverrides },
      ),
    );

    const runId = String(runResult['run_id'] || runResult['id'] || '');
    const taskId = String(runResult['task_id'] || '');

    return { run_id: runId, task_id: taskId, workflow_id: workflowId, version_id: versionId };
  }
}
