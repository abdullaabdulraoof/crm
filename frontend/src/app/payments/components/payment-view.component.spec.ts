import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentViewComponent } from './payment-view.component';
import { Payment } from '../payments.types';

const PAYMENT: Payment = {
  id: 'pay1',
  companyId: 'c1',
  paymentNumber: 'PAY-2026-0001',
  invoiceId: 'i1',
  invoice: {
    id: 'i1',
    invoiceNumber: 'INV-2026-0001',
    status: 'PARTIALLY_PAID',
    totalAmount: 1000,
    amountPaid: 400,
    balanceDue: 600,
  },
  clientId: 'cl1',
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1', email: 'z@x.com' },
  amount: 400,
  paymentDate: '2026-10-01T00:00:00.000Z',
  method: 'UPI',
  transactionReference: 'UPI-123',
  status: 'RECORDED',
  notes: 'First instalment',
  recordedBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  voidReason: '',
  voidedBy: null,
  voidedAt: null,
  createdAt: null,
  updatedAt: null,
};

describe('PaymentViewComponent', () => {
  let fixture: ComponentFixture<PaymentViewComponent>;
  let component: PaymentViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentViewComponent);
    component = fixture.componentInstance;
    component.payment = PAYMENT;
    component.isOpen = true;
    component.canVoid = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the payment details', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PAY-2026-0001');
    expect(text).toContain('INV-2026-0001');
    expect(text).toContain('Zephyr Corp');
    expect(text).toContain('UPI');
    expect(text).toContain('UPI-123');
    expect(text).toContain('Owner');
  });

  it('shows the Void action to OWNER/ADMIN for a recorded payment', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(component.canShowVoid()).toBe(true);
    expect(text).toContain('Void Payment');
  });

  it('hides the Void action when the user cannot void', () => {
    fixture.componentRef.setInput('canVoid', false);
    fixture.detectChanges();
    expect(component.canShowVoid()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Void Payment');
  });

  it('hides the Void action for a voided payment', () => {
    fixture.componentRef.setInput('payment', { ...PAYMENT, status: 'VOIDED' });
    fixture.detectChanges();
    expect(component.canShowVoid()).toBe(false);
  });

  it('requires a reason before emitting a void', () => {
    let emitted: string | null = null;
    component.voided.subscribe((r) => (emitted = r));

    component.startVoid();
    component.confirmVoid();

    expect(component.localError()).toBe('A reason is required to void a payment.');
    expect(emitted).toBeNull();
  });

  it('emits the void reason', () => {
    let emitted: string | null = null;
    component.voided.subscribe((r) => (emitted = r));

    component.startVoid();
    component.reason.set('Customer reversed the transfer');
    component.confirmVoid();

    expect(emitted).toBe('Customer reversed the transfer');
  });

  it('emits closed when the close button is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));
    component.onClose();
    expect(closed).toBe(true);
  });
});
