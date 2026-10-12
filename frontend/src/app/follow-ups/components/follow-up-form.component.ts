import { Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, signal, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { FollowUpsService } from '../services/follow-ups.service';
import { FollowUp, FollowUpFormData, FollowUpStatus, FollowUpType } from '../follow-ups.types';
import { UsersService } from '../../users/users.service';
import { AssignedUserOption } from '../../users/users.types';
import { LeadsService } from '../../leads/services/leads.service';
import { Lead } from '../../leads/leads.types';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';

@Component({
  selector: 'app-follow-up-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './follow-up-form.component.html',
})
export class FollowUpFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly followUpsService = inject(FollowUpsService);
  private readonly usersService = inject(UsersService);
  private readonly leadsService = inject(LeadsService);
  private readonly clientsService = inject(ClientsService);

  @Input() followup: FollowUp | null = null;
  @Input() presetLeadId: string | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  readonly users = signal<AssignedUserOption[]>([]);
  readonly leads = signal<Lead[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    relatedType: ['LEAD' as 'LEAD' | 'CLIENT'],
    leadId: ['' as string],
    clientId: ['' as string],
    assignedTo: ['', Validators.required],
    type: ['CALL' as FollowUpType, Validators.required],
    subject: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    description: ['', [Validators.maxLength(2000)]],
    dueAt: ['', Validators.required],
    status: ['PENDING' as FollowUpStatus],
  });

  get isEdit(): boolean {
    return !!this.followup;
  }

  ngOnInit(): void {
    this.loadUsers();
    this.loadTargets();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['followup'] || changes['isOpen'] || changes['presetLeadId']) {
      this.populate();
    }
  }

  private loadUsers(): void {
    this.usersService.getAssignedToOptions().subscribe({
      next: (list) => this.users.set(list),
      error: () => this.users.set([]),
    });
  }

  private loadTargets(): void {
    this.leadsService.getLeads({ page: 1, limit: 100 }).subscribe({
      next: (res) => this.leads.set(res.data || []),
      error: () => this.leads.set([]),
    });
    this.clientsService.getClients().subscribe({
      next: (list) => this.clients.set(list),
      error: () => this.clients.set([]),
    });
  }

  private populate(): void {
    this.formError.set(null);
    if (this.followup) {
      const relatedType = this.followup.leadId || this.followup.lead ? 'LEAD' : 'CLIENT';
      this.form.patchValue({
        relatedType,
        leadId: this.followup.leadId || '',
        clientId: this.followup.clientId || '',
        assignedTo: typeof this.followup.assignedTo === 'object' && this.followup.assignedTo
          ? this.followup.assignedTo.id
          : '',
        type: this.followup.type || 'CALL',
        subject: this.followup.subject || '',
        description: this.followup.description || '',
        dueAt: this.toDatetimeLocal(this.followup.dueAt) || '',
        status: this.followup.status || 'PENDING',
      });
      if (!relatedType && this.followup.clientId) {
        this.form.controls.relatedType.setValue('CLIENT');
      }
    } else {
      this.form.reset({
        relatedType: 'LEAD',
        leadId: this.presetLeadId || '',
        clientId: '',
        assignedTo: '',
        type: 'CALL',
        subject: '',
        description: '',
        dueAt: '',
        status: 'PENDING',
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

  get needsTarget(): boolean {
    const relatedType = this.form.controls.relatedType.value;
    const target = relatedType === 'LEAD'
      ? this.form.controls.leadId.value
      : this.form.controls.clientId.value;
    return !target;
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting()) return;
    if (this.needsTarget) {
      this.formError.set('Select a lead or client to relate this follow-up to.');
      return;
    }
    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const data: FollowUpFormData = {
      leadId: raw.relatedType === 'LEAD' ? raw.leadId : null,
      clientId: raw.relatedType === 'CLIENT' ? raw.clientId : null,
      assignedTo: raw.assignedTo,
      type: raw.type,
      subject: raw.subject.trim(),
      description: raw.description && raw.description.trim() !== '' ? raw.description.trim() : null,
      dueAt: new Date(raw.dueAt).toISOString(),
    };
    if (this.isEdit && this.followup) {
      data.status = raw.status;
    }
    const obs = this.isEdit && this.followup
      ? this.followUpsService.updateFollowUp(this.followup.id, data)
      : this.followUpsService.createFollowUp(data);
    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closed.emit(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const msg = err?.error?.error?.message || err?.error?.message || 'Failed to save follow-up';
        this.formError.set(msg);
      },
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
