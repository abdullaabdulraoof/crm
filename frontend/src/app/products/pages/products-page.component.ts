import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { ProductsService } from '../services/products.service';
import { Product } from '../products.types';
import { ProductFormComponent } from '../components/product-form.component';
import { AuthService } from '../../auth/auth.service';

interface Filters {
  search: string;
  type: string;
  isActive: string;
}

const EMPTY_FILTERS: Filters = { search: '', type: '', isActive: '' };

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, ProductFormComponent],
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
  readonly limit = 10;
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly showForm = signal(false);
  readonly editing = signal<Product | null>(null);
  readonly busyId = signal<string | null>(null);

  // Frontend convenience only - the backend enforces the real permissions.
  readonly canEdit = signal(false);
  readonly canDeactivate = signal(false);

  ngOnInit(): void {
    this.updatePermissions();
    this.refresh();
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    this.canEdit.set(['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(role ?? ''));
    this.canDeactivate.set(role === 'OWNER' || role === 'ADMIN');
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.productsService
      .getProducts({
        page: this.page(),
        limit: this.limit,
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

  hasActiveFilters(): boolean {
    const f = this.filters();
    return !!(f.search || f.type || f.isActive);
  }

  onAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
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
        this.success.set(
          product.isActive ? 'Product deactivated.' : 'Product activated.'
        );
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

  trackById(id: string): string {
    return id;
  }
}
