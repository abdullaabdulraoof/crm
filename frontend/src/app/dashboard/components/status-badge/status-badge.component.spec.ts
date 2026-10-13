import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(StatusBadgeComponent);
  });

  it('humanizes underscored status values', () => {
    fixture.componentRef.setInput('status', 'PARTIALLY_PAID');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.trim()).toBe('Partially Paid');
  });

  it('applies the positive emerald tone to paid statuses', () => {
    fixture.componentRef.setInput('status', 'PAID');
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(span.className).toContain('bg-emerald-50');
  });

  it('falls back to a neutral tone for unknown statuses', () => {
    fixture.componentRef.setInput('status', 'SOMETHING_ELSE');
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(span.className).toContain('bg-slate-100');
  });
});
