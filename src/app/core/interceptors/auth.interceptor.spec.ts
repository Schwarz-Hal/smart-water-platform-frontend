import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AuthUser, LoginResponse } from '../models/api.models';
import { NotificationService } from '../services/notification.service';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

const user: AuthUser = {
  id: 1,
  username: 'demo',
  display_name: 'Demo',
  status: 'active',
  roles: ['admin'],
  permissions: ['task:read'],
};
const loginResponse = (accessToken: string, refreshToken = 'refresh-1'): LoginResponse => ({
  access_token: accessToken,
  refresh_token: refreshToken,
  token_type: 'bearer',
  expires_in: 3600,
  user,
});

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: { error: vi.fn() } },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  function login(token = 'access-1'): void {
    auth.login('demo', 'secret').subscribe();
    http
      .expectOne('/api/v1/auth/login')
      .flush({ code: 0, message: 'ok', data: loginResponse(token), trace_id: 'trace-login' });
  }

  it('adds the browser-session bearer token to a protected request', () => {
    login();
    client.get('/api/v1/tasks/task-1').subscribe();
    const request = http.expectOne('/api/v1/tasks/task-1');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush({ code: 0, message: 'ok', data: {}, trace_id: 'trace-task' });
  });

  it('refreshes once after 401 and retries with the new access token', () => {
    login();
    client.get('/api/v1/tasks/task-1').subscribe();
    const initial = http.expectOne('/api/v1/tasks/task-1');
    initial.flush({ detail: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = http.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.body).toEqual({ refresh_token: 'refresh-1' });
    refresh.flush({
      code: 0,
      message: 'ok',
      data: loginResponse('access-2', 'refresh-2'),
      trace_id: 'trace-refresh',
    });

    const retry = http.expectOne('/api/v1/tasks/task-1');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    expect(retry.request.headers.get('X-Smart-Water-Auth-Retry')).toBe('1');
    retry.flush({ code: 0, message: 'ok', data: {}, trace_id: 'trace-task' });
  });
});
