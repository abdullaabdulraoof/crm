import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ProductsService } from './products.service';
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

describe('ProductsService', () => {
  let service: ProductsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists products with default pagination', () => {
    service.getProducts().subscribe((res) => expect(res).toEqual(LIST_RESPONSE));

    const req = httpMock.expectOne('/api/products?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('serializes search/type/isActive filters into query params', () => {
    service
      .getProducts({ page: 2, limit: 10, search: 'license', type: 'SERVICE', isActive: 'false' })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/products' && r.params.get('search') === 'license');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('type')).toBe('SERVICE');
    expect(req.request.params.get('isActive')).toBe('false');
    req.flush(LIST_RESPONSE);
  });

  it('omits empty filters from query params', () => {
    service.getProducts({ page: 1, limit: 10, search: '', type: undefined }).subscribe();

    const req = httpMock.expectOne('/api/products?page=1&limit=10');
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.has('type')).toBe(false);
    req.flush(LIST_RESPONSE);
  });

  it('fetches a single product', () => {
    service.getProduct('p1').subscribe((res) => expect(res.data.product.id).toBe('p1'));

    const req = httpMock.expectOne('/api/products/p1');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { product: PRODUCT } });
  });

  it('creates a product with POST', () => {
    const data = { name: 'CRM License', unitPrice: 1200, gstRate: 18, type: 'PRODUCT' as const };
    service.createProduct(data).subscribe();

    const req = httpMock.expectOne('/api/products');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    req.flush({ success: true, data: { product: PRODUCT } });
  });

  it('updates a product with PUT (no companyId/createdAt sent)', () => {
    service.updateProduct('p1', { name: 'Renamed', unitPrice: 99 }).subscribe();

    const req = httpMock.expectOne('/api/products/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Renamed', unitPrice: 99 });
    expect(req.request.body.companyId).toBeUndefined();
    expect(req.request.body.createdAt).toBeUndefined();
    req.flush({ success: true, data: { product: PRODUCT } });
  });

  it('deactivates with isActive false', () => {
    service.deactivateProduct('p1').subscribe();

    const req = httpMock.expectOne('/api/products/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ success: true, data: { product: { ...PRODUCT, isActive: false } } });
  });

  it('activates with isActive true', () => {
    service.activateProduct('p1').subscribe();

    const req = httpMock.expectOne('/api/products/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isActive: true });
    req.flush({ success: true, data: { product: PRODUCT } });
  });
});
