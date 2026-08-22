import { describe, expect, it } from 'vitest';

import { OperatorNameService } from './operator-name.service';

describe('OperatorNameService', () => {
  const service = new OperatorNameService();

  it('localizes built-in operator codes without changing the code', () => {
    expect(service.displayName('s01_water_balance_v1', 'DMA water balance')).toBe('DMA 水量平衡');
    expect(service.displayName('qscore_v1', 'Data quality score')).toBe('数据质量评分');
    expect(service.displayName('seasonal_robust_anomaly', 'Seasonal robust baseline anomaly')).toBe('季节性鲁棒基线异常检测');
    expect(service.displayName('water_tf_joint_forecast', 'Water time-frequency joint forecast')).toBe('水务非平稳时频协同预测');
    expect(service.displayName('water_probabilistic_forecast', 'Water probabilistic forecast')).toBe('水务外生概率预测与风险评估');
    expect(service.displayName('water_adaptive_anomaly', 'Water adaptive multivariate anomaly detection')).toBe('水务自适应多变量异常检测');
    expect(service.displayName('water_relation_anomaly', 'Water morphology-relation anomaly detection')).toBe('水务形态-关系多证据异常检测');
  });

  it('keeps unknown and external operator names', () => {
    expect(service.displayName('rolling_zscore_anomaly_v1', 'Rolling Z-score')).toBe(
      'Rolling Z-score',
    );
    expect(service.displayName('external_operator_v1')).toBe('external_operator_v1');
  });

  it('searches localized names, fallback names, and codes', () => {
    expect(service.matches('qscore_v1', 'Data quality score', '质量评分')).toBe(true);
    expect(service.matches('qscore_v1', 'Data quality score', 'quality score')).toBe(true);
    expect(service.matches('qscore_v1', 'Data quality score', 'qscore_v1')).toBe(true);
  });
});
