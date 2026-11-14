export const MODES = ['round_table', 'debate', 'autonomous', 'expert_review', 'guided'] as const;
export type MissionMode = (typeof MODES)[number];
export const ROLES = [
  'Researcher',
  'Architect',
  'Developer',
  'Analyst',
  'Reviewer',
  'Security Specialist',
  'QA Engineer',
  'Judge',
] as const;
export type AgentRole = (typeof ROLES)[number];
export const PROVIDERS = [
  'openai',
  'gemini',
  'anthropic',
  'openrouter',
  'ollama',
  'lmstudio',
  'compatible',
  'custom',
] as const;
export type ProviderKind = (typeof PROVIDERS)[number];
export type Protocol = 'openai' | 'anthropic' | 'gemini' | 'ollama';
export type MissionStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'interrupted';
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_color: string;
  created_at: string;
}
export interface Preferences {
  default_mode: MissionMode;
  token_budget: number;
  reduced_motion: boolean;
  email_notifications: boolean;
}
export interface SessionInfo {
  user: User | null;
  csrfToken: string | null;
  expiresAt: string | null;
}
export interface ProviderConnection {
  id: string;
  name: string;
  kind: ProviderKind;
  protocol: Protocol;
  base_url: string;
  default_model: string;
  selected_models: string[];
  key_hint: string | null;
  has_credential: boolean;
  enabled: boolean;
  verification_status: 'unverified' | 'verified' | 'error';
  verified_at: string | null;
  verified_model: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  avatar: string;
  system_prompt: string;
  connection_id: string | null;
  model: string | null;
  temperature: number;
  max_output_tokens: number;
  enabled: boolean;
  configuration: Record<string, unknown>;
  created_at: string;
}
export interface Mission {
  id: string;
  title: string;
  brief: string;
  mode: MissionMode;
  status: MissionStatus;
  settings: { approval_required?: boolean; approved_at?: string; parent_mission_id?: string };
  agent_snapshot: Agent[];
  synthesis_agent_id: string;
  token_budget: number;
  tokens_used: number;
  tokens_reserved: number;
  max_steps: number;
  iteration: number;
  version: number;
  error: string | null;
  parent_mission_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  task_count?: number;
  completed_count?: number;
}
export interface Task {
  id: string;
  mission_id: string;
  agent_id: string;
  title: string;
  instructions: string;
  kind: string;
  status: TaskStatus;
  position: number;
  recipient_agent_id: string | null;
  attempts: number;
  output: string | null;
  response_model: string | null;
  provider_request_id: string | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
export interface AgentMessage {
  id: string;
  mission_id: string;
  task_id: string | null;
  from_agent_id: string | null;
  to_agent_id: string | null;
  role: 'user' | 'assistant' | 'system';
  kind: string;
  content: string;
  created_at: string;
}
export interface MissionEvent {
  id: string;
  mission_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}
export interface MissionOutput {
  id: string;
  mission_id: string;
  agent_id: string;
  content: string;
  model: string;
  evidence: Evidence[];
  created_at: string;
}
export interface Evidence {
  task_id: string;
  message_id: string | null;
  agent: string;
  title: string;
  model: string | null;
  provider_request_id: string | null;
}
export interface Usage {
  id: string;
  purpose: string;
  total_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated: boolean;
  duration_ms: number;
  response_model: string | null;
  created_at: string;
}
export interface MissionDetail {
  mission: Mission;
  tasks: Task[];
  dependencies: { task_id: string; depends_on: string }[];
  messages: AgentMessage[];
  events: MissionEvent[];
  output: MissionOutput | null;
  usage: Usage[];
}
export interface DashboardData {
  missions: Mission[];
  agents: Agent[];
  connections: ProviderConnection[];
  stats: {
    missions: number;
    completed: number;
    active: number;
    agents: number;
    verified: number;
    tokens: number;
  };
  activity: MissionEvent[];
}
export const MODE_LABELS: Record<MissionMode, string> = {
  round_table: 'Round Table',
  debate: 'Debate Arena',
  autonomous: 'Autonomous Mission',
  expert_review: 'Expert Review',
  guided: 'Human-Guided',
};
export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  compatible: 'OpenAI-compatible',
  custom: 'Custom endpoint',
};
export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://127.0.0.1:11434',
  lmstudio: 'http://127.0.0.1:1234/v1',
  compatible: '',
  custom: '',
};
export const TERMINAL_STATUSES: MissionStatus[] = ['completed', 'failed', 'cancelled'];
