import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FollowUpsService } from './follow-ups.service';
import { FollowUp } from '../follow-ups.types';

const FOLLOWUP: FollowUp = {
  id: 'f1',
  companyId: 'c1',
  leadId: 'lead-1',
  lead: { id: 'lead-1', name: 'John Thomas', phoneNumber: '555-0100' },
  clientId: null,
  client: null,
  assignedTo: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  type: 'CALL',
  subject: 'Follow up regarding quotation',
  description: 'Discuss quotation',
  dueAt: '2026-10-10T10:00:00.000Z',
  status: 'PENDING',
  completedAt: null,
  createdBy: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [FOLLOWUP],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FollowUpsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists follow-ups with default pagination', () => {
    service.getFollowUps().subscribe((res) => expect(res).toEqual(LIST_RESPONSE));

    const req = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('serializes filters into query params', () => {
    service
      .getFollowUps({
        page: 2,
        limit: 10,
        search: 'quotation',
        status: 'PENDING',
        type: 'CALL',
        assignedTo: 'u1',
        from: '2026-10-01',
        to: '2026-10-31',
      })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/follow-ups' && r.params.get('status') === 'PENDING'
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.get('search')).toBe('quotation');
    expect(req.request.params.get('type')).toBe('CALL');
    expect(req.request.params.get('assignedTo')).toBe('u1');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('to')).toBe('2026-10-31');
    req.flush(LIST_RESPONSE);
  });

  it('omits empty filters from query params', () => {
    service.getFollowUps({ page: 1, limit: 10, status: '', type: undefined }).subscribe();

    const req = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(LIST_RESPONSE);
  });

  it('fetches a single follow-up', () => {
    service.getFollowUp('f1').subscribe((res) => expect(res.data.followup.id).toBe('f1'));

    const req = httpMock.expectOne('/api/follow-ups/f1');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { followup: FOLLOWUP } });
  });

  it('creates a follow-up with POST', () => {
    const data = {
      leadId: 'lead-1',
      assignedTo: 'u1',
      type: 'CALL' as const,
      subject: 'Follow up regarding quotation',
      dueAt: '2026-10-10T10:00:00.000Z',
    };
    service.createFollowUp(data).subscribe();

    const req = httpMock.expectOne('/api/follow-ups');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    req.flush({ success: true, data: { followup: FOLLOWUP } });
  });

  it('updates a follow-up with PUT', () => {
    service.updateFollowUp('f1', { status: 'COMPLETED' }).subscribe();

    const req = httpMock.expectOne('/api/follow-ups/f1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'COMPLETED' });
    req.flush({ success: true, data: { followup: { ...FOLLOWUP, status: 'COMPLETED' } } });
  });

  it('deletes a follow-up with DELETE', () => {
    service.deleteFollowUp('f1').subscribe((res) => expect(res.data?.id).toBe('f1'));

    const req = httpMock.expectOne('/api/follow-ups/f1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Follow-up deleted successfully', data: { id: 'f1' } });
  });
});
