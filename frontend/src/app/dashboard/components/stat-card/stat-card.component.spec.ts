import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatCardComponent } from './stat-card.component';

describe('StatCardComponent', () => {
  let fixture: ComponentFixture<StatCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatCardComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(StatCardComponent);
  });

  it('renders the label, value and hint', () => {
    fixture.componentRef.setInput('label', 'Total Leads');
    fixture.componentRef.setInput('value', 42);
    fixture.componentRef.setInput('hint', 'all time');
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Total Leads');
    expect(text).toContain('42');
    expect(text).toContain('all time');
  });

  it('uses a compact blue icon treatment for the metric tile', () => {
    fixture.componentRef.setInput('tone', 'emerald');
    fixture.detectChanges();
    const icon = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(icon.className).toContain('bg-blue-600');
    expect(icon.className).toContain('rounded-full');
  });
});
