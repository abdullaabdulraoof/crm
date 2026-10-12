import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FollowUpFormComponent } from './follow-up-form.component';
import { FollowUp } from '../follow-ups.types';

const FOLLOWUP: FollowUp = {
  id: 'f1',
  companyId: 'c1',
  leadId: 'lead-1',
  lead: { id: 'lead-1', name: 'Acme Corp', phoneNumber: '555-0100' },
  clientId: null,
  client: null,
  assignedTo: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  type: 'CALL',
  subject: 'Call about quotation',
  description: 'Discuss pricing',
  dueAt: '2026-10-10T10:00:00.000Z',
  status: 'PENDING',
  completedAt: null,
  createdBy: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function flushInit(httpMock: HttpTestingController): void {
  httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
  httpMock.expectOne((r) => r.url === '/api/leads' && r.params.get('limit') === '100').flush({
    success: true,
    data: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
}

describe('FollowUpFormComponent', () => {
  let fixture: ComponentFixture<FollowUpFormComponent>;
  let component: FollowUpFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FollowUpFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushInit(httpMock);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('creates the component with an invalid empty form', () => {
    expect(component).toBeTruthy();
    expect(component.form.invalid).toBe(true);
    expect(component.isEdit).toBe(false);
  });

  it('blocks submission while required fields are missing', () => {
    component.onSubmit();

    expect(component.submitting()).toBe(false);
    httpMock.expectNone('/api/follow-ups');
  });

  it('requires a related target before saving', () => {
    component.form.patchValue({
      assignedTo: 'u1',
      subject: 'Call about quotation',
      dueAt: '2026-10-10T10:00',
    });
    component.onSubmit();

    expect(component.submitting()).toBe(false);
    expect(component.formError()).toBe('Select a lead or client to relate this follow-up to.');
    httpMock.expectNone('/api/follow-ups');
  });

  it('creates a follow-up with ISO dueAt and leadId, emits closed(true)', () => {
    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({
      relatedType: 'LEAD',
      leadId: 'lead-1',
      assignedTo: 'u1',
      type: 'CALL',
      subject: 'Call about quotation',
      dueAt: '2026-10-10T10:00',
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/follow-ups');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.leadId).toBe('lead-1');
    expect(req.request.body.clientId).toBeNull();
    expect(req.request.body.assignedTo).toBe('u1');
    expect(req.request.body.subject).toBe('Call about quotation');
    expect(req.request.body.dueAt).toBe(new Date('2026-10-10T10:00').toISOString());
    expect(req.request.body.companyId).toBeUndefined();
    expect(req.request.body.completedAt).toBeUndefined();
    req.flush({ success: true, data: { followup: FOLLOWUP } });

    expect(component.submitting()).toBe(false);
    expect(closedWith).toBe(true);
  });

  it('populates edit mode and PUTs with status', () => {
    component.followup = FOLLOWUP;
    component.ngOnChanges({ followup: {} as never, isOpen: {} as never });
    expect(component.isEdit).toBe(true);
    expect(component.form.getRawValue().subject).toBe('Call about quotation');
    expect(component.form.getRawValue().leadId).toBe('lead-1');

    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({ status: 'COMPLETED' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/follow-ups/f1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status).toBe('COMPLETED');
    req.flush({ success: true, data: { followup: { ...FOLLOWUP, status: 'COMPLETED' } } });

    expect(closedWith).toBe(true);
  });

  it('surfaces a backend validation error without closing', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({
      relatedType: 'LEAD',
      leadId: 'lead-1',
      assignedTo: 'u1',
      subject: 'Call about quotation',
      dueAt: '2026-10-10T10:00',
    });
    component.onSubmit();

    httpMock.expectOne('/api/follow-ups').flush(
      { success: false, error: { message: 'Due Date must be a future date.' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('Due Date must be a future date.');
    expect(closed).toBe(false);
    expect(component.submitting()).toBe(false);
  });

  it('emits cancelled when cancel is clicked', () => {
    let cancelled = false;
    component.cancelled.subscribe(() => (cancelled = true));

    component.onCancel();
    expect(cancelled).toBe(true);
  });
});
