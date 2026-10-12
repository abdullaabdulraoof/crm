import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { InvoicesService } from '../services/invoices.service';
import {
  Invoice,
  InvoiceCreateMode,
  InvoiceFormData,
  InvoiceItemInput,
  InvoiceStatus,
  INVOICE_LOCKED_STATUSES,
  INVOICE_METADATA_ONLY_STATUSES,
  INVOICE_TRANSITIONS,
} from '../invoices.types';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';
import { ProductsService } from '../../products/services/products.service';
import { Product } from '../../products/products.types';
import { QuotationsService } from '../../quotations/services/quotations.service';
import { Quotation } from '../../quotations/quotations.types';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const today = (): string => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-invoice-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './invoice-form.component.html',
})
export class InvoiceFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly invoicesService = inject(InvoicesService);
  private readonly clientsService = inject(ClientsService);
  private readonly productsService = inject(ProductsService);
  private readonly quotationsService = inject(QuotationsService);

  @Input() invoice: Invoice | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly clients = signal<ClientOption[]>([]);
  readonly products = signal<Product[]>([]);
  readonly acceptedQuotations = signal<Quotation[]>([]);
  readonly selectedQuotation = signal<Quotation | null>(null);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly quotationsLoaded = signal(false);

  readonly form = this.fb.nonNullable.group({
    mode: ['DIRECT' as InvoiceCreateMode],
    quotationId: [''],
    clientId: [''],
    discountAmount: [0],
    issueDate: [today()],
    dueDate: [''],
    notes: [''],
    paymentTerms: [''],
    status: ['DRAFT' as InvoiceStatus],
    items: this.fb.array([this.createItemGroup()]),
  });

  get isEdit(): boolean {
    return !!this.invoice;
  }

  get itemRows(): FormArray {
    return this.form.controls.items;
  }

  get isLocked(): boolean {
    return !!this.invoice && INVOICE_LOCKED_STATUSES.includes(this.invoice.status);
  }

  get isMetadataOnly(): boolean {
    return !!this.invoice && INVOICE_METADATA_ONLY_STATUSES.includes(this.invoice.status);
  }

  // Content fields (client, items, discount, issue date) are frozen once issued.
  get contentLocked(): boolean {
    return this.isLocked || this.isMetadataOnly;
  }

  get isFromQuotation(): boolean {
    return !this.isEdit && this.form.controls.mode.value === 'FROM_QUOTATION';
  }

  get statusOptions(): InvoiceStatus[] {
    if (!this.invoice) return ['DRAFT'];
    return INVOICE_TRANSITIONS[this.invoice.status] || [this.invoice.status];
  }

  ngOnInit(): void {
    this.clientsService.getClients().subscribe({
      next: (list) => this.clients.set(list),
      error: () => this.clients.set([]),
    });
    this.productsService.getProducts({ page: 1, limit: 100, isActive: 'true' }).subscribe({
      next: (res) => this.products.set(res.data || []),
      error: () => this.products.set([]),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['invoice'] || changes['isOpen']) {
      this.populate();
    }
  }

  private createItemGroup() {
    return this.fb.nonNullable.group({
      productId: [''],
      description: [''],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [0, [Validators.min(0)]],
      gstRate: [0, [Validators.min(0), Validators.max(100)]],
    });
  }

  private populate(): void {
    this.formError.set(null);
    this.selectedQuotation.set(null);
    this.itemRows.clear();
    if (this.invoice) {
      this.form.patchValue({
        mode: 'DIRECT',
        quotationId: '',
        clientId: this.invoice.clientId || '',
        discountAmount: this.invoice.discountAmount ?? 0,
        issueDate: this.toDateInput(this.invoice.issueDate) || '',
        dueDate: this.toDateInput(this.invoice.dueDate) || '',
        notes: this.invoice.notes || '',
        paymentTerms: this.invoice.paymentTerms || '',
        status: this.invoice.status,
      });
      for (const item of this.invoice.items || []) {
        const group = this.createItemGroup();
        group.patchValue({
          productId: item.productId || '',
          description: item.description || '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          gstRate: item.gstRate,
        });
        this.itemRows.push(group);
      }
      if (this.itemRows.length === 0) this.itemRows.push(this.createItemGroup());
    } else {
      this.form.reset({
        mode: 'DIRECT',
        quotationId: '',
        clientId: '',
        discountAmount: 0,
        issueDate: today(),
        dueDate: '',
        notes: '',
        paymentTerms: '',
        status: 'DRAFT',
      });
      this.itemRows.push(this.createItemGroup());
    }
  }

  private toDateInput(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  onModeChange(mode: InvoiceCreateMode): void {
    this.form.controls.mode.setValue(mode);
    this.formError.set(null);
    this.selectedQuotation.set(null);
    this.form.controls.quotationId.setValue('');
    if (mode === 'FROM_QUOTATION') {
      this.loadAcceptedQuotations();
    }
  }

  private loadAcceptedQuotations(): void {
    if (this.quotationsLoaded()) return;
    this.quotationsLoaded.set(true);
    this.quotationsService.getQuotations({ page: 1, limit: 100, status: 'ACCEPTED' }).subscribe({
      next: (res) => this.acceptedQuotations.set(res.data || []),
      error: () => this.acceptedQuotations.set([]),
    });
  }

  onQuotationChange(): void {
    const id = this.form.controls.quotationId.value;
    if (!id) {
      this.selectedQuotation.set(null);
      return;
    }
    this.quotationsService.getQuotation(id).subscribe({
      next: (res) => this.selectedQuotation.set(res.data.quotation),
      error: (err: HttpErrorResponse) => {
        this.selectedQuotation.set(null);
        this.formError.set(
          err?.error?.error?.message || err?.error?.message || 'Failed to load quotation'
        );
      },
    });
  }

  isProductLinked(index: number): boolean {
    return !!this.itemRows.at(index).get('productId')?.value;
  }

  lineAmount(index: number): number {
    const raw = this.itemRows.at(index).getRawValue();
    return round2((Number(raw.quantity) || 0) * (Number(raw.unitPrice) || 0));
  }

  onProductChange(index: number): void {
    const group = this.itemRows.at(index);
    const productId = group.get('productId')?.value;
    const product = this.products().find((p) => p.id === productId);
    if (product) {
      group.patchValue({
        description: product.name,
        unitPrice: product.unitPrice,
        gstRate: product.gstRate,
      });
    }
  }

  addItem(): void {
    this.itemRows.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    if (this.itemRows.length <= 1) return;
    this.itemRows.removeAt(index);
  }

  // Live preview only. The backend recomputes and is the source of truth, so
  // these figures are never sent with the request.
  preview(): { subtotal: number; taxAmount: number; totalAmount: number } {
    const quotation = this.selectedQuotation();
    if (this.isFromQuotation && quotation) {
      return {
        subtotal: quotation.subtotal,
        taxAmount: quotation.taxAmount,
        totalAmount: quotation.totalAmount,
      };
    }
    let subtotal = 0;
    let taxAmount = 0;
    for (const group of this.itemRows.controls) {
      const raw = group.getRawValue();
      const quantity = Number(raw.quantity) || 0;
      const unitPrice = Number(raw.unitPrice) || 0;
      const gstRate = Number(raw.gstRate) || 0;
      const amount = round2(quantity * unitPrice);
      subtotal += amount;
      taxAmount += round2((amount * gstRate) / 100);
    }
    subtotal = round2(subtotal);
    taxAmount = round2(taxAmount);
    const discount = Number(this.form.controls.discountAmount.value) || 0;
    return { subtotal, taxAmount, totalAmount: round2(subtotal - discount + taxAmount) };
  }

  private buildItems(): InvoiceItemInput[] | null {
    const raw = this.form.getRawValue();
    const items: InvoiceItemInput[] = [];
    for (let i = 0; i < raw.items.length; i += 1) {
      const row = raw.items[i];
      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        this.formError.set(`Item ${i + 1}: quantity must be greater than 0.`);
        return null;
      }
      if (row.productId) {
        items.push({ productId: row.productId, quantity });
      } else {
        const description = (row.description || '').trim();
        const unitPrice = Number(row.unitPrice);
        const gstRate = Number(row.gstRate) || 0;
        if (!description) {
          this.formError.set(`Item ${i + 1}: description is required.`);
          return null;
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          this.formError.set(`Item ${i + 1}: unit price must be 0 or more.`);
          return null;
        }
        if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
          this.formError.set(`Item ${i + 1}: GST rate must be between 0 and 100.`);
          return null;
        }
        items.push({ description, quantity, unitPrice, gstRate });
      }
    }
    return items;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.submitting() || this.isLocked) return;

    const raw = this.form.getRawValue();
    let data: InvoiceFormData;

    if (this.isEdit) {
      data = {};
      if (this.isMetadataOnly) {
        data.notes = raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null;
        data.paymentTerms = raw.paymentTerms && raw.paymentTerms.trim() !== '' ? raw.paymentTerms.trim() : null;
        data.dueDate = raw.dueDate ? new Date(raw.dueDate).toISOString() : null;
        data.status = raw.status;
      } else {
        if (!raw.clientId) {
          this.formError.set('Select a client for this invoice.');
          return;
        }
        const items = this.buildItems();
        if (!items) return;
        data = {
          clientId: raw.clientId,
          items,
          discountAmount: Number(raw.discountAmount) || 0,
          issueDate: raw.issueDate ? new Date(raw.issueDate).toISOString() : null,
          dueDate: raw.dueDate ? new Date(raw.dueDate).toISOString() : null,
          notes: raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null,
          paymentTerms: raw.paymentTerms && raw.paymentTerms.trim() !== '' ? raw.paymentTerms.trim() : null,
          status: raw.status,
        };
      }
    } else if (this.isFromQuotation) {
      if (!raw.quotationId) {
        this.formError.set('Select an accepted quotation to invoice.');
        return;
      }
      data = {
        quotationId: raw.quotationId,
        issueDate: raw.issueDate ? new Date(raw.issueDate).toISOString() : null,
        dueDate: raw.dueDate ? new Date(raw.dueDate).toISOString() : null,
        notes: raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null,
        paymentTerms: raw.paymentTerms && raw.paymentTerms.trim() !== '' ? raw.paymentTerms.trim() : null,
      };
    } else {
      if (!raw.clientId) {
        this.formError.set('Select a client for this invoice.');
        return;
      }
      const items = this.buildItems();
      if (!items) return;
      data = {
        clientId: raw.clientId,
        items,
        discountAmount: Number(raw.discountAmount) || 0,
        issueDate: raw.issueDate ? new Date(raw.issueDate).toISOString() : null,
        dueDate: raw.dueDate ? new Date(raw.dueDate).toISOString() : null,
        notes: raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null,
        paymentTerms: raw.paymentTerms && raw.paymentTerms.trim() !== '' ? raw.paymentTerms.trim() : null,
      };
    }

    this.submitting.set(true);
    const obs =
      this.isEdit && this.invoice
        ? this.invoicesService.updateInvoice(this.invoice.id, data)
        : this.invoicesService.createInvoice(data);
    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const msg = err?.error?.error?.message || err?.error?.message || 'Failed to save invoice';
        this.formError.set(msg);
      },
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  displayAmount(value: number): string {
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  }
}
