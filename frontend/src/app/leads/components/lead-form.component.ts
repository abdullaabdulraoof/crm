import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { LeadsService } from '../services/leads.service';
import { Lead, LeadFormData, LeadSource, LeadStatus } from '../leads.types';
import { UsersService } from '../../users/users.service';
import { AssignedUserOption } from '../../users/users.types';
import { ClientsService } from '../../clients/clients.service';
import { Client, ClientOption } from '../../clients/clients.types';
import { ClientFormComponent } from '../../clients/components/client-form.component';
import { IconComponent } from '../../layout/icon/icon.component';

@Component({
  selector: 'app-lead-form',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, ClientFormComponent],
  templateUrl: './lead-form.component.html',
})
export class LeadFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly leadsService = inject(LeadsService);
  private readonly usersService = inject(UsersService);
  private readonly clientsService = inject(ClientsService);

  @Input() lead: Lead | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly users = signal<AssignedUserOption[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly clientsLoading = signal(false);
  readonly clientsError = signal<string | null>(null);
  readonly showClientForm = signal(false);
  readonly selectedClientId = signal<string>('');
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phoneNumber: ['', [Validators.required]],
    email: ['', [Validators.email]],
    source: ['OTHER' as LeadSource],
    status: ['NEW' as LeadStatus],
    assignedTo: ['' as string | null],
    clientId: ['' as string],
    nextFollowUpAt: [null as string | null],
    notes: [null as string | null],
  });

  get isEdit(): boolean {
    return !!this.lead;
  }

  // Name/Phone/Email are derived from the linked client. In Add mode they only
  // appear once a client is selected; in Edit mode they stay visible so legacy
  // leads (no client) remain editable.
  get showContactFields(): boolean {
    return this.isEdit || !!this.selectedClientId();
  }

  get contactReadOnly(): boolean {
    return !!this.selectedClientId();
  }

  ngOnInit(): void {
    this.loadUsers();
    this.loadClients();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lead'] || changes['isOpen']) {
      this.populate();
    }
  }

  private loadUsers(): void {
    this.usersService.getAssignedToOptions().subscribe({
      next: (list) => this.users.set(list),
      error: () => this.users.set([]),
    });
  }

  private loadClients(): void {
    this.clientsLoading.set(true);
    this.clientsError.set(null);
    this.clientsService.getClients().subscribe({
      next: (list) => {
        this.clients.set(list);
        this.clientsLoading.set(false);
      },
      error: () => {
        this.clients.set([]);
        this.clientsLoading.set(false);
        this.clientsError.set('Failed to load clients');
      },
    });
  }

  private populate(): void {
    this.formError.set(null);
    if (this.lead) {
      this.form.patchValue({
        name: this.lead.name || '',
        phoneNumber: this.lead.phoneNumber || '',
        email: this.lead.email || '',
        source: (this.lead.source as LeadSource) || 'OTHER',
        status: (this.lead.status as LeadStatus) || 'NEW',
        assignedTo: this.lead.assignedTo?.id || null,
        clientId: this.lead.clientId || '',
        nextFollowUpAt: this.toDatetimeLocal(this.lead.nextFollowUpAt),
        notes: this.lead.notes || null,
      });
      this.selectedClientId.set(this.lead.clientId || '');
    } else {
      this.form.reset({
        name: '',
        phoneNumber: '',
        email: '',
        source: 'OTHER',
        status: 'NEW',
        assignedTo: null,
        clientId: '',
        nextFollowUpAt: null,
        notes: null,
      });
      this.selectedClientId.set('');
    }
  }

  private toDatetimeLocal(iso: string | null): string | null {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch {
      return null;
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const data: LeadFormData = {
      name: raw.name.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      email: raw.email && raw.email.trim() !== '' ? raw.email.trim() : null,
      source: raw.source as LeadSource,
      status: raw.status as LeadStatus,
      assignedTo: raw.assignedTo ? raw.assignedTo : null,
      nextFollowUpAt: raw.nextFollowUpAt || null,
      notes: raw.notes && raw.notes.trim() !== '' ? raw.notes.trim() : null,
      clientId: raw.clientId ? raw.clientId : null,
    };
    const obs = this.isEdit && this.lead
      ? this.leadsService.updateLead(this.lead.id, data)
      : this.leadsService.createLead(data);
    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const msg = err?.error?.error?.message || err?.error?.message || 'Failed to save lead';
        this.formError.set(msg);
      },
    });
  }

  showError(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  onClientChange(value: string): void {
    if (!value) {
      this.selectedClientId.set('');
      // Add mode: the contact fields were derived from the client, so clear
      // them so no stale values are submitted once the selection is cleared.
      if (!this.isEdit) {
        this.form.patchValue({ name: '', phoneNumber: '', email: '' });
      }
      return;
    }
    const client = this.clients().find((c) => c.id === value);
    if (!client) return;
    this.selectedClientId.set(value);
    this.applyClient(client);
  }

  onClientSaved(client: Client): void {
    this.clients.update((list) => {
      const exists = list.some((c) => c.id === client.id);
      const option: ClientOption = {
        id: client.id,
        name: client.name,
        phoneNumber: client.phoneNumber,
        email: client.email || '',
      };
      return exists ? list.map((c) => (c.id === client.id ? option : c)) : [...list, option];
    });
    this.selectedClientId.set(client.id);
    this.form.patchValue({ clientId: client.id });
    this.applyClient(client);
  }

  openClientForm(): void {
    this.showClientForm.set(true);
  }

  closeClientForm(): void {
    this.showClientForm.set(false);
  }

  clientLabel(client: ClientOption): string {
    return client.phoneNumber ? `${client.name} — ${client.phoneNumber}` : client.name;
  }

  // A lead that represents a client derives its identity fields from it.
  private applyClient(client: ClientOption | Client): void {
    this.form.patchValue({
      name: client.name,
      phoneNumber: client.phoneNumber || '',
      email: client.email || '',
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showClientForm()) return;
    if (!this.submitting()) {
      this.onCancel();
    }
  }

  fieldClass(name: string): string {
    const base =
      'mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2';
    return this.showError(name)
      ? base + ' border-red-300 focus:border-red-500 focus:ring-red-500/20'
      : base + ' border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20';
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
