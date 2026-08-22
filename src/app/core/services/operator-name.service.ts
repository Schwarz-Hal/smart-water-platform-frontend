import { Injectable } from '@angular/core';

/**
 * Resolves user-facing names for stable operator codes.
 *
 * Operator codes are part of the workflow contract and must remain stable;
 * this map only affects presentation. Unknown codes deliberately fall back
 * to the name supplied by the API so external operators remain usable.
 */
@Injectable({ providedIn: 'root' })
export class OperatorNameService {
  private readonly names: Readonly<Record<string, string>> = {
    dataset_asset_v1: '整体数据资产',
    dataset_channel_v1: '数据通道',
    time_range_v1: '时间范围',
    align_timeseries_v1: '时序对齐',
    unit_convert_v1: '单位换算',
    deduplicate_dataset_v1: '重复数据处理',
    resample_dataset_v1: '时序重采样',
    missing_value_repair_dataset_v1: '缺失值修复',
    outlier_repair_dataset_v1: '异常值处理',
    data_quality_profile_v1: '数据质量分析',
    dataset_publish_v1: '发布数据版本',
    qscore_v1: '数据质量评分',
    seasonal_naive: '季节朴素预测',
    chronos2_flow_forecast: 'Chronos-2 流量预测',
    hampel: 'Hampel 异常检测',
    quality_gate_v1: '数据质量门',
    s01_water_balance_v1: 'DMA 水量平衡',
    s01_minimum_night_flow_v1: '最小夜间流量分析',
    s01_pressure_correction_v1: '压力修正',
    s01_seasonal_baseline_v1: '季节基线残差',
    s01_ewma_cusum_v1: '持续残差变化检测',
    s01_evidence_normalize_v1: '漏损证据归一化',
    s01_evidence_fusion_v1: '漏损证据融合',
    s01_assessment_report_v1: 'S01 漏损评估报告',
    s01_assessment_v1: 'S01 漏损评估',
    candidate_table_v1: '漏损候选列表',
    seasonal_robust_anomaly: '季节性鲁棒基线异常检测',
    water_tf_joint_forecast: '水务非平稳时频协同预测',
    water_probabilistic_forecast: '水务外生概率预测与风险评估',
    water_adaptive_anomaly: '水务自适应多变量异常检测',
    water_relation_anomaly: '水务形态-关系多证据异常检测',
    water_feature_binding_v1: '水务特征与角色绑定',
  };

  displayName(code: string | null | undefined, fallback?: string | null): string {
    if (code && this.names[code]) return this.names[code];
    return fallback?.trim() || code || '未命名算子';
  }

  matches(
    code: string | null | undefined,
    fallback: string | null | undefined,
    term: string,
  ): boolean {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return true;
    return `${this.displayName(code, fallback)} ${fallback || ''} ${code || ''}`
      .toLowerCase()
      .includes(normalized);
  }
}
