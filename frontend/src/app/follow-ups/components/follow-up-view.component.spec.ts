import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FollowUpViewComponent } from './follow-up-view.component';
import { FollowUp } from '../follow-ups.types';

const FOLLOWUP: FollowUp = {
  id: 'f1',
  companyId: 'c1',
  leadId: 'lead-1',
  lead: { id: 'lead-1', name: 'Acme Corp', phoneNumber: '555-0100' },
  clientId: null,
  client: null,
  assignedTo: { id: 'u2', name: 'Sam', email: 'sam@x.com' },
  type: 'CALL',
  subject: 'Call about quotation',
  description: 'Interested in the pro plan',
  dueAt: '2999-10-10T10:00:00.000Z',
  status: 'PENDING',
  completedAt: null,
  createdBy: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('FollowUpViewComponent', () => {
  let fixture: ComponentFixture<FollowUpViewComponent>;
  let component: FollowUpViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FollowUpViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('followUp', FOLLOWUP);
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the follow-up details read-only', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Follow-up details');
    expect(text).toContain('Call about quotation');
    expect(text).toContain('Call');
    expect(text).toContain('Lead');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('555-0100');
    expect(text).toContain('Sam');
    expect(text).toContain('Admin');
    expect(text).toContain('Pending');
    expect(text).toContain('Interested in the pro plan');
  });

  it('focuses the close button when opened', () => {
    const close = fixture.nativeElement.querySelector(
      'button[aria-label="Close"]'
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(close);
  });

  it('emits closed when the close button is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    (fixture.nativeElement.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();

    expect(closed).toBe(true);
  });

  it('closes on Escape', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toBe(true);
  });

  it('closes when the backdrop is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    (dialog.parentElement as HTMLElement).click();

    expect(closed).toBe(true);
  });

  it('shows dashes and hides description when there is none', () => {
    fixture.componentRef.setInput('followUp', {
      ...FOLLOWUP,
      description: '',
      assignedTo: null,
      createdBy: null,
    });
    fixture.detectChanges();

    expect(component.assignedName()).toBe('-');
    expect(component.createdByName()).toBe('-');
    expect(component.hasDescription()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Description');
  });

  it('flags an overdue follow-up', () => {
    fixture.componentRef.setInput('followUp', {
      ...FOLLOWUP,
      dueAt: '2000-01-01T00:00:00.000Z',
      status: 'PENDING',
    });
    fixture.detectChanges();

    expect(component.isOverdue()).toBe(true);
    expect(component.statusLabel()).toBe('Overdue');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Overdue');
  });
});
