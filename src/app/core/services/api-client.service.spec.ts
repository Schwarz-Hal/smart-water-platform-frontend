import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiClient } from './api-client.service';

describe('ApiClient', () => {
  let api: ApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('unwraps the platform response envelope and serializes query values', () => {
    let response: { id: number } | undefined;
    api
      .get<{ id: number }>('/api/v1/example', { enabled: true, limit: 20, ignored: undefined })
      .subscribe((value) => {
        response = value;
      });

    const request = http.expectOne('/api/v1/example?enabled=true&limit=20');
    expect(request.request.method).toBe('GET');
    request.flush({ code: 0, message: 'ok', data: { id: 7 }, trace_id: 'trace-test' });
    expect(response).toEqual({ id: 7 });
  });
});
