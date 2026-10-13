import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadFormComponent } from './lead-form.component';
import { Lead } from '../leads.types';
import { Client } from '../../clients/clients.types';

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
  clientId: null,
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
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
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
    component.lead = LEAD;
    component.ngOnChanges({ lead: {} as never, isOpen: {} as never });
    fixture.detectChanges();

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

  const CLIENT_OPTION = {
    id: 'cl-1',
    name: 'Globex',
    phoneNumber: '555-0200',
    email: 'globex@example.com',
  };

  it('loads client options and renders them in the dropdown', () => {
    component['loadClients']();
    httpMock
      .expectOne('/api/clients/options')
      .flush({ success: true, data: { clients: [CLIENT_OPTION] } });
    fixture.detectChanges();

    expect(component.clients().length).toBe(1);
    const options = fixture.nativeElement.querySelectorAll('#clientId option');
    expect(options.length).toBe(2);
    expect(options[1].textContent).toContain('Globex');
  });

  it('populates name, phone and email when selecting an existing client', () => {
    component.clients.set([CLIENT_OPTION]);
    component.form.patchValue({ clientId: 'cl-1' });

    component.onClientChange('cl-1');

    expect(component.selectedClientId()).toBe('cl-1');
    expect(component.form.getRawValue().name).toBe('Globex');
    expect(component.form.getRawValue().phoneNumber).toBe('555-0200');
    expect(component.form.getRawValue().email).toBe('globex@example.com');
  });

  it('overwrites existing values with the selected client (lead represents the client)', () => {
    component.clients.set([CLIENT_OPTION]);
    component.form.patchValue({ name: 'Existing Lead', phoneNumber: '111-1111' });

    component.onClientChange('cl-1');

    expect(component.form.getRawValue().name).toBe('Globex');
    expect(component.form.getRawValue().phoneNumber).toBe('555-0200');
  });

  it('adds a newly created client, selects it, and populates the lead', () => {
    const created: Client = {
      id: 'cl-2',
      name: 'Initech',
      phoneNumber: '555-0300',
      email: 'initech@example.com',
      address: '',
      gstNo: null,
      clientType: 'BUSINESS',
      notes: '',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    component.onClientSaved(created);

    expect(component.selectedClientId()).toBe('cl-2');
    expect(component.form.getRawValue().clientId).toBe('cl-2');
    expect(component.clients().some((c) => c.id === 'cl-2')).toBe(true);
    expect(component.form.getRawValue().name).toBe('Initech');
    expect(component.form.getRawValue().phoneNumber).toBe('555-0300');
    expect(component.form.getRawValue().email).toBe('initech@example.com');
  });

  it('hides Name/Phone/Email in Add mode until a client is selected', () => {
    fixture.detectChanges();

    expect(component.showContactFields).toBe(false);
    expect(fixture.nativeElement.querySelector('#clientId')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#name')).toBeNull();
    expect(fixture.nativeElement.querySelector('#phoneNumber')).toBeNull();
    expect(fixture.nativeElement.querySelector('#email')).toBeNull();
  });

  it('shows read-only Name/Phone/Email after a client is selected in Add mode', () => {
    component.clients.set([CLIENT_OPTION]);

    component.onClientChange('cl-1');
    fixture.detectChanges();

    expect(component.showContactFields).toBe(true);
    expect(component.contactReadOnly).toBe(true);

    const name = fixture.nativeElement.querySelector('#name') as HTMLInputElement;
    const phone = fixture.nativeElement.querySelector('#phoneNumber') as HTMLInputElement;
    expect(name).toBeTruthy();
    expect(name.readOnly).toBe(true);
    expect(phone.readOnly).toBe(true);
  });

  it('clears and hides the contact fields when the selection is cleared in Add mode', () => {
    component.clients.set([CLIENT_OPTION]);
    component.onClientChange('cl-1');
    fixture.detectChanges();

    component.onClientChange('');
    fixture.detectChanges();

    expect(component.selectedClientId()).toBe('');
    expect(component.form.getRawValue().name).toBe('');
    expect(component.form.getRawValue().phoneNumber).toBe('');
    expect(component.form.getRawValue().email).toBe('');
    expect(fixture.nativeElement.querySelector('#name')).toBeNull();
  });

  it('keeps contact fields visible and editable when editing a lead without a client', () => {
    component.lead = LEAD;
    component.ngOnChanges({ lead: {} as never, isOpen: {} as never });
    fixture.detectChanges();

    expect(component.showContactFields).toBe(true);
    expect(component.contactReadOnly).toBe(false);

    const name = fixture.nativeElement.querySelector('#name') as HTMLInputElement;
    expect(name).toBeTruthy();
    expect(name.readOnly).toBe(false);
  });

  it('makes contact fields read-only when editing a lead linked to a client', () => {
    component.lead = { ...LEAD, clientId: 'cl-1' };
    component.ngOnChanges({ lead: {} as never, isOpen: {} as never });
    fixture.detectChanges();

    expect(component.showContactFields).toBe(true);
    expect(component.contactReadOnly).toBe(true);

    const name = fixture.nativeElement.querySelector('#name') as HTMLInputElement;
    expect(name.readOnly).toBe(true);
  });

  it('shows an error when client options fail to load', () => {
    component['loadClients']();
    httpMock
      .expectOne('/api/clients/options')
      .flush({ success: false }, { status: 500, statusText: 'Server Error' });

    expect(component.clientsError()).toBe('Failed to load clients');
    expect(component.clients()).toEqual([]);
  });

  it('includes the selected clientId when saving a lead', () => {
    component.form.patchValue({ name: 'New Lead', phoneNumber: '555-0100', clientId: 'cl-9' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/leads');
    expect(req.request.body.clientId).toBe('cl-9');
    req.flush({ success: true, data: { lead: { ...LEAD, clientId: 'cl-9' } } });
  });

  it('ignores escape while the inline client form is open', () => {
    let cancelled = false;
    component.cancelled.subscribe(() => (cancelled = true));

    component.openClientForm();
    component.onEscape();
    expect(cancelled).toBe(false);

    component.closeClientForm();
    component.onEscape();
    expect(cancelled).toBe(true);
  });
});
