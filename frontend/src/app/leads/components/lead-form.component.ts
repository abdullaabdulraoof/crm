import { Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, signal, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { LeadsService } from '../services/leads.service';
import { Lead, LeadFormData, LeadSource, LeadStatus } from '../leads.types';
import { UsersService } from '../../users/users.service';
import { AssignedUserOption } from '../../users/users.types';

@Component({
  selector: 'app-lead-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './lead-form.component.html',
})
export class LeadFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly leadsService = inject(LeadsService);
  private readonly usersService = inject(UsersService);

  @Input() lead: Lead | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly users = signal<AssignedUserOption[]>([]);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phoneNumber: ['', [Validators.required]],
    email: ['', [Validators.email]],
    source: ['OTHER' as LeadSource],
    status: ['NEW' as LeadStatus],
    assignedTo: ['' as string | null],
    nextFollowUpAt: [null as string | null],
    notes: [null as string | null],
  });

  get isEdit(): boolean {
    return !!this.lead;
  }

  ngOnInit(): void {
    this.loadUsers();
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
        nextFollowUpAt: this.toDatetimeLocal(this.lead.nextFollowUpAt),
        notes: this.lead.notes || null,
      });
    } else {
      this.form.reset({
        name: '',
        phoneNumber: '',
        email: '',
        source: 'OTHER',
        status: 'NEW',
        assignedTo: null,
        nextFollowUpAt: null,
        notes: null,
      });
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

  onCancel(): void {
    this.cancelled.emit();
  }
}
