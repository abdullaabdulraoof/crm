import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { ClientsService } from '../clients.service';
import { Client, ClientFormData, ClientType } from '../clients.types';
import { IconComponent } from '../../layout/icon/icon.component';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  templateUrl: './client-form.component.html',
})
export class ClientFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly clientsService = inject(ClientsService);

  @Input() client: Client | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Client>();

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    phoneNumber: ['', [Validators.maxLength(20)]],
    email: ['', [Validators.email]],
    address: ['', [Validators.maxLength(500)]],
    gstNo: ['', [Validators.maxLength(15)]],
    clientType: ['INDIVIDUAL' as ClientType],
    notes: ['', [Validators.maxLength(2000)]],
  });

  get isEdit(): boolean {
    return !!this.client;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] || changes['isOpen']) {
      this.populate();
    }
  }

  private populate(): void {
    this.formError.set(null);
    if (this.client) {
      this.form.patchValue({
        name: this.client.name || '',
        phoneNumber: this.client.phoneNumber || '',
        email: this.client.email || '',
        address: this.client.address || '',
        gstNo: this.client.gstNo || '',
        clientType: (this.client.clientType as ClientType) || 'INDIVIDUAL',
        notes: this.client.notes || '',
      });
    } else {
      this.form.reset({
        name: '',
        phoneNumber: '',
        email: '',
        address: '',
        gstNo: '',
        clientType: 'INDIVIDUAL',
        notes: '',
      });
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const data: ClientFormData = {
      name: raw.name.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      email: raw.email && raw.email.trim() !== '' ? raw.email.trim() : null,
      address: raw.address && raw.address.trim() !== '' ? raw.address.trim() : null,
      gstNo: raw.gstNo && raw.gstNo.trim() !== '' ? raw.gstNo.trim() : null,
      clientType: raw.clientType as ClientType,
      notes: raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null,
    };
    const obs =
      this.isEdit && this.client
        ? this.clientsService.updateClient(this.client.id, data)
        : this.clientsService.createClient(data);
    obs.subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res?.data?.client) {
          this.saved.emit(res.data.client);
        }
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const msg = err?.error?.error?.message || err?.error?.message || 'Failed to save client';
        this.formError.set(msg);
      },
    });
  }

  showError(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.submitting()) {
      this.onCancel();
    }
  }

  fieldClass(name: string): string {
    const base =
      'mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2';
    return this.showError(name)
      ? base + ' border-red-500 focus:border-red-500 focus:ring-red-500/20'
      : base + ' border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20';
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
