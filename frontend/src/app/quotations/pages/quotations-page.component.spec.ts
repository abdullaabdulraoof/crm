import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { QuotationsPageComponent } from './quotations-page.component';
import { Quotation } from '../quotations.types';

const QUOTATION: Quotation = {
  id: 'q1',
  companyId: 'c1',
  quotationNumber: 'QT-2026-0001',
  leadId: 'l1',
  lead: { id: 'l1', name: 'Acme Prospect', phoneNumber: '9876543210' },
  clientId: null,
  client: null,
  createdBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  items: [
    {
      id: 'i1',
      productId: null,
      product: null,
      description: 'Consulting',
      quantity: 2,
      unitPrice: 1000,
      gstRate: 18,
      amount: 2000,
    },
  ],
  subtotal: 2000,
  discountAmount: 100,
  taxAmount: 360,
  totalAmount: 2260,
  validUntil: '2026-11-01T00:00:00.000Z',
  status: 'DRAFT',
  notes: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [QUOTATION],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const EMPTY_RESPONSE = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('QuotationsPageComponent', () => {
  let fixture: ComponentFixture<QuotationsPageComponent>;
  let component: QuotationsPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function setup(role = 'OWNER'): Promise<void> {
    seedUser(role);
    await TestBed.configureTestingModule({
      imports: [QuotationsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuotationsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/quotations?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();
  }

  it('renders the quotations returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('QT-2026-0001');
    expect(text).toContain('Acme Prospect');
    expect(text).toContain('Lead');
    expect(text).toContain('DRAFT');
    expect(text).toContain('2,260');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows Add/Edit but not Delete for SALES', async () => {
    await setup('SALES');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Add Quotation');
    expect(labels).toContain('Edit');
    expect(labels).not.toContain('Delete');
  });

  it('hides Delete from MANAGER but shows it for OWNER', async () => {
    await setup('MANAGER');
    let labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Delete');

    TestBed.resetTestingModule();
    await setup('OWNER');
    labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Delete');
  });

  it('search applies on Enter and resets to page 1', async () => {
    await setup();
    const input = (fixture.nativeElement as HTMLElement).querySelector('#filterSearch') as HTMLInputElement;
    input.value = 'QT-2026';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const req = httpMock.expectOne(
      (r) => r.url === '/api/quotations' && r.params.get('search') === 'QT-2026'
    );
    expect(req.request.params.get('page')).toBe('1');
    req.flush(EMPTY_RESPONSE);
    expect(component.filters().search).toBe('QT-2026');
  });

  it('status filter change refetches immediately', async () => {
    await setup();
    component.onFilterChange('status', 'SENT');

    const req = httpMock.expectOne(
      (r) => r.url === '/api/quotations' && r.params.get('status') === 'SENT'
    );
    req.flush(EMPTY_RESPONSE);
  });

  it('clear filters removes all params and refreshes', async () => {
    await setup();
    component.filters.set({ search: 'x', status: 'SENT', from: '', to: '' });

    component.clearFilters();

    const req = httpMock.expectOne('/api/quotations?page=1&limit=10');
    expect(req.request.params.has('search')).toBe(false);
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('opens the read-only view for a quotation', async () => {
    await setup();
    component.onView(QUOTATION);
    fixture.detectChanges();

    expect(component.viewing()?.id).toBe('q1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Quotation QT-2026-0001');
  });

  it('deletes after confirmation and refreshes', async () => {
    await setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onDelete(QUOTATION);
    expect(confirmSpy).toHaveBeenCalledWith('Delete this quotation?');

    const delReq = httpMock.expectOne('/api/quotations/q1');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ success: true });

    const listReq = httpMock.expectOne('/api/quotations?page=1&limit=10');
    listReq.flush(EMPTY_RESPONSE);
    expect(component.success()).toBe('Quotation deleted.');
  });

  it('does not delete when confirmation is dismissed', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onDelete(QUOTATION);

    httpMock.expectNone((r) => r.url === '/api/quotations/q1');
  });

  it('shows the empty state when nothing matches', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [QuotationsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuotationsPageComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/quotations?page=1&limit=10').flush(EMPTY_RESPONSE);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No quotations found.');
    expect(text).toContain('Add Quotation');
  });

  it('surfaces a friendly error when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [QuotationsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuotationsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/quotations?page=1&limit=10')
      .flush({ success: false, error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });
});
