import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductFormComponent } from './product-form.component';
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

describe('ProductFormComponent', () => {
  let fixture: ComponentFixture<ProductFormComponent>;
  let component: ProductFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
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
    httpMock.expectNone('/api/products');
  });

  it('shows an inline validation message for a blank name', () => {
    component.form.patchValue({ name: ' ' });
    component.form.get('name')?.markAsTouched();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Name is required');
  });

  it('rejects a negative unit price client-side', () => {
    component.form.patchValue({ name: 'Widget', unitPrice: -5 });
    component.form.markAllAsTouched();
    component.onSubmit();

    expect(component.submitting()).toBe(false);
    httpMock.expectNone('/api/products');
  });

  it('creates a product and emits closed(true)', () => {
    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({
      name: 'CRM License',
      sku: 'SKU-100',
      type: 'PRODUCT',
      unitPrice: 1200,
      gstRate: 18,
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/products');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'CRM License',
      description: null,
      sku: 'SKU-100',
      unitPrice: 1200,
      gstRate: 18,
      type: 'PRODUCT',
    });
    expect(req.request.body.companyId).toBeUndefined();
    expect(req.request.body.isActive).toBeUndefined();
    expect(req.request.body.createdAt).toBeUndefined();
    req.flush({ success: true, data: { product: PRODUCT } });

    expect(component.submitting()).toBe(false);
    expect(closedWith).toBe(true);
  });

  it('sends empty sku/description as null', () => {
    component.form.patchValue({ name: 'No Sku', sku: '', description: '', unitPrice: 10 });
    component.onSubmit();

    const req = httpMock.expectOne('/api/products');
    expect(req.request.body.sku).toBeNull();
    expect(req.request.body.description).toBeNull();
    req.flush({ success: true, data: { product: PRODUCT } });
  });

  it('populates edit mode and PUTs updates without timestamps', () => {
    component.product = PRODUCT;
    component.ngOnChanges({ product: {} as never, isOpen: {} as never });
    expect(component.isEdit).toBe(true);
    expect(component.form.getRawValue().name).toBe('CRM License');
    expect(component.form.getRawValue().unitPrice).toBe(1200);

    let closedWith: boolean | null = null;
    component.closed.subscribe((v) => (closedWith = v));

    component.form.patchValue({ unitPrice: 99.5 });
    component.onSubmit();

    const req = httpMock.expectOne('/api/products/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.unitPrice).toBe(99.5);
    expect(req.request.body.companyId).toBeUndefined();
    expect(req.request.body.createdAt).toBeUndefined();
    expect(req.request.body.updatedAt).toBeUndefined();
    req.flush({ success: true, data: { product: { ...PRODUCT, unitPrice: 99.5 } } });

    expect(closedWith).toBe(true);
  });

  it('surfaces a backend duplicate SKU error without closing', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({ name: 'CRM License', sku: 'DUP', unitPrice: 10 });
    component.onSubmit();

    httpMock.expectOne('/api/products').flush(
      { success: false, error: { message: 'Duplicate value for: sku' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('Duplicate value for: sku');
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
