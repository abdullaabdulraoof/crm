import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadFormComponent } from './lead-form.component';
import { Lead } from '../leads.types';

const LEAD: Lead = {
  id: 'lead-1',
  companyId: 'c1',
  createdBy: 'u1',
  name: 'Acme Corp',
  phoneNumber: '555-0100',
  email: 'a@b.com',
  source: 'WEBSITE',
  status: 'NEW',
  assignedTo: null,
  nextFollowUpAt: null,
  notes: null,
  convertedClientId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('LeadFormComponent', () => {
  let fixture: ComponentFixture<LeadFormComponent>;
  let component: LeadFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('creates the component with an empty required form', () => {
    expect(component).toBeTruthy();
    expect(component.form.invalid).toBe(true);
    expect(component.isEdit).toBe(false);
  });

  it('blocks submission while required fields are missing', () => {
    component.onSubmit();

    expect(component.submitting()).toBe(false);
    httpMock.expectNone('/api/leads');
  });

  it('shows an inline validation message for a short name', () => {
    component.form.patchValue({ name: 'A' });
    component.form.get('name')?.markAsTouched();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Name is required (min 2 characters).');
  });

  it('creates a lead and emits closed(true)', () => {
    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({ name: 'New Lead', phoneNumber: '555-0100' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/leads');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('New Lead');
    req.flush({ success: true, data: { lead: LEAD } });

    expect(component.submitting()).toBe(false);
    expect(closedWith).toBe(true);
  });

  it('populates the form in edit mode and PUTs updates', () => {
    component.lead = LEAD;
    component.ngOnChanges({ lead: {} as never, isOpen: {} as never });
    expect(component.isEdit).toBe(true);
    expect(component.form.getRawValue().name).toBe('Acme Corp');

    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({ status: 'CONTACTED' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/leads/lead-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status).toBe('CONTACTED');
    req.flush({ success: true, data: { lead: LEAD } });

    expect(closedWith).toBe(true);
  });

  it('surfaces a backend validation error without closing', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({ name: 'New Lead', phoneNumber: '555-0100' });
    component.onSubmit();

    httpMock.expectOne('/api/leads').flush(
      { success: false, error: { message: 'Lead already exists' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('Lead already exists');
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
