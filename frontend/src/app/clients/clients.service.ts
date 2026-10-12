import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ClientOption } from './clients.types';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly http = inject(HttpClient);

  getClients(): Observable<ClientOption[]> {
    return this.http
      .get<{ success: boolean; data: { clients: ClientOption[] } }>('/api/clients/options')
      .pipe(map((res) => res.data.clients));
  }
}
