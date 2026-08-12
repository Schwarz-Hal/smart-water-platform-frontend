import { DatePipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'beijingTime', standalone: true })
export class BeijingTimePipe implements PipeTransform {
  // Numeric date formats do not need locale-specific month or weekday data.
  private readonly datePipe = new DatePipe('en-US');

  transform(
    value: string | number | Date | null | undefined,
    format = 'yyyy-MM-dd HH:mm:ss',
  ): string {
    if (value === null || value === undefined || value === '') return '—';
    return this.datePipe.transform(value, format, '+0800') ?? '—';
  }
}
