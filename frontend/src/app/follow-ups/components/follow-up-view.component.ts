import {
  Component,
  effect,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';

import { FollowUp } from '../follow-ups.types';
import { IconComponent } from '../../layout/icon/icon.component';

const TYPE_LABELS: Record<string, string> = {
  CALL: 'Call',
  MEETING: 'Meeting',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

@Component({
  selector: 'app-follow-up-view',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './follow-up-view.component.html',
})
export class FollowUpViewComponent {
  readonly followUp = input<FollowUp | null>(null);
  readonly isOpen = input(false);
  readonly closed = output<void>();

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('followUpViewClose');

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
    const type = this.followUp()?.type;
    return type ? TYPE_LABELS[type] ?? type : '-';
  }

  isOverdue(): boolean {
    const f = this.followUp();
    if (!f || f.status !== 'PENDING' || !f.dueAt) return false;
    const due = new Date(f.dueAt).getTime();
    return !Number.isNaN(due) && due < Date.now();
  }

  statusLabel(): string {
    if (this.isOverdue()) return 'Overdue';
    const status = this.followUp()?.status;
    return status ? STATUS_LABELS[status] ?? status : '-';
  }

  statusClass(): string {
    if (this.isOverdue()) return 'bg-red-50 text-red-700 ring-red-200';
    switch (this.followUp()?.status) {
      case 'PENDING':
        return 'bg-amber-50 text-amber-700 ring-amber-200';
      case 'COMPLETED':
        return 'bg-green-50 text-green-700 ring-green-200';
      default:
        return 'bg-slate-100 text-slate-600 ring-slate-200';
    }
  }

  statusDotClass(): string {
    if (this.isOverdue()) return 'bg-red-500';
    switch (this.followUp()?.status) {
      case 'PENDING':
        return 'bg-amber-500';
      case 'COMPLETED':
        return 'bg-green-500';
      default:
        return 'bg-slate-400';
    }
  }

  relatedKind(): string {
    const f = this.followUp();
    if (f?.lead && typeof f.lead === 'object') return 'Lead';
    if (f?.client && typeof f.client === 'object') return 'Client';
    return '';
  }

  relatedName(): string {
    const f = this.followUp();
    const ref = f && typeof f.lead === 'object' ? f.lead : f && typeof f.client === 'object' ? f.client : null;
    return ref?.name || '-';
  }

  relatedPhone(): string {
    const f = this.followUp();
    const ref = f && typeof f.lead === 'object' ? f.lead : f && typeof f.client === 'object' ? f.client : null;
    return ref?.phoneNumber || '';
  }

  assignedName(): string {
    const user = this.followUp()?.assignedTo;
    return user && typeof user === 'object' ? user.name : '-';
  }

  createdByName(): string {
    const user = this.followUp()?.createdBy;
    return user && typeof user === 'object' ? user.name : '-';
  }

  hasDescription(): boolean {
    return !!this.followUp()?.description?.trim();
  }

  hasCompletedAt(): boolean {
    return !!this.followUp()?.completedAt;
  }

  displayDate(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
  }
}
