import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('fetches client options from /api/clients/options', () => {
    const clients = [
      { id: 'c1', name: 'ABC Company', phoneNumber: '555-0100' },
      { id: 'c2', name: 'Beta LLC', phoneNumber: '555-0200' },
    ];

    service.getClients().subscribe((res) => expect(res).toEqual(clients));

    const req = httpMock.expectOne('/api/clients/options');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { clients } });
  });
});
