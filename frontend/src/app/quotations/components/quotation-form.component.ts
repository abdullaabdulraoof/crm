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

import { QuotationsService } from '../services/quotations.service';
import {
  Quotation,
  QuotationFormData,
  QuotationItemInput,
  QuotationStatus,
  QUOTATION_CREATE_STATUSES,
  QUOTATION_STATUSES,
  QUOTATION_TERMINAL_STATUSES,
} from '../quotations.types';
import { LeadsService } from '../../leads/services/leads.service';
import { Lead } from '../../leads/leads.types';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';
import { ProductsService } from '../../products/services/products.service';
import { Product } from '../../products/products.types';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

@Component({
  selector: 'app-quotation-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './quotation-form.component.html',
})
export class QuotationFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly quotationsService = inject(QuotationsService);
  private readonly leadsService = inject(LeadsService);
  private readonly clientsService = inject(ClientsService);
  private readonly productsService = inject(ProductsService);

  @Input() quotation: Quotation | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly leads = signal<Lead[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly products = signal<Product[]>([]);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly createStatuses = QUOTATION_CREATE_STATUSES;
  readonly allStatuses = QUOTATION_STATUSES;

  readonly form = this.fb.nonNullable.group({
    relatedType: ['LEAD' as 'LEAD' | 'CLIENT'],
    leadId: [''],
    clientId: [''],
    discountAmount: [0],
    validUntil: [''],
    notes: [''],
    status: ['DRAFT' as QuotationStatus],
    items: this.fb.array([this.createItemGroup()]),
  });

  get isEdit(): boolean {
    return !!this.quotation;
  }

  get itemRows(): FormArray {
    return this.form.controls.items;
  }

  get isTerminal(): boolean {
    return !!this.quotation && QUOTATION_TERMINAL_STATUSES.includes(this.quotation.status);
  }

  get statusOptions(): QuotationStatus[] {
    return this.isEdit ? this.allStatuses : this.createStatuses;
  }

  ngOnInit(): void {
    this.leadsService.getLeads({ page: 1, limit: 100 }).subscribe({
      next: (res) => this.leads.set(res.data || []),
      error: () => this.leads.set([]),
    });
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
    if (changes['quotation'] || changes['isOpen']) {
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
    this.itemRows.clear();
    if (this.quotation) {
      const relatedType = this.quotation.leadId || this.quotation.lead ? 'LEAD' : 'CLIENT';
      this.form.patchValue({
        relatedType,
        leadId: this.quotation.leadId || '',
        clientId: this.quotation.clientId || '',
        discountAmount: this.quotation.discountAmount ?? 0,
        validUntil: this.toDateInput(this.quotation.validUntil) || '',
        notes: this.quotation.notes || '',
        status: this.quotation.status || 'DRAFT',
      });
      for (const item of this.quotation.items || []) {
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
        relatedType: 'LEAD',
        leadId: '',
        clientId: '',
        discountAmount: 0,
        validUntil: '',
        notes: '',
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

  get needsTarget(): boolean {
    const raw = this.form.getRawValue();
    const target = raw.relatedType === 'LEAD' ? raw.leadId : raw.clientId;
    return !target;
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

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.submitting()) return;

    const raw = this.form.getRawValue();
    if (this.needsTarget) {
      this.formError.set('Select a lead or client to relate this quotation to.');
      return;
    }

    const items: QuotationItemInput[] = [];
    for (let i = 0; i < raw.items.length; i += 1) {
      const row = raw.items[i];
      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        this.formError.set(`Item ${i + 1}: quantity must be greater than 0.`);
        return;
      }
      if (row.productId) {
        items.push({ productId: row.productId, quantity });
      } else {
        const description = (row.description || '').trim();
        const unitPrice = Number(row.unitPrice);
        const gstRate = Number(row.gstRate) || 0;
        if (!description) {
          this.formError.set(`Item ${i + 1}: description is required.`);
          return;
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          this.formError.set(`Item ${i + 1}: unit price must be 0 or more.`);
          return;
        }
        if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
          this.formError.set(`Item ${i + 1}: GST rate must be between 0 and 100.`);
          return;
        }
        items.push({ description, quantity, unitPrice, gstRate });
      }
    }

    const discountAmount = Number(raw.discountAmount) || 0;
    const data: QuotationFormData = {
      leadId: raw.relatedType === 'LEAD' ? raw.leadId : null,
      clientId: raw.relatedType === 'CLIENT' ? raw.clientId : null,
      items,
      discountAmount,
      validUntil: raw.validUntil ? new Date(raw.validUntil).toISOString() : null,
      notes: raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null,
    };
    if (this.isEdit) {
      data.status = raw.status;
    } else if (raw.status) {
      data.status = raw.status;
    }

    this.submitting.set(true);
    const obs = this.isEdit && this.quotation
      ? this.quotationsService.updateQuotation(this.quotation.id, data)
      : this.quotationsService.createQuotation(data);
    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const msg = err?.error?.error?.message || err?.error?.message || 'Failed to save quotation';
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
