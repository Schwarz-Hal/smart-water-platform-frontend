import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import {
  DataAsset,
  DataAssetSelection,
  DatasetChannel,
  DatasetVersion,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { DataAssetPickerComponent } from './data-asset-picker.component';

const asset: DataAsset = {
  id: 9,
  code: 'source-csv-u1',
  name: 'DMA 测试数据',
  source_id: 3,
  source_type: 'csv',
  created_at: '2026-07-30T00:00:00Z',
  latest_version: null,
};

const version: DatasetVersion = {
  id: 17,
  version_code: 'v17',
  status: 'ready',
  record_count: 288,
  time_start: '2026-07-01T00:00:00Z',
  time_end: '2026-07-03T23:45:00Z',
  created_at: '2026-07-30T00:00:00Z',
};

const channels: DatasetChannel[] = [
  {
    monitor_point_id: 41,
    source_key: 'inlet-01',
    point_name: 'DMA 入口',
    metric_code: 'flow',
    metric_name: '流量',
    unit: 'm3/h',
    record_count: 288,
    time_start: version.time_start,
    time_end: version.time_end,
    raw_available: true,
    processed_available: true,
  },
  {
    monitor_point_id: 42,
    source_key: 'pressure-01',
    point_name: 'DMA 压力',
    metric_code: 'pressure',
    metric_name: '压力',
    unit: 'MPa',
    record_count: 288,
    time_start: version.time_start,
    time_end: version.time_end,
    raw_available: true,
    processed_available: false,
  },
];

describe('DataAssetPickerComponent', () => {
  beforeEach(async () => {
    const api = {
      get: <T>(path: string) => {
        if (path === '/api/v1/datasets') return of([asset] as T);
        if (path === `/api/v1/datasets/${asset.id}/versions`) return of([version] as T);
        if (path === `/api/v1/dataset-versions/${version.id}/channels`) return of(channels as T);
        return of([] as T);
      },
    };
    await TestBed.configureTestingModule({
      imports: [DataAssetPickerComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ApiClient, useValue: api },
        { provide: NotificationService, useValue: { error: () => undefined } },
      ],
    }).compileComponents();
  });

  it('cascades from visible asset to its ready version and first real channel', () => {
    const fixture = TestBed.createComponent(DataAssetPickerComponent);
    fixture.detectChanges();
    const picker = fixture.componentInstance;

    expect(picker.assetId()).toBe(asset.id);
    expect(picker.versionId()).toBe(version.id);
    expect(picker.selectedChannel()?.monitor_point_id).toBe(41);
    expect(picker.valueSource()).toBe('processed');
  });

  it('falls back to raw when the chosen channel has no processed values', () => {
    const fixture = TestBed.createComponent(DataAssetPickerComponent);
    fixture.detectChanges();
    const picker = fixture.componentInstance;

    picker.selectPoint(42);

    expect(picker.selectedChannel()?.metric_code).toBe('pressure');
    expect(picker.valueSource()).toBe('raw');
  });

  it('restores the previously selected channel when the picker is recreated', () => {
    const fixture = TestBed.createComponent(DataAssetPickerComponent);
    const selection: DataAssetSelection = {
      asset,
      version,
      channels,
      channel: channels[1],
      value_source: 'raw',
    };
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    const picker = fixture.componentInstance;

    expect(picker.assetId()).toBe(asset.id);
    expect(picker.versionId()).toBe(version.id);
    expect(picker.selectedChannel()?.monitor_point_id).toBe(42);
    expect(picker.selectedChannel()?.metric_code).toBe('pressure');
    expect(picker.valueSource()).toBe('raw');
  });
});
