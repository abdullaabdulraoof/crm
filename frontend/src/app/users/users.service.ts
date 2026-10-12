import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { AssignedUserOption } from './users.types';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  getAssignedToOptions(): Observable<AssignedUserOption[]> {
    return this.http
      .get<{ success: boolean; data: { users: AssignedUserOption[] } }>('/api/users/options')
      .pipe(map((res) => res.data.users));
  }
}
