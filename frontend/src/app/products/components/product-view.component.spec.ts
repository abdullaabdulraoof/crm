import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductViewComponent } from './product-view.component';
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('ProductViewComponent', () => {
  let fixture: ComponentFixture<ProductViewComponent>;
  let component: ProductViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', PRODUCT);
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the product details read-only', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Product details');
    expect(text).toContain('CRM License');
    expect(text).toContain('SKU-100');
    expect(text).toContain('Product');
    expect(text).toContain('1,200');
    expect(text).toContain('18%');
    expect(text).toContain('Active');
    expect(text).toContain('Annual subscription');
  });

  it('focuses the close button when opened', () => {
    const close = fixture.nativeElement.querySelector(
      'button[aria-label="Close"]'
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(close);
  });

  it('emits closed when the close button is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    (fixture.nativeElement.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();

    expect(closed).toBe(true);
  });

  it('closes on Escape', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toBe(true);
  });

  it('closes when the backdrop is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    (dialog.parentElement as HTMLElement).click();

    expect(closed).toBe(true);
  });

  it('shows dashes and an inactive badge for a sparse product', () => {
    fixture.componentRef.setInput('product', {
      ...PRODUCT,
      sku: '',
      description: '',
      isActive: false,
    });
    fixture.detectChanges();

    expect(component.statusLabel()).toBe('Inactive');
    expect(component.hasDescription()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Inactive');
    expect(text).not.toContain('Description');
  });
});
