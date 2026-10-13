import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeadViewComponent } from './lead-view.component';
import { Lead } from '../leads.types';

const LEAD: Lead = {
  id: 'lead-1',
  companyId: 'c1',
  createdBy: 'u1',
  name: 'Acme Corp',
  phoneNumber: '555-0100',
  email: 'a@b.com',
  source: 'WEBSITE',
  status: 'QUALIFIED',
  assignedTo: { id: 'u2', name: 'Sam', email: 'sam@x.com' },
  nextFollowUpAt: '2026-02-01T10:00:00.000Z',
  notes: 'Interested in the pro plan',
  clientId: null,
  convertedClientId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('LeadViewComponent', () => {
  let fixture: ComponentFixture<LeadViewComponent>;
  let component: LeadViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('lead', LEAD);
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the lead details read-only', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Lead details');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('555-0100');
    expect(text).toContain('a@b.com');
    expect(text).toContain('Website');
    expect(text).toContain('Qualified');
    expect(text).toContain('Sam');
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

  it('shows dashes for a lead without email or assignee', () => {
    fixture.componentRef.setInput('lead', {
      ...LEAD,
      email: null,
      assignedTo: null,
      notes: null,
    });
    fixture.detectChanges();

    expect(component.assignedName()).toBe('-');
    expect(component.hasNotes()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Notes');
  });

  it('flags a converted lead', () => {
    fixture.componentRef.setInput('lead', { ...LEAD, convertedClientId: 'client-9' });
    fixture.detectChanges();

    expect(component.isConverted()).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('converted to a client');
  });
});
