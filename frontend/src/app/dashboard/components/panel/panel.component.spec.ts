import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PanelComponent } from './panel.component';

@Component({
  imports: [PanelComponent],
  template: `
    <app-panel title="Pipeline" subtitle="By status">
      <span panelAction>action</span>
      <p>body content</p>
    </app-panel>
  `,
})
class HostComponent {}

describe('PanelComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders the title, subtitle, projected action and body', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Pipeline');
    expect(text).toContain('By status');
    expect(text).toContain('action');
    expect(text).toContain('body content');
  });
});
