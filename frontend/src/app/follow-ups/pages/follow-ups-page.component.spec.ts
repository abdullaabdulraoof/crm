import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
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
  dueAt: '2026-10-10T10:00:00.000Z',
  status: 'PENDING',
  completedAt: null,
  createdBy: { id: 'u1', name: 'Admin', email: 'a@x.com' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
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
    httpMock.expectOne('/api/follow-ups?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();
  }

  it('renders the follow-ups returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Acme Corp');
    expect(text).toContain('Call');
    expect(text).toContain('Call about quotation');
    expect(text).toContain('Sam');
    expect(text).toContain('Pending');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows a delete button for OWNER', async () => {
    await setup('OWNER');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Delete');
  });

  it('hides the delete button for SALES', async () => {
    await setup('SALES');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Delete');
  });

  it('shows the empty state with an Add button when nothing matches', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [FollowUpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowUpsPageComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/users/options').flush({ success: true, data: { users: [] } });
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

  it('clears active filters and refreshes', async () => {
    await setup();
    component.filters.set({ search: '', status: 'PENDING', type: 'CALL', assignedTo: '', from: '', to: '' });

    component.clearFilters();

    const req = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('marks a follow-up as completed after confirmation', async () => {
    await setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onComplete(FOLLOWUP);
    expect(confirmSpy).toHaveBeenCalledWith('Mark this follow-up as completed?');

    const putReq = httpMock.expectOne('/api/follow-ups/f1');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body.status).toBe('COMPLETED');
    putReq.flush({ success: true, data: { followup: { ...FOLLOWUP, status: 'COMPLETED' } } });

    const listReq = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    listReq.flush(LIST_RESPONSE);
    expect(component.success()).toBe('Follow-up marked as completed.');
  });

  it('does not call the API when completion is dismissed', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onComplete(FOLLOWUP);

    httpMock.expectNone((r) => r.url === '/api/follow-ups/f1');
  });

  it('deletes a follow-up after confirmation', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onDelete(FOLLOWUP);

    const delReq = httpMock.expectOne('/api/follow-ups/f1');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ success: true, data: { id: 'f1' } });

    const listReq = httpMock.expectOne('/api/follow-ups?page=1&limit=10');
    listReq.flush(LIST_RESPONSE);
    expect(component.success()).toBe('Follow-up deleted successfully.');
  });

  it('opens the form for editing after loading the full record', async () => {
    await setup();

    component.onEdit(FOLLOWUP);

    const getReq = httpMock.expectOne('/api/follow-ups/f1');
    getReq.flush({ success: true, data: { followup: FOLLOWUP } });

    expect(component.showForm()).toBe(true);
    expect(component.editing()?.id).toBe('f1');
  });

  it('surfaces a friendly error when the list request fails', async () => {
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
    httpMock
      .expectOne('/api/follow-ups?page=1&limit=10')
      .flush({ success: false, error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });
});
