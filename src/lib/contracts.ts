import { z } from 'zod';
import { MODES, PROVIDERS, ROLES } from './types';

export const idSchema = z.uuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10, 'Use at least 10 characters.').max(128);
export const signupSchema = z
  .object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema })
  .strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const providerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(PROVIDERS),
    protocol: z.enum(['openai', 'anthropic', 'gemini', 'ollama']),
    base_url: z.string().trim().url().max(2048),
    default_model: z.string().trim().min(1).max(160),
    api_key: z.string().max(1024).optional(),
    selected_models: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
    enabled: z.boolean().default(true),
  })
  .strict();
export const agentSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    role: z.enum(ROLES),
    color: hexColor.default('#a78bfa'),
    avatar: z.enum(['atlas', 'aegis', 'forge', 'spectre']).default('atlas'),
    system_prompt: z.string().trim().max(6000).default(''),
    connection_id: idSchema.nullable().default(null),
    model: z.string().trim().max(160).nullable().default(null),
    temperature: z.number().min(0).max(2).default(0.4),
    max_output_tokens: z.number().int().min(256).max(8192).default(2048),
    enabled: z.boolean().default(true),
    configuration: z.object({ specialty: z.string().max(200).optional() }).default({}),
  })
  .strict();
export const missionSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    brief: z.string().trim().min(10).max(20000),
    mode: z.enum(MODES),
    agent_ids: z
      .array(idSchema)
      .min(2)
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length, 'Choose different agents.'),
    synthesis_agent_id: idSchema,
    token_budget: z.number().int().min(1000).max(100000).default(30000),
    max_steps: z.number().int().min(3).max(32).default(24),
    max_retries: z.number().int().min(0).max(3).default(2),
    timeout_ms: z.number().int().min(10000).max(180000).default(90000),
  })
  .strict()
  .refine((v) => v.agent_ids.includes(v.synthesis_agent_id), {
    message: 'The lead must belong to your squad.',
    path: ['synthesis_agent_id'],
  });
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['pause', 'resume', 'cancel', 'approve']) }).strict(),
  z
    .object({
      action: z.literal('instruct'),
      instruction: z.string().trim().min(3).max(6000),
      agent_id: idSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('reassign'), task_id: idSchema, agent_id: idSchema }).strict(),
]);
export const preferencesSchema = z
  .object({
    default_mode: z.enum(MODES),
    token_budget: z.number().int().min(1000).max(100000),
    reduced_motion: z.boolean(),
    email_notifications: z.boolean(),
  })
  .strict();
export const profileSchema = z
  .object({ name: z.string().trim().min(2).max(80), avatar_color: hexColor })
  .strict();
export const passwordChangeSchema = z
  .object({ current_password: z.string().min(1).max(128), new_password: passwordSchema })
  .strict();
export const continueSchema = z
  .object({
    instruction: z.string().trim().min(10).max(16000),
    agent_ids: z.array(idSchema).min(2).max(6).optional(),
  })
  .strict();
