import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LeadsService } from './leads.service';
import { LeadFormData } from '../leads.types';

const LEAD = {
  id: 'lead-1',
  companyId: 'c1',
  createdBy: 'u1',
  name: 'Acme Corp',
  phoneNumber: '555-0100',
  email: 'a@b.com',
  source: 'WEBSITE',
  status: 'NEW',
  assignedTo: { id: 'u2', name: 'Sam', email: 'sam@x.com' },
  nextFollowUpAt: null,
  notes: null,
  convertedClientId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [LEAD],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const LEAD_RESPONSE = { success: true, data: { lead: LEAD } };

const FORM_DATA: LeadFormData = {
  name: 'Acme Corp',
  phoneNumber: '555-0100',
  email: 'a@b.com',
  source: 'WEBSITE',
  status: 'NEW',
  assignedTo: 'u2',
  nextFollowUpAt: null,
  notes: null,
};

describe('LeadsService', () => {
  let service: LeadsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LeadsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('gets leads with no filters by default', () => {
    service.getLeads().subscribe((res) => expect(res.data).toEqual([LEAD]));

    const req = httpMock.expectOne('/api/leads');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('gets leads with explicit page and limit', () => {
    service.getLeads({ page: 3, limit: 25 }).subscribe();

    const req = httpMock.expectOne('/api/leads?page=3&limit=25');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('serializes filters and sorting into query params', () => {
    service
      .getLeads({
        page: 2,
        limit: 10,
        search: 'acme',
        status: 'NEW',
        source: 'WEBSITE',
        assignedTo: 'u2',
        from: '2026-01-01',
        to: '2026-01-31',
        sortBy: 'name',
        sortOrder: 'asc',
      })
      .subscribe();

    const req = httpMock.expectOne(
      '/api/leads?page=2&limit=10&search=acme&status=NEW&source=WEBSITE&assignedTo=u2&from=2026-01-01&to=2026-01-31&sortBy=name&sortOrder=asc'
    );
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('gets a single lead by id', () => {
    service.getLead('lead-1').subscribe((res) => expect(res.data.lead.id).toBe('lead-1'));

    const req = httpMock.expectOne('/api/leads/lead-1');
    expect(req.request.method).toBe('GET');
    req.flush(LEAD_RESPONSE);
  });

  it('creates a lead', () => {
    service.createLead(FORM_DATA).subscribe();

    const req = httpMock.expectOne('/api/leads');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(FORM_DATA);
    req.flush(LEAD_RESPONSE);
  });

  it('updates a lead by id', () => {
    service.updateLead('lead-1', { status: 'CONTACTED' }).subscribe();

    const req = httpMock.expectOne('/api/leads/lead-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'CONTACTED' });
    req.flush(LEAD_RESPONSE);
  });

  it('deletes a lead by id', () => {
    service.deleteLead('lead-1').subscribe((res) => expect(res.success).toBe(true));

    const req = httpMock.expectOne('/api/leads/lead-1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Lead deleted' });
  });
});
