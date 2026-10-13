import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { ClientsPageComponent } from './clients-page.component';
import { Client } from '../clients.types';

const CLIENT: Client = {
  id: 'c1',
  name: 'ABC Company',
  phoneNumber: '555-0100',
  email: 'abc@example.com',
  address: '1 Main St',
  gstNo: '29ABCDE1234F1Z5',
  clientType: 'BUSINESS',
  notes: '',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [CLIENT],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('ClientsPageComponent', () => {
  let fixture: ComponentFixture<ClientsPageComponent>;
  let component: ClientsPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function setup(role = 'OWNER'): Promise<void> {
    seedUser(role);
    await TestBed.configureTestingModule({
      imports: [ClientsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/clients?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();
  }

  it('renders the clients returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ABC Company');
    expect(text).toContain('555-0100');
    expect(text).toContain('Business');
    expect(text).toContain('29ABCDE1234F1Z5');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows a delete button for OWNER', async () => {
    await setup('OWNER');
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).toContain('Delete');
  });

  it('hides the delete button for SALES', async () => {
    await setup('SALES');
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Delete');
  });

  it('opens the add-client form', async () => {
    await setup();
    const addBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Add Client') as HTMLButtonElement;

    addBtn.click();
    fixture.detectChanges();

    expect(component.showForm()).toBe(true);
    const formEl = fixture.nativeElement.querySelector('app-client-form');
    expect(formEl).toBeTruthy();
  });

  it('deletes a client after confirmation and refreshes', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onDelete(CLIENT);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/clients/c1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Client deleted successfully' });
    httpMock.expectOne('/api/clients?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();

    expect(component.success()).toBe('Client deleted successfully.');
    vi.restoreAllMocks();
  });

  it('does not delete when confirmation is cancelled', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onDelete(CLIENT);
    fixture.detectChanges();

    httpMock.expectNone('/api/clients/c1');
    vi.restoreAllMocks();
  });

  it('shows an error banner when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [ClientsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(ClientsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/clients?page=1&limit=10')
      .flush({ success: false }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });

  it('sends a type filter and resets to page 1', async () => {
    await setup();
    component.page.set(3);
    component.onFilterChange('clientType', 'BUSINESS');
    fixture.detectChanges();

    httpMock.expectOne('/api/clients?page=1&limit=10&clientType=BUSINESS').flush(LIST_RESPONSE);

    expect(component.page()).toBe(1);
  });
});
