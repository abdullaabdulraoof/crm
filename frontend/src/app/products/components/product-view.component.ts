import {
  Component,
  effect,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Product } from '../products.types';
import { IconComponent } from '../../layout/icon/icon.component';

@Component({
  selector: 'app-product-view',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './product-view.component.html',
})
export class ProductViewComponent {
  readonly product = input<Product | null>(null);
  readonly isOpen = input(false);
  readonly closed = output<void>();

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('productViewClose');

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.closeButton()?.nativeElement.focus();
      }
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.onClose();
    }
  }

  typeLabel(): string {
    return this.product()?.type === 'SERVICE' ? 'Service' : 'Product';
  }

  statusLabel(): string {
    return this.product()?.isActive ? 'Active' : 'Inactive';
  }

  statusClass(): string {
    return this.product()?.isActive
      ? 'bg-green-50 text-green-700 ring-green-200'
      : 'bg-slate-100 text-slate-600 ring-slate-200';
  }

  statusDotClass(): string {
    return this.product()?.isActive ? 'bg-green-500' : 'bg-slate-400';
  }

  displayPrice(value: number | null | undefined): string {
    return typeof value === 'number' ? value.toLocaleString() : '-';
  }

  displayGstRate(value: number | null | undefined): string {
    return typeof value === 'number' ? value + '%' : '-';
  }

  hasDescription(): boolean {
    return !!this.product()?.description?.trim();
  }

  displayDate(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
  }
}
