import { Component, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { ProductsService } from '../services/products.service';
import { Product, ProductFormData, ProductType } from '../products.types';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './product-form.component.html',
})
export class ProductFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly productsService = inject(ProductsService);

  @Input() product: Product | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    description: ['', [Validators.maxLength(2000)]],
    sku: ['', [Validators.maxLength(100)]],
    type: ['PRODUCT' as ProductType, Validators.required],
    unitPrice: [0, [Validators.required, Validators.min(0)]],
    gstRate: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  get isEdit(): boolean {
    return !!this.product;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product'] || changes['isOpen']) {
      this.populate();
    }
  }

  private populate(): void {
    this.formError.set(null);
    if (this.product) {
      this.form.patchValue({
        name: this.product.name || '',
        description: this.product.description || '',
        sku: this.product.sku || '',
        type: this.product.type || 'PRODUCT',
        unitPrice: this.product.unitPrice,
        gstRate: this.product.gstRate,
      });
    } else {
      this.form.reset({
        name: '',
        description: '',
        sku: '',
        type: 'PRODUCT',
        unitPrice: 0,
        gstRate: 0,
      });
    }
  }

  private toNumber(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting()) return;

    const raw = this.form.getRawValue();
    const unitPrice = this.toNumber(raw.unitPrice);
    const gstRate = this.toNumber(raw.gstRate);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      this.formError.set('Unit price must be a number greater than or equal to 0.');
      return;
    }
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
      this.formError.set('GST rate must be a number between 0 and 100.');
      return;
    }

    this.submitting.set(true);
    const data: ProductFormData = {
      name: raw.name.trim(),
      description: raw.description && raw.description.trim() !== '' ? raw.description.trim() : null,
      sku: raw.sku && raw.sku.trim() !== '' ? raw.sku.trim() : null,
      unitPrice,
      gstRate,
      type: raw.type,
    };

    const obs = this.isEdit && this.product
      ? this.productsService.updateProduct(this.product.id, data)
      : this.productsService.createProduct(data);
    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const msg = err?.error?.error?.message || err?.error?.message || 'Failed to save product';
        this.formError.set(msg);
      },
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
