import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Lead, LeadSource } from '../leads.types';
import { IconComponent } from '../../layout/icon/icon.component';

const SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: 'Website',
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  SOCIAL_MEDIA: 'Social Media',
  OTHER: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL_SENT: 'Proposal Sent',
  WON: 'Won',
  LOST: 'Lost',
};

@Component({
  selector: 'app-lead-view',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './lead-view.component.html',
})
export class LeadViewComponent {
  readonly lead = input<Lead | null>(null);
  readonly isOpen = input(false);
  readonly closed = output<void>();

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('leadViewClose');

  readonly statusLabel = computed(() => {
    const status = this.lead()?.status;
    return status ? STATUS_LABELS[status] ?? status : '-';
  });

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

  sourceLabel(): string {
    const source = this.lead()?.source;
    return source ? SOURCE_LABELS[source] ?? source : '-';
  }

  assignedName(): string {
    return this.lead()?.assignedTo?.name || '-';
  }

  isConverted(): boolean {
    return !!this.lead()?.convertedClientId;
  }

  hasNotes(): boolean {
    return !!this.lead()?.notes?.trim();
  }

  displayDate(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
  }

  statusClass(): string {
    switch (this.lead()?.status) {
      case 'WON':
        return 'bg-green-50 text-green-700 ring-green-200';
      case 'LOST':
        return 'bg-red-50 text-red-700 ring-red-200';
      case 'QUALIFIED':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
      case 'PROPOSAL_SENT':
        return 'bg-sky-50 text-sky-700 ring-sky-200';
      case 'CONTACTED':
        return 'bg-amber-50 text-amber-700 ring-amber-200';
      default:
        return 'bg-slate-100 text-slate-600 ring-slate-200';
    }
  }

  statusDotClass(): string {
    switch (this.lead()?.status) {
      case 'WON':
        return 'bg-green-500';
      case 'LOST':
        return 'bg-red-500';
      case 'QUALIFIED':
        return 'bg-indigo-500';
      case 'PROPOSAL_SENT':
        return 'bg-sky-500';
      case 'CONTACTED':
        return 'bg-amber-500';
      default:
        return 'bg-slate-400';
    }
  }
}
