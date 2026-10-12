import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';

import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('attaches the Bearer token when authenticated', () => {
    localStorage.setItem('crm.auth.token', 'secret-token');

    http.get('/api/users').subscribe();
    const req = httpMock.expectOne('/api/users');

    expect(req.request.headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('sends no Authorization header when not authenticated', () => {
    http.get('/api/users').subscribe();
    const req = httpMock.expectOne('/api/users');

    expect(req.request.headers.has('Authorization')).toBe(false);
  });
});