import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { ProductsPageComponent } from './products-page.component';
import { Product } from '../products.types';

const PRODUCT: Product = {
  id: 'p1',
  companyId: 'c1',
  name: 'CRM License',
  description: 'Annual subscription',
  sku: 'SKU-100',
  unitPrice: 1200,
  gstRate: 18,
  type: 'PRODUCT',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [PRODUCT],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('ProductsPageComponent', () => {
  let fixture: ComponentFixture<ProductsPageComponent>;
  let component: ProductsPageComponent;
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
      imports: [ProductsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/products?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();
  }

  it('renders the products returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('CRM License');
    expect(text).toContain('SKU-100');
    expect(text).toContain('Product');
    expect(text).toContain('1,200');
    expect(text).toContain('18');
    expect(text).toContain('Active');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows Add Product for SALES (create is allowed)', async () => {
    await setup('SALES');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Add Product');
    expect(labels).toContain('Edit');
  });

  it('hides Activate/Deactivate from MANAGER', async () => {
    await setup('MANAGER');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Deactivate');
    expect(labels).not.toContain('Activate');
    expect(labels).toContain('Edit');
  });

  it('shows Deactivate for OWNER', async () => {
    await setup('OWNER');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Deactivate');
  });

  it('search applies on Enter and resets to page 1', async () => {
    await setup();

    const input = (fixture.nativeElement as HTMLElement).querySelector('#filterSearch') as HTMLInputElement;
    input.value = 'license';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const req = httpMock.expectOne(
      (r) => r.url === '/api/products' && r.params.get('search') === 'license'
    );
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    expect(component.filters().search).toBe('license');
  });

  it('type filter change refetches immediately', async () => {
    await setup();

    component.onFilterChange('type', 'SERVICE');

    const req = httpMock.expectOne(
      (r) => r.url === '/api/products' && r.params.get('type') === 'SERVICE'
    );
    req.flush({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  });

  it('isActive filter maps to a boolean query param', async () => {
    await setup();

    component.onFilterChange('isActive', 'false');

    const req = httpMock.expectOne(
      (r) => r.url === '/api/products' && r.params.get('isActive') === 'false'
    );
    req.flush({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  });

  it('clear filters removes all params and refreshes', async () => {
    await setup();
    component.filters.set({ search: 'x', type: 'SERVICE', isActive: 'false' });

    component.clearFilters();

    const req = httpMock.expectOne('/api/products?page=1&limit=10');
    expect(req.request.params.has('search')).toBe(false);
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('deactivates after confirmation and refreshes', async () => {
    await setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onToggleActive(PRODUCT);
    expect(confirmSpy).toHaveBeenCalledWith('Deactivate this product?');

    const putReq = httpMock.expectOne('/api/products/p1');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ isActive: false });
    putReq.flush({ success: true, data: { product: { ...PRODUCT, isActive: false } } });

    const listReq = httpMock.expectOne('/api/products?page=1&limit=10');
    listReq.flush(LIST_RESPONSE);
    expect(component.success()).toBe('Product deactivated.');
  });

  it('activates an inactive product after confirmation', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onToggleActive({ ...PRODUCT, isActive: false });
    expect(window.confirm).toHaveBeenCalledWith('Activate this product?');

    const putReq = httpMock.expectOne('/api/products/p1');
    expect(putReq.request.body).toEqual({ isActive: true });
    putReq.flush({ success: true, data: { product: PRODUCT } });

    const listReq = httpMock.expectOne('/api/products?page=1&limit=10');
    listReq.flush(LIST_RESPONSE);
    expect(component.success()).toBe('Product activated.');
  });

  it('does not deactivate when confirmation is dismissed', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onToggleActive(PRODUCT);

    httpMock.expectNone((r) => r.url === '/api/products/p1');
  });

  it('opens the view from a View action and closes it', async () => {
    await setup();
    const viewBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'View') as HTMLButtonElement;

    viewBtn.click();
    fixture.detectChanges();

    expect(component.viewing()?.id).toBe('p1');
    const viewEl = fixture.nativeElement.querySelector('app-product-view') as HTMLElement | null;
    expect(viewEl).toBeTruthy();
    expect(viewEl?.textContent).toContain('Product details');

    component.onViewClosed();
    fixture.detectChanges();

    expect(component.viewing()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-product-view')).toBeNull();
  });

  it('opens the edit form with the selected product', async () => {
    await setup();

    component.onEdit(PRODUCT);

    expect(component.showForm()).toBe(true);
    expect(component.editing()?.id).toBe('p1');
  });

  it('shows the empty state when nothing matches', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/products?page=1&limit=10')
      .flush({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No products found.');
    expect(text).toContain('Add Product');
  });

  it('surfaces a friendly error when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/products?page=1&limit=10')
      .flush({ success: false, error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });

  it('shows a 403 permission message from the backend', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/products?page=1&limit=10')
      .flush({ success: false, error: { message: 'nope' } }, { status: 403, statusText: 'Forbidden' });

    expect(component.error()).toBe('You do not have permission to perform this action.');
  });

  it('changes the page size and refetches from page 1', async () => {
    await setup();

    component.onPageSize('25');

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/products' &&
        r.params.get('limit') === '25' &&
        r.params.get('page') === '1'
    );
    req.flush({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } });
    expect(component.limit()).toBe(25);
  });

  it('ignores an unchanged page size', async () => {
    await setup();

    component.onPageSize('10');

    httpMock.expectNone((r) => r.url === '/api/products');
  });

  it('exposes the available page sizes', async () => {
    await setup();
    expect(component.pageSizes).toEqual([10, 25, 50, 100]);
  });

  it('tracks the active filter count and enables Clear Filters', async () => {
    await setup();
    expect(component.activeFilterCount()).toBe(0);
    expect(component.hasActiveFilters()).toBe(false);

    component.filters.set({ search: 'x', type: 'SERVICE', isActive: 'true' });
    expect(component.activeFilterCount()).toBe(3);
    expect(component.hasActiveFilters()).toBe(true);
  });

  it('computes the visible row range from backend metadata', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/products?page=1&limit=10')
      .flush({ ...LIST_RESPONSE, pagination: { page: 1, limit: 10, total: 25, totalPages: 3 } });

    expect(component.rangeStart()).toBe(1);
    expect(component.rangeEnd()).toBe(10);

    component.nextPage();
    httpMock
      .expectOne((r) => r.url === '/api/products' && r.params.get('page') === '2')
      .flush({ ...LIST_RESPONSE, pagination: { page: 2, limit: 10, total: 25, totalPages: 3 } });

    expect(component.page()).toBe(2);
    expect(component.rangeStart()).toBe(11);
    expect(component.rangeEnd()).toBe(20);
  });

  it('shows a loading state before the list resolves', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading products');
    httpMock.expectOne('/api/products?page=1&limit=10').flush(LIST_RESPONSE);
  });

  it('renders mobile-friendly product cards alongside the table', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).not.toBeNull();
    expect(el.querySelector('ul')).not.toBeNull();
    expect(el.textContent).toContain('Unit Price');
    expect(el.textContent).toContain('GST Rate');
  });
});
