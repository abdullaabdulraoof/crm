import { Routes } from '@angular/router';

import { authGuard, alreadyAuthGuard } from './auth/auth.guard';
import { ForgotPassword } from './auth/forgot-password/forgot-password.component';
import { Login } from './auth/login/login.component';
import { ResetPassword } from './auth/reset-password/reset-password.component';
import { Dashboard } from './dashboard/dashboard.component';
import { LeadsPageComponent } from './leads/pages/leads-page.component';
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
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'leads', component: LeadsPageComponent, canActivate: [authGuard] },
  { path: 'follow-ups', component: FollowUpsPageComponent, canActivate: [authGuard] },
  { path: 'products', component: ProductsPageComponent, canActivate: [authGuard] },
  { path: 'quotations', component: QuotationsPageComponent, canActivate: [authGuard] },
  { path: 'invoices', component: InvoicesPageComponent, canActivate: [authGuard] },
  { path: 'payments', component: PaymentsPageComponent, canActivate: [authGuard] },
  { path: 'reports', component: ReportsPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' },
];
