import { BeijingTimePipe } from './beijing-time.pipe';

describe('BeijingTimePipe', () => {
  const pipe = new BeijingTimePipe();

  it('renders UTC timestamps in Asia/Shanghai regardless of browser timezone', () => {
    expect(pipe.transform('2026-08-12T07:30:00Z')).toBe('2026-08-12 15:30:00');
  });

  it('keeps explicit offsets from being shifted twice', () => {
    expect(pipe.transform('2026-08-12T15:30:00+08:00')).toBe('2026-08-12 15:30:00');
  });

  it('renders missing values as an em dash', () => {
    expect(pipe.transform(null)).toBe('—');
  });
});
