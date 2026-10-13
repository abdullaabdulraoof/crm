import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { FollowUpsPageComponent } from './follow-ups-page.component';
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
  description: '',
  dueAt: '2999-10-10T10:00:00.000Z',
  status: 'PENDING',
  completedAt: null,
  createdBy: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const OVERDUE: FollowUp = {
  ...FOLLOWUP,
  id: 'f2',
  subject: 'Past due call',
  dueAt: '2000-01-01T10:00:00.000Z',
  status: 'PENDING',
};

const SUMMARY_RESPONSE = {
  success: true,
  data: { total: 5, pending: 3, completed: 1, cancelled: 1, overdue: 2 },
};

const LIST_RESPONSE = {
  success: true,
  data: [FOLLOWUP],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('FollowUpsPageComponent', () => {
  let fixture: ComponentFixture<FollowUpsPageComponent>;
  let component: FollowUpsPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function setup(role = 'OWNER'): Promise<void> {
    seedUser(role);
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads?limit=100').flush({ success: true, data: [] });
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    httpMock.expectOne('/api/follow-ups?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();
  }

  function buttonLabels(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map(
      (b) => b.textContent?.trim() ?? ''
    );
  }

  it('renders the follow-ups returned by the API and the summary cards', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Acme Corp');
    expect(text).toContain('Call');
    expect(text).toContain('Call about quotation');
    expect(text).toContain('Sam');
    expect(text).toContain('Pending');
    expect(text).toContain('Page 1 of 1');
    expect(text).toContain('Total Follow-ups');
    expect(text).toContain('Overdue');
  });

  it('opens the follow-up view from a View action and closes it', async () => {
    await setup();
    const viewBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'View') as HTMLButtonElement;

    viewBtn.click();
    fixture.detectChanges();

    expect(component.viewing()?.id).toBe('f1');
    const viewEl = fixture.nativeElement.querySelector('app-follow-up-view') as HTMLElement | null;
    expect(viewEl).toBeTruthy();
    expect(viewEl?.textContent).toContain('Follow-up details');

    component.onViewClosed();
    fixture.detectChanges();

    expect(component.viewing()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-follow-up-view')).toBeNull();
  });

  it('flags PENDING follow-ups past their due date as Overdue', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(FollowUpsPageComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads?limit=100').flush({ success: true, data: [] });
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    httpMock
      .expectOne('/api/follow-ups?page=1&limit=10')
      .flush({ ...LIST_RESPONSE, data: [OVERDUE] });
    fixture.detectChanges();

    expect(component.isOverdue(OVERDUE)).toBe(true);
    expect(component.isOverdue(FOLLOWUP)).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Overdue');
  });

  it('shows a delete button for OWNER and hides it for SALES', async () => {
    await setup('OWNER');
    expect(buttonLabels()).toContain('Delete');

    TestBed.resetTestingModule();
    httpMock.verify();
    await setup('SALES');
    expect(buttonLabels()).not.toContain('Delete');
  });

  it('shows the empty state with an Add button when nothing matches', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads?limit=100').flush({ success: true, data: [] });
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    httpMock
      .expectOne('/api/follow-ups?page=1&limit=10')
      .flush({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No follow-ups found.');
    expect(text).toContain('Add Follow-up');
  });

  it('re-fetches with a status filter and resets to page 1', async () => {
    await setup();

    component.onFilterChange('status', 'COMPLETED');

    const req = httpMock.expectOne(
      (r) => r.url === '/api/follow-ups' && r.params.get('status') === 'COMPLETED'
    );
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    expect(component.page()).toBe(1);
  });

  it('sends combined filters together', async () => {
    await setup();
    component.filters.set({
      search: 'renewal',
      status: 'PENDING',
      type: '',
      assignedTo: 'u2',
      leadId: 'lead-1',
      clientId: '',
      from: '2026-10-01',
      to: '2026-10-31',
    });

    component.onFilterChange('type', 'CALL');

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/follow-ups' &&
        r.params.get('search') === 'renewal' &&
        r.params.get('status') === 'PENDING' &&
        r.params.get('type') === 'CALL' &&
        r.params.get('assignedTo') === 'u2' &&
        r.params.get('leadId') === 'lead-1' &&
        r.params.get('from') === '2026-10-01' &&
        r.params.get('to') === '2026-10-31' &&
        r.params.get('page') === '1'
    );
    req.flush(LIST_RESPONSE);
  });

  it('searches on Enter', async () => {
    await setup();
    const input = document.createElement('input');
    input.value = '  invoice  ';
    component.onSearchKeydown({ key: 'Enter', target: input } as unknown as KeyboardEvent);

    const req = httpMock.expectOne(
      (r) => r.url === '/api/follow-ups' && r.params.get('search') === 'invoice'
    );
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(true);
  });

  it('clears active filters and refreshes', async () => {
    await setup();
    component.filters.set({
      search: '',
      status: 'PENDING',
      type: 'CALL',
      assignedTo: '',
      leadId: '',
      clientId: '',
      from: '',
      to: '',
    });

    component.clearFilters();

    const req = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('paginates using backend metadata and page size', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(FollowUpsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads?limit=100').flush({ success: true, data: [] });
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    httpMock
      .expectOne('/api/follow-ups?page=1&limit=10')
      .flush({ ...LIST_RESPONSE, pagination: { page: 1, limit: 10, total: 25, totalPages: 3 } });
    fixture.detectChanges();

    component.nextPage();
    const page2 = httpMock.expectOne(
      (r) => r.url === '/api/follow-ups' && r.params.get('page') === '2'
    );
    page2.flush({ ...LIST_RESPONSE, pagination: { page: 2, limit: 10, total: 25, totalPages: 3 } });
    expect(component.page()).toBe(2);

    component.onPageSize('25');
    const resized = httpMock.expectOne(
      (r) => r.url === '/api/follow-ups' && r.params.get('limit') === '25' && r.params.get('page') === '1'
    );
    resized.flush(LIST_RESPONSE);
    expect(component.limit()).toBe(25);
  });

  it('marks a follow-up as completed after confirmation and refreshes the summary', async () => {
    await setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onComplete(FOLLOWUP);
    expect(confirmSpy).toHaveBeenCalledWith('Mark this follow-up as completed?');

    const putReq = httpMock.expectOne('/api/follow-ups/f1');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body.status).toBe('COMPLETED');
    putReq.flush({ success: true, data: { followup: { ...FOLLOWUP, status: 'COMPLETED' } } });

    httpMock.expectOne('/api/follow-ups?page=1&limit=10').flush(LIST_RESPONSE);
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    expect(component.success()).toBe('Follow-up marked as completed.');
  });

  it('cancels a follow-up after confirmation', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onCancel(FOLLOWUP);

    const putReq = httpMock.expectOne('/api/follow-ups/f1');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body.status).toBe('CANCELLED');
    putReq.flush({ success: true, data: { followup: { ...FOLLOWUP, status: 'CANCELLED' } } });

    httpMock.expectOne('/api/follow-ups?page=1&limit=10').flush(LIST_RESPONSE);
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    expect(component.success()).toBe('Follow-up cancelled.');
  });

  it('does not call the API when completion is dismissed', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onComplete(FOLLOWUP);

    httpMock.expectNone((r) => r.url === '/api/follow-ups/f1');
  });

  it('deletes a follow-up after confirmation and refreshes the summary', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onDelete(FOLLOWUP);

    const delReq = httpMock.expectOne('/api/follow-ups/f1');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ success: true, data: { id: 'f1' } });

    httpMock.expectOne('/api/follow-ups?page=1&limit=10').flush(LIST_RESPONSE);
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    expect(component.success()).toBe('Follow-up deleted successfully.');
  });

  it('does not call the API when deletion is dismissed', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onDelete(FOLLOWUP);

    httpMock.expectNone('/api/follow-ups/f1');
  });

  it('opens the form for editing after loading the full record', async () => {
    await setup();

    component.onEdit(FOLLOWUP);

    const getReq = httpMock.expectOne('/api/follow-ups/f1');
    getReq.flush({ success: true, data: { followup: FOLLOWUP } });

    expect(component.showForm()).toBe(true);
    expect(component.editing()?.id).toBe('f1');
  });

  it('surfaces a friendly error with a retry action when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads?limit=100').flush({ success: true, data: [] });
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    httpMock
      .expectOne('/api/follow-ups?page=1&limit=10')
      .flush({ success: false, error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.error()).toBe('Something went wrong. Please try again.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Retry');
  });

  it('shows loading state before the list resolves', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
    httpMock.expectOne('/api/leads?limit=100').flush({ success: true, data: [] });
    httpMock.expectOne('/api/clients/options').flush({ success: true, data: { clients: [] } });
    httpMock.expectOne('/api/follow-ups/summary').flush(SUMMARY_RESPONSE);
    const list = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading follow-ups');
    list.flush(LIST_RESPONSE);
  });
});
