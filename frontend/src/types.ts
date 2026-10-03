export type SessionMode = 'preview' | 'text' | 'voice';
export type ScenarioId = 'permissions' | 'quota' | 'outage' | 'escalation';

export interface Config {
  product_name: string;
  key_loaded: boolean;
  agent_provisioned: boolean;
  cloud_status: 'not_configured' | 'ready' | 'missing_permissions';
  max_session_seconds: number;
  voice_rate_per_minute: number;
  price_note: string;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  description: string;
  first_user_message: string;
  workspace_id: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  monthly_limit: number;
  used_requests: number;
  rate_limit_per_minute: number;
}

export interface Message { role: 'user' | 'agent' | 'system'; text: string }
export interface ToolEvent {
  id: string;
  type: string;
  tool_name: string;
  status: 'success' | 'error' | 'awaiting_confirmation';
  duration_ms: number;
  parameters: Record<string, unknown>;
  result: unknown;
  source_ids: string[];
}
export interface Action {
  id: string;
  summary: string;
  priority: string;
  status: string;
}
export interface SupportCase extends Action {}
export interface Session {
  id: string;
  scenario_id: ScenarioId;
  mode: SessionMode;
  status: string;
  workspace: Workspace;
  messages: Message[];
  events: ToolEvent[];
  pending_actions: Action[];
  cases: SupportCase[];
  metrics: {
    tool_calls: number;
    tool_failures: number;
    elapsed_seconds: number;
    estimated_voice_usd: number;
    price_note: string;
  };
  provider_conversation_id: string | null;
}

export interface ProviderReport {
  available: boolean;
  reason?: string;
  status?: string;
  metadata?: {
    call_duration_secs?: number | null;
    cost?: number | null;
    cost_fiat?: number | null;
    charging?: unknown;
  };
  note?: string;
}
