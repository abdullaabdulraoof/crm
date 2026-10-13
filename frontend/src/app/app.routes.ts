import { Routes } from '@angular/router';

import { authGuard, alreadyAuthGuard } from './auth/auth.guard';
import { ForgotPassword } from './auth/forgot-password/forgot-password.component';
import { Login } from './auth/login/login.component';
import { ResetPassword } from './auth/reset-password/reset-password.component';
import { Dashboard } from './dashboard/dashboard.component';
import { LayoutComponent } from './layout/layout.component';
import { LeadsPageComponent } from './leads/pages/leads-page.component';
import { ClientsPageComponent } from './clients/pages/clients-page.component';
import { FollowUpsPageComponent } from './follow-ups/pages/follow-ups-page.component';
import { ProductsPageComponent } from './products/pages/products-page.component';
import { QuotationsPageComponent } from './quotations/pages/quotations-page.component';
import { InvoicesPageComponent } from './invoices/pages/invoices-page.component';
import { PaymentsPageComponent } from './payments/pages/payments-page.component';
import { ReportsPageComponent } from './reports/pages/reports-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login, canActivate: [alreadyAuthGuard] },
  { path: 'forgot-password', component: ForgotPassword },
  { path: 'reset-password', component: ResetPassword },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard, data: { title: 'Dashboard' } },
      { path: 'leads', component: LeadsPageComponent, data: { title: 'Leads' } },
      { path: 'clients', component: ClientsPageComponent, data: { title: 'Clients' } },
      { path: 'follow-ups', component: FollowUpsPageComponent, data: { title: 'Follow-ups' } },
      { path: 'products', component: ProductsPageComponent, data: { title: 'Products' } },
      { path: 'quotations', component: QuotationsPageComponent, data: { title: 'Quotations' } },
      { path: 'invoices', component: InvoicesPageComponent, data: { title: 'Invoices' } },
      { path: 'payments', component: PaymentsPageComponent, data: { title: 'Payments' } },
      { path: 'reports', component: ReportsPageComponent, data: { title: 'Reports' } },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
