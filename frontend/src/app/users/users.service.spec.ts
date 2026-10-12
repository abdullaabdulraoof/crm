import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('fetches assignable user options from /api/users/options', () => {
    const options = [
      { id: 'u1', name: 'Owner', role: 'OWNER' },
      { id: 'u2', name: 'Sam', role: 'SALES' },
    ];

    service.getAssignedToOptions().subscribe((res) => expect(res).toEqual(options));

    const req = httpMock.expectOne('/api/users/options');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { users: options } });
  });
});
