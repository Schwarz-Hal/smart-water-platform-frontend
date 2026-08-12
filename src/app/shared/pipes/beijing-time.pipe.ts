import { DatePipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

const beijingDatePipe = new DatePipe('en-US');

export function formatBeijingTime(
  value: string | number | Date | null | undefined,
  format = 'yyyy-MM-dd HH:mm:ss',
): string {
  if (value === null || value === undefined || value === '') return '—';
  return beijingDatePipe.transform(value, format, '+0800') ?? '—';
}

@Pipe({ name: 'beijingTime', standalone: true })
export class BeijingTimePipe implements PipeTransform {
  transform(
    value: string | number | Date | null | undefined,
    format = 'yyyy-MM-dd HH:mm:ss',
  ): string {
    return formatBeijingTime(value, format);
  }
}
