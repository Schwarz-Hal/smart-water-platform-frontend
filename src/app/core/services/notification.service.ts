import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiFailure } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, '关闭', { duration: 3500, panelClass: ['notice-success'] });
  }

  error(error: unknown, fallback = '请求失败，请稍后重试。'): void {
    this.snackBar.open(this.describe(error, fallback), '关闭', {
      duration: 7000,
      panelClass: ['notice-error'],
    });
  }

  describe(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as ApiFailure | undefined;
      const message = body?.message ?? body?.detail ?? fallback;
      return body?.trace_id ? `${message}（trace: ${body.trace_id}）` : message;
    }
    return error instanceof Error ? error.message : fallback;
  }
}
