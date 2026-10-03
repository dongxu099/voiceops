import type { Config, Scenario, Session, SessionMode, ToolEvent, SupportCase, ProviderReport } from './types';

export class ApiError extends Error {}

async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ApiError(typeof error?.detail === 'string' ? error.detail : `Request failed (${response.status}). Try again.`);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('The support service could not be reached. Check the connection and try again.');
  } finally {
    window.clearTimeout(timeout);
  }
}

const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export const api = {
  config: () => request<Config>('/config'),
  scenarios: () => request<Scenario[]>('/scenarios'),
  create: (scenarioId: string, mode: SessionMode) => request<Session>('/sessions', { scenario_id: scenarioId, mode }),
  session: (id: string) => request<Session>(sessionPath(id)),
  connect: (id: string, transport: 'websocket' | 'webrtc') => request<{ signed_url?: string; conversation_token?: string }>(`${sessionPath(id)}/connect`, { transport }),
  tool: (id: string, name: string, parameters: unknown) => request<{result: unknown; event: ToolEvent}>(`${sessionPath(id)}/tools`, { tool_name: name, parameters }),
  preview: (id: string, message: string) => request<Session>(`${sessionPath(id)}/preview`, { message }),
  confirm: (id: string, action: string) => request<{case: SupportCase; session: Session}>(`${sessionPath(id)}/confirm/${encodeURIComponent(action)}`, undefined, 'POST'),
  message: (id: string, role: 'user' | 'agent', text: string) => request<{ok: true}>(`${sessionPath(id)}/messages`, { role, text }),
  provider: (id: string, conversationId: string) => request<{ok: true}>(`${sessionPath(id)}/provider`, { conversation_id: conversationId }),
  end: (id: string) => request<Session>(`${sessionPath(id)}/end`, undefined, 'POST'),
  report: (id: string) => request<ProviderReport>(`${sessionPath(id)}/provider-report`),
};
