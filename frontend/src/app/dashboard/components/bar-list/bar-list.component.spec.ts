import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BarListComponent } from './bar-list.component';

describe('BarListComponent', () => {
  let fixture: ComponentFixture<BarListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BarListComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(BarListComponent);
  });

  it('renders one row per bar with its width', () => {
    fixture.componentRef.setInput('bars', [
      { key: 'NEW', label: 'New', value: 2, width: '100%' },
      { key: 'WON', label: 'Won', value: 0, width: '0%' },
    ]);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('li');
    expect(rows.length).toBe(2);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('New');
    expect(text).toContain('Won');
  });

  it('applies the requested fill tone', () => {
    fixture.componentRef.setInput('tone', 'indigo');
    fixture.componentRef.setInput('bars', [{ key: 'A', label: 'A', value: 1, width: '100%' }]);
    fixture.detectChanges();
    const fill = fixture.nativeElement.querySelector('li span span') as HTMLElement;
    expect(fill.className).toContain('bg-blue-400');
  });
});
