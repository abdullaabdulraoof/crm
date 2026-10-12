import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { PaymentsService } from '../services/payments.service';
import { PaymentFormData, PaymentMethod, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYABLE_INVOICE_STATUSES } from '../payments.types';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { Invoice } from '../../invoices/invoices.types';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const today = (): string => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './payment-form.component.html',
})
export class PaymentFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly paymentsService = inject(PaymentsService);
  private readonly invoicesService = inject(InvoicesService);

  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly methods = PAYMENT_METHODS;
  readonly methodLabels = PAYMENT_METHOD_LABELS;
  readonly eligibleInvoices = signal<Invoice[]>([]);
  readonly selectedInvoice = signal<Invoice | null>(null);
  readonly loadingInvoices = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    invoiceId: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentDate: [today()],
    method: ['CASH' as PaymentMethod, [Validators.required]],
    transactionReference: [''],
    notes: [''],
  });

  ngOnInit(): void {
    this.loadEligibleInvoices();
  }

  private loadEligibleInvoices(): void {
    this.loadingInvoices.set(true);
    this.invoicesService.getInvoices({ page: 1, limit: 100 }).subscribe({
      next: (res) => {
        this.loadingInvoices.set(false);
        const eligible = (res.data || []).filter(
          (inv) => PAYABLE_INVOICE_STATUSES.includes(inv.status) && inv.balanceDue > 0
        );
        this.eligibleInvoices.set(eligible);
      },
      error: () => {
        this.loadingInvoices.set(false);
        this.eligibleInvoices.set([]);
      },
    });
  }

  onInvoiceChange(): void {
    const id = this.form.controls.invoiceId.value;
    const invoice = this.eligibleInvoices().find((inv) => inv.id === id) || null;
    this.selectedInvoice.set(invoice);
    this.formError.set(null);
    if (invoice && !this.form.controls.amount.value) {
      this.form.controls.amount.setValue(invoice.balanceDue);
    }
  }

  invoiceLabel(invoice: Invoice): string {
    const client = invoice.client?.name ? ` - ${invoice.client.name}` : '';
    return `${invoice.invoiceNumber}${client}`;
  }

  displayAmount(value: number | null | undefined): string {
    return typeof value === 'number' ? value.toLocaleString() : '-';
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.submitting()) return;

    const raw = this.form.getRawValue();
    const invoice = this.selectedInvoice();
    if (!raw.invoiceId || !invoice) {
      this.formError.set('Select an eligible invoice.');
      return;
    }

    const amount = round2(Number(raw.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.formError.set('Payment amount must be greater than 0.');
      return;
    }
    if (amount > round2(invoice.balanceDue)) {
      this.formError.set('Payment amount cannot exceed the invoice balance due.');
      return;
    }

    const data: PaymentFormData = {
      invoiceId: raw.invoiceId,
      amount,
      paymentDate: raw.paymentDate ? new Date(raw.paymentDate).toISOString() : new Date().toISOString(),
      method: raw.method,
      transactionReference: raw.transactionReference.trim() || undefined,
      notes: raw.notes.trim() || undefined,
    };

    this.submitting.set(true);
    this.paymentsService.recordPayment(data).subscribe({
      next: () => {
        this.submitting.set(false);
        this.resetForm();
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.formError.set(
          err?.error?.error?.message || err?.error?.message || 'Failed to record payment'
        );
      },
    });
  }

  private resetForm(): void {
    this.form.reset({
      invoiceId: '',
      amount: 0,
      paymentDate: today(),
      method: 'CASH',
      transactionReference: '',
      notes: '',
    });
    this.selectedInvoice.set(null);
  }

  onCancel(): void {
    this.resetForm();
    this.formError.set(null);
    this.cancelled.emit();
  }
}
