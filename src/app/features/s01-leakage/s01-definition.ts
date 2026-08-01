export type S01VisualizationKind = 'line' | 'bar' | 'line_with_flags' | 'risk_timeline';

export interface S01Port {
  name: string;
  label: string;
  unit?: string;
  optional?: boolean;
}

export interface S01Parameter {
  key: string;
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface S01NodeDefinition {
  code: string;
  title: string;
  shortTitle: string;
  description: string;
  inputs: S01Port[];
  outputs: S01Port[];
  parameters: S01Parameter[];
  visualization: { kind: S01VisualizationKind; label: string; series: string[] };
  status: 'builtin_ready' | 'depends_on_mapping';
}

export const S01_NODES: S01NodeDefinition[] = [
  {
    code: 'qscore_v1',
    title: '数据质量与时序标准化',
    shortTitle: '质量门',
    description: '校验缺失、重复、时间粒度与原始/修复值选择；不改写原始记录。',
    inputs: [
      { name: 'flow', label: '流量时序', unit: 'm³/h' },
      { name: 'pressure', label: '压力时序', unit: 'm', optional: true },
    ],
    outputs: [{ name: 'quality_score', label: '质量评分', unit: '0–1' }],
    parameters: [
      {
        key: 'expected_interval_seconds',
        label: '采样间隔',
        description: '连续性校验使用的目标间隔。',
        value: 900,
        defaultValue: 900,
        min: 1,
        step: 1,
      },
    ],
    visualization: { kind: 'line', label: '质量趋势与缺失标记', series: ['quality_score'] },
    status: 'builtin_ready',
  },
  {
    code: 's01_water_balance_v1',
    title: 'DMA 水量平衡',
    shortTitle: '水量平衡',
    description: '对齐入口、出口、授权用水和已知损失，输出未计量水量筛查信号。',
    inputs: [
      { name: 'inlet_flow', label: 'DMA 入口流量', unit: 'm³/h' },
      { name: 'outlet_flow', label: '出口/转输流量', unit: 'm³/h', optional: true },
      { name: 'authorized_consumption', label: '授权用水', unit: 'm³/h' },
      { name: 'known_losses', label: '已知损失', unit: 'm³/h', optional: true },
    ],
    outputs: [{ name: 'unaccounted_flow', label: '未计量平衡量', unit: 'm³/h' }],
    parameters: [
      {
        key: 'expected_interval_seconds',
        label: '采样间隔',
        description: '积分与时序对齐使用的间隔。',
        value: 900,
        defaultValue: 900,
        min: 1,
        step: 1,
      },
    ],
    visualization: {
      kind: 'line',
      label: '系统输入与未计量平衡量',
      series: ['system_input_flow', 'unaccounted_flow'],
    },
    status: 'depends_on_mapping',
  },
  {
    code: 's01_minimum_night_flow_v1',
    title: '最小夜流（MNF）',
    shortTitle: '最小夜流',
    description: '在配置化夜间窗口中扣除合法夜间用水，形成 DMA 级夜流超额证据。',
    inputs: [
      { name: 'net_inflow', label: 'DMA 净入流', unit: 'm³/h' },
      { name: 'legitimate_night_use', label: '合法夜间用水', unit: 'm³/h', optional: true },
    ],
    outputs: [{ name: 'night_flow_excess', label: '夜流超额', unit: 'm³/h' }],
    parameters: [
      {
        key: 'night_start_hour',
        label: '夜间起始时刻',
        description: '0–23 点，允许跨日窗口。',
        value: 2,
        defaultValue: 2,
        min: 0,
        max: 23,
        step: 1,
      },
      {
        key: 'night_end_hour',
        label: '夜间结束时刻',
        description: '不能与起始时刻相同。',
        value: 4,
        defaultValue: 4,
        min: 0,
        max: 23,
        step: 1,
      },
      {
        key: 'min_nights',
        label: '最少夜间样本天数',
        description: '不足时节点应明确失败，不生成结论。',
        value: 7,
        defaultValue: 7,
        min: 1,
        step: 1,
      },
    ],
    visualization: { kind: 'bar', label: '每日夜流超额', series: ['night_flow_excess'] },
    status: 'depends_on_mapping',
  },
  {
    code: 's01_pressure_correction_v1',
    title: '压力修正',
    shortTitle: '压力修正',
    description: '把观测流量归一到声明的参考压力，避免把压力波动直接误判为漏损。',
    inputs: [
      { name: 'flow', label: '观测流量', unit: 'm³/h' },
      { name: 'pressure', label: '观测压力', unit: 'm' },
    ],
    outputs: [{ name: 'corrected_flow', label: '压力修正流量', unit: 'm³/h' }],
    parameters: [
      {
        key: 'reference_pressure',
        label: '参考压力',
        description: '由 DMA 业务口径确认，未配置时将用中位压力。',
        value: 30,
        defaultValue: 30,
        min: 0.01,
        step: 0.1,
      },
      {
        key: 'pressure_exponent',
        label: '压力指数',
        description: '必须由业务或校准记录支持。',
        value: 0.5,
        defaultValue: 0.5,
        min: 0.01,
        max: 2,
        step: 0.05,
      },
    ],
    visualization: {
      kind: 'line',
      label: '观测流量与压力修正流量',
      series: ['observed_flow', 'corrected_flow'],
    },
    status: 'depends_on_mapping',
  },
  {
    code: 's01_seasonal_baseline_v1',
    title: '季节基线与残差',
    shortTitle: '正常基线',
    description: '以同周期历史值构成可解释基线，输出与观测值对齐的残差。',
    inputs: [{ name: 'value', label: '处理后流量', unit: 'm³/h' }],
    outputs: [{ name: 'residual', label: '季节残差', unit: 'm³/h' }],
    parameters: [
      {
        key: 'season_length',
        label: '季节长度',
        description: '15 分钟粒度下一天通常为 96 点。',
        value: 96,
        defaultValue: 96,
        min: 2,
        step: 1,
      },
    ],
    visualization: {
      kind: 'line',
      label: '观测、基线与残差',
      series: ['observed_value', 'baseline', 'residual'],
    },
    status: 'builtin_ready',
  },
  {
    code: 's01_ewma_cusum_v1',
    title: '持续残差检测',
    shortTitle: 'EWMA/CUSUM',
    description: '用 EWMA 与双侧 CUSUM 区分持续偏移和短时尖峰。',
    inputs: [{ name: 'residual', label: '季节残差', unit: 'm³/h' }],
    outputs: [{ name: 'change_score', label: '持续变化得分', unit: '≥ 0' }],
    parameters: [
      {
        key: 'ewma_alpha',
        label: 'EWMA α',
        description: '对近期残差的敏感度。',
        value: 0.2,
        defaultValue: 0.2,
        min: 0.01,
        max: 1,
        step: 0.01,
      },
      {
        key: 'ewma_limit',
        label: 'EWMA 阈值',
        description: '标准化 EWMA 超限阈值。',
        value: 3,
        defaultValue: 3,
        min: 0.01,
        step: 0.1,
      },
      {
        key: 'cusum_k',
        label: 'CUSUM 容忍值 k',
        description: '小幅变化的容忍区间。',
        value: 0.5,
        defaultValue: 0.5,
        min: 0.01,
        step: 0.1,
      },
      {
        key: 'cusum_h',
        label: 'CUSUM 决策阈值 h',
        description: '累计偏移报警阈值。',
        value: 5,
        defaultValue: 5,
        min: 0.01,
        step: 0.1,
      },
      {
        key: 'min_consecutive_points',
        label: '最少连续点数',
        description: '避免将单点异常直接升级为事件。',
        value: 4,
        defaultValue: 4,
        min: 1,
        step: 1,
      },
    ],
    visualization: {
      kind: 'line_with_flags',
      label: 'EWMA/CUSUM 与持续异常标记',
      series: ['ewma', 'change_score'],
    },
    status: 'builtin_ready',
  },
  {
    code: 's01_evidence_fusion_v1',
    title: '漏损证据融合',
    shortTitle: '证据融合',
    description: '融合质量、夜流、水量平衡、残差和持续性证据，形成需人工核验的 DMA 候选。',
    inputs: [
      { name: 'quality_score', label: '质量评分', unit: '0–1' },
      { name: 'night_flow_score', label: '夜流证据', unit: '0–1' },
      { name: 'balance_score', label: '平衡证据', unit: '0–1' },
      { name: 'residual_score', label: '残差证据', unit: '0–1' },
      { name: 'persistence_score', label: '持续性证据', unit: '0–1' },
    ],
    outputs: [{ name: 'risk_score', label: 'DMA 漏损筛查风险', unit: '0–1' }],
    parameters: [
      {
        key: 'quality_floor',
        label: '质量门槛',
        description: '质量不足时抑制候选结论。',
        value: 0.6,
        defaultValue: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'candidate_threshold',
        label: '候选阈值',
        description: '达到该风险得分才可能生成候选。',
        value: 0.65,
        defaultValue: 0.65,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'min_consecutive_points',
        label: '最少连续点数',
        description: '连续满足风险阈值的最小长度。',
        value: 4,
        defaultValue: 4,
        min: 1,
        step: 1,
      },
    ],
    visualization: {
      kind: 'risk_timeline',
      label: 'DMA 风险时间线与候选事件',
      series: ['risk_score'],
    },
    status: 'builtin_ready',
  },
];

export const S01_REQUIRED_CHANNELS = [
  { label: 'DMA 入口流量', detail: '必需 · m³/h · 与入口表或总表绑定' },
  { label: 'DMA 出口/转输流量', detail: '可选 · m³/h · 没有时必须在运行配置中显式说明' },
  { label: '授权用水 / 合法夜间用水', detail: '必需 · 同统计周期 · 不能用未知值替代 0' },
  { label: '压力时序', detail: '压力修正时必需 · 正压 · 单位需确认' },
];
