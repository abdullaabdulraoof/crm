import { IconName } from './icon/icon.component';

export interface NavItem {
  label: string;
  route: string;
  icon: IconName;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

// Only routes that actually exist in app.routes.ts are listed here. Clients,
// Users and Activity Logs are intentionally absent (no such pages/routes yet).
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Main',
    items: [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      { label: 'Leads', route: '/leads', icon: 'leads' },
      { label: 'Follow-ups', route: '/follow-ups', icon: 'follow-up' },
    ],
  },
  {
    heading: 'Sales',
    items: [
      { label: 'Products', route: '/products', icon: 'product' },
      { label: 'Quotations', route: '/quotations', icon: 'quotation' },
      { label: 'Invoices', route: '/invoices', icon: 'invoice' },
      { label: 'Payments', route: '/payments', icon: 'payment' },
    ],
  },
  {
    heading: 'Insights',
    items: [{ label: 'Reports', route: '/reports', icon: 'report' }],
  },
];
