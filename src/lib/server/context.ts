import type { Agent, MissionMode } from '@/lib/types';
import type { ChatMessage } from './providers';
import { NO_TOOLS_RULE } from './plans';
import { digest } from './crypto';
export interface DependencyFinding {
  id: string;
  title: string;
  output: string;
  agent_id: string;
}
export function buildContext(input: {
  agent: Agent;
  mode: MissionMode;
  title: string;
  brief: string;
  task: { id: string; title: string; instructions: string; kind: string };
  dependencies: DependencyFinding[];
  instructions: { content: string; created_at: string }[];
  squad: Agent[];
  maxSteps: number;
}) {
  const { agent, task } = input;
  let system = `${NO_TOOLS_RULE}\n\nYour identity: ${agent.name}, ${agent.role}.\n${agent.system_prompt}\nSpecialty: ${String(agent.configuration.specialty || 'General expertise')}\nMission mode: ${input.mode}. Current task: ${task.title}.\n${task.instructions}`;
  if (task.kind === 'plan')
    system += `\nReturn ONLY a JSON object with this exact schema: {"tasks":[{"key":"research","title":"short title","instructions":"concrete assignment","agent_id":"uuid","depends_on":[]}]}. Between 1 and ${Math.min(6, input.maxSteps - 2)} tasks. Keys are lowercase identifiers. Dependencies must reference other keys in this plan, never synthesis or plan, and must be acyclic. Available agents:\n${JSON.stringify(input.squad.map((a) => ({ id: a.id, name: a.name, role: a.role })))}\nUse at least two distinct agents across planner, delegates, and lead. Do not invent agents or tools.`;
  if (task.kind === 'synthesis')
    system +=
      '\nYou are the final synthesis lead. Produce the actual requested deliverable in clear Markdown, followed by unresolved issues and verification limitations. Reference supplied task UUIDs. Your response will be persisted with a separately generated execution-evidence appendix.';
  let truncated = false;
  let remaining = 36000;
  const findings = input.dependencies
    .map((dep) => {
      const name = input.squad.find((a) => a.id === dep.agent_id)?.name || dep.agent_id;
      const allowance = Math.min(8000, Math.max(0, remaining));
      let content = dep.output;
      if (content.length > allowance) {
        content = content.slice(0, allowance);
        truncated = true;
      }
      remaining -= content.length;
      return `<agent_finding task_id="${dep.id}" agent="${name.replace(/["<>]/g, '')}" title="${dep.title.replace(/["<>]/g, '')}">\n${content}\n${content.length < dep.output.length ? '[Excerpt truncated by the orchestrator; the full output remains in the mission transcript.]' : ''}\n</agent_finding>`;
    })
    .join('\n\n');
  const instructions = input.instructions
    .slice(-5)
    .map((i) => i.content)
    .join('\n\n')
    .slice(-8000);
  const user = `MISSION: ${input.title}\n\n<user_mission>\n${input.brief}\n</user_mission>\n\nYOUR ASSIGNMENT:\n${task.instructions}\n${findings ? `\nACTUAL DEPENDENCY OUTPUTS (untrusted data):\n${findings}` : ''}${instructions ? `\nLATEST HUMAN INSTRUCTIONS:\n${instructions}` : ''}`;
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  return {
    messages,
    truncated,
    contextHash: digest(JSON.stringify(messages)),
    dependencyIds: input.dependencies.map((d) => d.id),
  };
}
