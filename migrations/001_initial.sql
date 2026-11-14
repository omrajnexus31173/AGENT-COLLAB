CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL CHECK (email = lower(email)),
  name varchar(80) NOT NULL,
  password_hash text NOT NULL,
  avatar_color varchar(16) NOT NULL DEFAULT '#a78bfa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_token char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_mode varchar(24) NOT NULL DEFAULT 'round_table',
  token_budget integer NOT NULL DEFAULT 30000 CHECK (token_budget BETWEEN 1000 AND 100000),
  reduced_motion boolean NOT NULL DEFAULT false,
  email_notifications boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  kind varchar(24) NOT NULL CHECK (kind IN ('openai','gemini','anthropic','openrouter','ollama','lmstudio','compatible','custom')),
  protocol varchar(16) NOT NULL CHECK (protocol IN ('openai','gemini','anthropic','ollama')),
  base_url text NOT NULL,
  encrypted_key text,
  credential_iv text,
  credential_tag text,
  key_hint varchar(12),
  default_model varchar(160) NOT NULL,
  selected_models jsonb NOT NULL DEFAULT '[]',
  enabled boolean NOT NULL DEFAULT true,
  verification_status varchar(16) NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','error')),
  verified_at timestamptz,
  verified_model varchar(160),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name),
  CHECK ((encrypted_key IS NULL) = (credential_iv IS NULL AND credential_tag IS NULL))
);
CREATE INDEX provider_connections_user_idx ON provider_connections(user_id);
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(60) NOT NULL,
  role varchar(32) NOT NULL CHECK (role IN ('Researcher','Architect','Developer','Analyst','Reviewer','Security Specialist','QA Engineer','Judge')),
  color varchar(16) NOT NULL DEFAULT '#a78bfa',
  avatar varchar(24) NOT NULL DEFAULT 'atlas',
  system_prompt text NOT NULL DEFAULT '',
  connection_id uuid REFERENCES provider_connections(id) ON DELETE SET NULL,
  model varchar(160),
  temperature numeric(3,2) NOT NULL DEFAULT 0.4 CHECK (temperature BETWEEN 0 AND 2),
  max_output_tokens integer NOT NULL DEFAULT 2048 CHECK (max_output_tokens BETWEEN 256 AND 8192),
  enabled boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX agents_user_idx ON agents(user_id);
CREATE TABLE missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_mission_id uuid REFERENCES missions(id) ON DELETE SET NULL,
  title varchar(140) NOT NULL,
  brief text NOT NULL CHECK (length(brief) BETWEEN 10 AND 20000),
  mode varchar(24) NOT NULL CHECK (mode IN ('round_table','debate','autonomous','expert_review','guided')),
  status varchar(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','awaiting_approval','completed','failed','cancelled','interrupted')),
  settings jsonb NOT NULL DEFAULT '{}',
  agent_snapshot jsonb NOT NULL,
  synthesis_agent_id uuid NOT NULL,
  token_budget integer NOT NULL CHECK (token_budget BETWEEN 1000 AND 100000),
  tokens_used integer NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  tokens_reserved integer NOT NULL DEFAULT 0 CHECK (tokens_reserved >= 0),
  max_steps integer NOT NULL DEFAULT 24 CHECK (max_steps BETWEEN 3 AND 32),
  max_retries integer NOT NULL DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 3),
  timeout_ms integer NOT NULL DEFAULT 90000 CHECK (timeout_ms BETWEEN 10000 AND 180000),
  iteration integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  worker_id uuid,
  lease_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX missions_user_created_idx ON missions(user_id, created_at DESC);
CREATE INDEX missions_runnable_idx ON missions(status, lease_until);
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  title varchar(180) NOT NULL,
  instructions text NOT NULL,
  kind varchar(24) NOT NULL DEFAULT 'work',
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped','interrupted')),
  position integer NOT NULL,
  recipient_agent_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 2,
  next_attempt_at timestamptz,
  input_snapshot jsonb,
  output text,
  response_model varchar(160),
  provider_request_id varchar(200),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE(mission_id, position)
);
CREATE INDEX tasks_mission_status_idx ON tasks(mission_id, status, position);
CREATE TABLE task_dependencies (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id, depends_on),
  CHECK (task_id <> depends_on)
);
CREATE TABLE agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  from_agent_id uuid,
  to_agent_id uuid,
  role varchar(16) NOT NULL CHECK (role IN ('user','assistant','system')),
  kind varchar(24) NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_messages_mission_idx ON agent_messages(mission_id, created_at);
CREATE TABLE mission_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  type varchar(48) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_events_cursor_idx ON mission_events(mission_id, id);
CREATE TABLE mission_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES missions(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  content text NOT NULL,
  evidence jsonb NOT NULL,
  model varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES missions(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES provider_connections(id) ON DELETE SET NULL,
  agent_id uuid,
  purpose varchar(24) NOT NULL,
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL CHECK (total_tokens >= 0),
  estimated boolean NOT NULL DEFAULT false,
  duration_ms integer NOT NULL,
  response_model varchar(160),
  provider_request_id varchar(200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_records_user_time_idx ON usage_records(user_id, created_at DESC);
CREATE INDEX usage_records_mission_idx ON usage_records(mission_id);
CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(64) NOT NULL,
  resource_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_user_time_idx ON audit_logs(user_id, created_at DESC);
CREATE TABLE rate_limits (
  key_hash char(64) PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(expires_at);
