import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { LeadsPageComponent } from './leads-page.component';
import { Lead } from '../leads.types';

const LEAD: Lead = {
  id: 'lead-1',
  companyId: 'c1',
  createdBy: 'u1',
  name: 'Acme Corp',
  phoneNumber: '555-0100',
  email: 'a@b.com',
  source: 'WEBSITE',
  status: 'NEW',
  assignedTo: { id: 'u2', name: 'Sam', email: 'sam@x.com' },
  nextFollowUpAt: null,
  notes: null,
  clientId: null,
  convertedClientId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [LEAD],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const SUMMARY_RESPONSE = {
  success: true,
  data: { total: 1, new: 1, qualified: 0, won: 0, byStatus: { NEW: 1 } },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('LeadsPageComponent', () => {
  let fixture: ComponentFixture<LeadsPageComponent>;
  let component: LeadsPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function setup(role = 'OWNER'): Promise<void> {
    seedUser(role);
    await TestBed.configureTestingModule({
      imports: [LeadsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LeadsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/leads?page=1&limit=10').flush(LIST_RESPONSE);
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads/summary').flush(SUMMARY_RESPONSE);
    fixture.detectChanges();
  }

  it('renders the leads returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Acme Corp');
    expect(text).toContain('555-0100');
    expect(text).toContain('Website');
    expect(text).toContain('Sam');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows a delete button for OWNER', async () => {
    await setup('OWNER');
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).toContain('Delete');
  });

  it('hides the delete button for SALES', async () => {
    await setup('SALES');
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Delete');
  });

  it('opens the add-lead form', async () => {
    await setup();
    const addBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Add Lead') as HTMLButtonElement;

    addBtn.click();
    fixture.detectChanges();

    expect(component.showForm()).toBe(true);
    const formEl = fixture.nativeElement.querySelector('app-lead-form');
    expect(formEl).toBeTruthy();
    // lead-form fetches user and client options when it initializes
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock
      .expectOne('/api/clients/options')
      .flush({ success: true, data: { clients: [] } });
  });

  it('opens the lead view from a View action and closes it', async () => {
    await setup();
    const viewBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'View') as HTMLButtonElement;

    viewBtn.click();
    fixture.detectChanges();

    expect(component.viewing()?.id).toBe('lead-1');
    const viewEl = fixture.nativeElement.querySelector('app-lead-view') as HTMLElement | null;
    expect(viewEl).toBeTruthy();
    expect(viewEl?.textContent).toContain('Acme Corp');

    component.onViewClosed();
    fixture.detectChanges();

    expect(component.viewing()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-lead-view')).toBeNull();
  });

  it('deletes a lead after confirmation and refreshes', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onDelete(LEAD);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/leads/lead-1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Lead deleted' });
    httpMock.expectOne('/api/leads?page=1&limit=10').flush(LIST_RESPONSE);
    httpMock.expectOne('/api/leads/summary').flush(SUMMARY_RESPONSE);
    fixture.detectChanges();

    expect(component.success()).toBe('Lead deleted successfully.');
    vi.restoreAllMocks();
  });

  it('does not delete when confirmation is cancelled', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onDelete(LEAD);
    fixture.detectChanges();

    httpMock.expectNone('/api/leads/lead-1');
    vi.restoreAllMocks();
  });

  it('shows an error banner when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [LeadsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LeadsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/leads?page=1&limit=10')
      .flush({ success: false }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads/summary').flush(SUMMARY_RESPONSE);
    fixture.detectChanges();

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });

  it('sends a status filter and resets to page 1', async () => {
    await setup();
    component.page.set(3);
    component.onFilterChange('status', 'WON');
    fixture.detectChanges();

    httpMock
      .expectOne('/api/leads?page=1&limit=10&status=WON')
      .flush(LIST_RESPONSE);

    expect(component.page()).toBe(1);
  });
});
