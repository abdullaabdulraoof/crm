import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { ProductsService } from '../services/products.service';
import { Product } from '../products.types';
import { ProductFormComponent } from '../components/product-form.component';
import { ProductViewComponent } from '../components/product-view.component';
import { IconComponent } from '../../layout/icon/icon.component';
import { AuthService } from '../../auth/auth.service';

interface Filters {
  search: string;
  type: string;
  isActive: string;
}

const EMPTY_FILTERS: Filters = { search: '', type: '', isActive: '' };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'PRODUCT', label: 'Product' },
  { value: 'SERVICE', label: 'Service' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

const PAGE_SIZES = [10, 25, 50, 100];

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, ProductFormComponent, ProductViewComponent, IconComponent],
  templateUrl: './products-page.component.html',
})
export class ProductsPageComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  readonly auth = inject(AuthService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly busyId = signal<string | null>(null);

  readonly showForm = signal(false);
  readonly editing = signal<Product | null>(null);
  readonly viewing = signal<Product | null>(null);

  readonly typeOptions = TYPE_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;
  readonly pageSizes = PAGE_SIZES;

  private readonly canEdit = ['OWNER', 'ADMIN', 'MANAGER', 'SALES'];

  readonly canCreate = computed(() => this.canEdit.includes(this.auth.user()?.role ?? ''));
  readonly canDeactivate = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'OWNER' || role === 'ADMIN';
  });

  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1));
  readonly rangeEnd = computed(() => Math.min(this.page() * this.limit(), this.total()));

  readonly selectedProductIds = signal<Set<string>>(new Set());

  readonly activeChips = computed(() => {
    const f = this.filters();
    const chips: { key: keyof Filters; label: string; value: string }[] = [];
    if (f.search) chips.push({ key: 'search', label: 'Search', value: f.search });
    if (f.type) chips.push({ key: 'type', label: 'Type', value: f.type === 'PRODUCT' ? 'Product' : 'Service' });
    if (f.isActive) chips.push({ key: 'isActive', label: 'Status', value: f.isActive === 'true' ? 'Active' : 'Inactive' });
    return chips;
  });

  removeFilter(key: keyof Filters): void {
    this.filters.update((f) => ({ ...f, [key]: '' }));
    this.page.set(1);
    this.refresh();
  }

  toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedProductIds.set(new Set(this.products().map((p) => p.id)));
    } else {
      this.selectedProductIds.set(new Set());
    }
  }

  toggleSelectProduct(id: string): void {
    this.selectedProductIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isProductSelected(id: string): boolean {
    return this.selectedProductIds().has(id);
  }

  isAllSelected(): boolean {
    const products = this.products();
    return products.length > 0 && products.every((p) => this.selectedProductIds().has(p.id));
  }

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.productsService
      .getProducts({
        page: this.page(),
        limit: this.limit(),
        search: f.search || undefined,
        type: f.type || undefined,
        isActive: f.isActive || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.products.set(res.data || []);
          this.total.set(res.pagination?.total || 0);
          const pages = res.pagination?.totalPages || 0;
          this.totalPages.set(pages);
          if (pages > 0 && this.page() > pages) {
            this.page.set(pages);
            this.refresh();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.friendly(err));
        },
      });
  }

  private friendly(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) return 'Unable to reach the server. Please check your connection and try again.';
    if (status === 401) return 'Unauthorized. Please login again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'Product not found.';
    if (status === 400) return err?.error?.error?.message || err?.error?.message || 'Validation failed.';
    if (status >= 500) return 'Something went wrong. Please try again.';
    return err?.error?.error?.message || 'Something went wrong. Please try again.';
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const value = (event.target as HTMLInputElement).value;
      this.filters.update((f) => ({ ...f, search: value.trim() }));
      this.page.set(1);
      this.refresh();
    }
  }

  onFilterChange(key: keyof Filters, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.page.set(1);
    this.refresh();
  }

  activeFilterCount(): number {
    const f = this.filters();
    return [f.search, f.type, f.isActive].filter((value) => !!value).length;
  }

  hasActiveFilters(): boolean {
    return this.activeFilterCount() > 0;
  }

  onPageSize(value: string): void {
    const size = Number(value);
    if (!Number.isFinite(size) || size === this.limit()) return;
    this.limit.set(size);
    this.page.set(1);
    this.refresh();
  }

  onAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onView(product: Product): void {
    this.viewing.set(product);
  }

  onViewClosed(): void {
    this.viewing.set(null);
  }

  onEdit(product: Product): void {
    if (this.busyId()) return;
    this.editing.set(product);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onToggleActive(product: Product): void {
    if (this.busyId()) return;
    if (product.isActive && !confirm('Deactivate this product?')) return;
    if (!product.isActive && !confirm('Activate this product?')) return;

    this.busyId.set(product.id);
    this.error.set(null);
    this.success.set(null);
    const request = product.isActive
      ? this.productsService.deactivateProduct(product.id)
      : this.productsService.activateProduct(product.id);
    request.subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set(product.isActive ? 'Product deactivated.' : 'Product activated.');
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.error.set(this.friendly(err));
      },
    });
  }

  onFormClosed(saved: boolean): void {
    this.showForm.set(false);
    this.editing.set(null);
    if (saved) {
      this.success.set('Product saved successfully.');
      this.refresh();
    }
  }

  onFormCancelled(): void {
    this.showForm.set(false);
    this.editing.set(null);
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.refresh();
    }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.set(this.page() + 1);
      this.refresh();
    }
  }

  displayType(t: string): string {
    return t === 'SERVICE' ? 'Service' : 'Product';
  }

  displayPrice(price: number): string {
    return typeof price === 'number' ? price.toLocaleString() : String(price);
  }

  formatCurrency(price: number): string {
    return '$ ' + this.displayPrice(price);
  }

  statusLabel(p: Product): string {
    return p.isActive ? 'Active' : 'Inactive';
  }

  statusClass(p: Product): string {
    return p.isActive
      ? 'bg-green-50 text-green-700 ring-green-200'
      : 'bg-slate-100 text-slate-600 ring-slate-200';
  }

  statusDotClass(p: Product): string {
    return p.isActive ? 'bg-green-500' : 'bg-slate-400';
  }

  trackById(id: string): string {
    return id;
  }
}
