import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiEnvelope, QueryValue } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, query?: Record<string, QueryValue>): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(path, { params: this.params(query) })
      .pipe(map((response) => response.data));
  }

  post<T, B>(path: string, body: B): Observable<T> {
    return this.http.post<ApiEnvelope<T>>(path, body).pipe(map((response) => response.data));
  }

  patch<T, B>(path: string, body: B): Observable<T> {
    return this.http.patch<ApiEnvelope<T>>(path, body).pipe(map((response) => response.data));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiEnvelope<T>>(path).pipe(map((response) => response.data));
  }
  deleteWithBody<T, B>(path: string, body: B): Observable<T> {
    return this.http.delete<ApiEnvelope<T>>(path, { body }).pipe(map((response) => response.data));
  }
  put<T, B>(path: string, body: B): Observable<T> {
    return this.http.put<ApiEnvelope<T>>(path, body).pipe(map((response) => response.data));
  }

  private params(query?: Record<string, QueryValue>): HttpParams {
    return Object.entries(query ?? {}).reduce((params, [key, value]) => {
      return value === undefined || value === null ? params : params.set(key, String(value));
    }, new HttpParams());
  }
}
