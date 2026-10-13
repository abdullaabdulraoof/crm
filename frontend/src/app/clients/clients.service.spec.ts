import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ClientsService } from './clients.service';
import { Client } from './clients.types';

const CLIENT: Client = {
  id: 'c1',
  name: 'ABC Company',
  phoneNumber: '555-0100',
  email: 'abc@example.com',
  address: '1 Main St',
  gstNo: null,
  clientType: 'BUSINESS',
  notes: '',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

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
      { id: 'c1', name: 'ABC Company', phoneNumber: '555-0100', email: 'abc@example.com' },
    ];

    service.getClients().subscribe((res) => expect(res).toEqual(clients));

    const req = httpMock.expectOne('/api/clients/options');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { clients } });
  });

  it('fetches a paginated client list with query params', () => {
    service.getClientsList({ page: 2, limit: 25, search: 'abc', clientType: 'BUSINESS' }).subscribe(
      (res) => {
        expect(res.data).toEqual([CLIENT]);
        expect(res.pagination.total).toBe(1);
      }
    );

    const req = httpMock.expectOne(
      '/api/clients?page=2&limit=25&search=abc&clientType=BUSINESS'
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: [CLIENT],
      pagination: { page: 2, limit: 25, total: 1, totalPages: 1 },
    });
  });

  it('fetches a single client', () => {
    service.getClient('c1').subscribe((res) => expect(res.data.client).toEqual(CLIENT));

    const req = httpMock.expectOne('/api/clients/c1');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { client: CLIENT } });
  });

  it('creates a client', () => {
    service
      .createClient({
        name: 'ABC Company',
        phoneNumber: '555-0100',
        email: null,
        address: null,
        gstNo: null,
        clientType: 'BUSINESS',
        notes: null,
      })
      .subscribe((res) => expect(res.data.client).toEqual(CLIENT));

    const req = httpMock.expectOne('/api/clients');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('ABC Company');
    req.flush({ success: true, data: { client: CLIENT } });
  });

  it('updates a client with PUT', () => {
    service.updateClient('c1', { name: 'Renamed' }).subscribe();

    const req = httpMock.expectOne('/api/clients/c1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('Renamed');
    req.flush({ success: true, data: { client: CLIENT } });
  });

  it('deletes a client', () => {
    service.deleteClient('c1').subscribe((res) => expect(res.success).toBe(true));

    const req = httpMock.expectOne('/api/clients/c1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Client deleted successfully' });
  });
});
