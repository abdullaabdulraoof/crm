import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  Client,
  ClientFormData,
  ClientListParams,
  ClientOption,
  ClientResponse,
  ClientsListResponse,
} from './clients.types';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly http = inject(HttpClient);

  getClients(): Observable<ClientOption[]> {
    return this.http
      .get<{ success: boolean; data: { clients: ClientOption[] } }>('/api/clients/options')
      .pipe(map((res) => res.data.clients));
  }

  getClientsList(params: ClientListParams = {}): Observable<ClientsListResponse> {
    return this.http.get<ClientsListResponse>('/api/clients', { params: toHttpParams(params) });
  }

  getClient(id: string): Observable<ClientResponse> {
    return this.http.get<ClientResponse>('/api/clients/' + id);
  }

  createClient(data: ClientFormData): Observable<ClientResponse> {
    return this.http.post<ClientResponse>('/api/clients', data);
  }

  updateClient(id: string, data: Partial<ClientFormData>): Observable<ClientResponse> {
    return this.http.put<ClientResponse>('/api/clients/' + id, data);
  }

  deleteClient(id: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>('/api/clients/' + id);
  }
}

function toHttpParams(params: ClientListParams): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}
