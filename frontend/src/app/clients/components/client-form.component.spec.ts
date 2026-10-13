import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientFormComponent } from './client-form.component';
import { Client } from '../clients.types';

const CLIENT: Client = {
  id: 'c1',
  name: 'ABC Company',
  phoneNumber: '555-0100',
  email: 'abc@example.com',
  address: '1 Main St',
  gstNo: '29ABCDE1234F1Z5',
  clientType: 'BUSINESS',
  notes: 'Key account',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ClientFormComponent', () => {
  let fixture: ComponentFixture<ClientFormComponent>;
  let component: ClientFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
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
    httpMock.expectNone('/api/clients');
  });

  it('shows an inline validation message for a short name', () => {
    component.form.patchValue({ name: 'A' });
    component.form.get('name')?.markAsTouched();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Name is required (2–200 characters).');
  });

  it('creates a client and emits closed(true)', () => {
    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({ name: 'New Client', clientType: 'BUSINESS' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/clients');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('New Client');
    expect(req.request.body.clientType).toBe('BUSINESS');
    expect(req.request.body.email).toBeNull();
    req.flush({ success: true, data: { client: CLIENT } });

    expect(component.submitting()).toBe(false);
    expect(closedWith).toBe(true);
  });

  it('emits the saved client', () => {
    let saved: Client | null = null;
    component.saved.subscribe((c) => (saved = c));

    component.form.patchValue({ name: 'New Client' });
    component.onSubmit();

    httpMock.expectOne('/api/clients').flush({ success: true, data: { client: CLIENT } });

    expect(saved).toEqual(CLIENT);
  });

  it('populates the form in edit mode and PUTs updates', () => {
    component.client = CLIENT;
    component.ngOnChanges({ client: {} as never, isOpen: {} as never });
    fixture.detectChanges();

    expect(component.isEdit).toBe(true);
    expect(component.form.get('name')?.value).toBe('ABC Company');
    expect(component.form.get('clientType')?.value).toBe('BUSINESS');

    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({ name: 'Renamed Co' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/clients/c1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('Renamed Co');
    req.flush({ success: true, data: { client: CLIENT } });

    expect(closedWith).toBe(true);
  });

  it('sends null for an empty optional gstNo', () => {
    component.form.patchValue({ name: 'New Client', gstNo: '   ' });
    component.onSubmit();

    const req = httpMock.expectOne('/api/clients');
    expect(req.request.body.gstNo).toBeNull();
    req.flush({ success: true, data: { client: CLIENT } });
  });

  it('shows a backend error banner and stays open on failure', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({ name: 'New Client' });
    component.onSubmit();

    httpMock.expectOne('/api/clients').flush(
      { success: false, error: { message: 'Client already exists' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('Client already exists');
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
