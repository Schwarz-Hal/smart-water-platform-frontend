import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

const authPath = (url: string) =>
  url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/refresh');

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const notifications = inject(NotificationService);

  if (authPath(request.url)) {
    return next(request);
  }

  const authorize = () => {
    const token = auth.accessToken();
    return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  };

  return next(authorize()).pipe(
    catchError((error: unknown) => {
      const canRetry =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.headers.has('X-Smart-Water-Auth-Retry') &&
        !!auth.accessToken();

      if (!canRetry) {
        if (!(error instanceof HttpErrorResponse && error.status === 401)) {
          notifications.error(error);
        }
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap(() =>
          next(authorize().clone({ setHeaders: { 'X-Smart-Water-Auth-Retry': '1' } })),
        ),
        catchError((refreshError: unknown) => {
          notifications.error(refreshError, '登录状态已失效，请重新登录。');
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
