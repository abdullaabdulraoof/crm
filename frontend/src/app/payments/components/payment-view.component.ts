import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Payment, PAYMENT_METHOD_LABELS, PaymentMethod } from '../payments.types';

@Component({
  selector: 'app-payment-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-view.component.html',
})
export class PaymentViewComponent {
  @Input() payment: Payment | null = null;
  @Input() isOpen = false;
  @Input() canVoid = false;
  @Input() voidBusy = false;
  @Input() voidError: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() voided = new EventEmitter<string>();

  readonly showVoidForm = signal(false);
  readonly reason = signal('');
  readonly localError = signal<string | null>(null);

  onClose(): void {
    this.showVoidForm.set(false);
    this.reason.set('');
    this.localError.set(null);
    this.closed.emit();
  }

  canShowVoid(): boolean {
    return !!this.canVoid && this.payment?.status === 'RECORDED';
  }

  startVoid(): void {
    this.showVoidForm.set(true);
    this.reason.set('');
    this.localError.set(null);
  }

  cancelVoid(): void {
    this.showVoidForm.set(false);
    this.localError.set(null);
  }

  onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  confirmVoid(): void {
    const reason = this.reason().trim();
    if (!reason) {
      this.localError.set('A reason is required to void a payment.');
      return;
    }
    this.localError.set(null);
    this.voided.emit(reason);
  }

  methodLabel(method: PaymentMethod | undefined): string {
    return method ? PAYMENT_METHOD_LABELS[method] : '-';
  }

  displayAmount(value: number | null | undefined): string {
    return typeof value === 'number' ? value.toLocaleString() : '-';
  }

  displayDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  }
}
