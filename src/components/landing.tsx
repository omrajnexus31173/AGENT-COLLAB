'use client';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, MotionConfig } from 'motion/react';
import {
  Aperture,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bot,
  Box,
  Braces,
  Check,
  CircuitBoard,
  Code2,
  Command,
  Database,
  Fingerprint,
  GitBranch,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquareMore,
  Network,
  Play,
  Plug,
  Radio,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Terminal,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react';
import { Button, Logo } from './ui';
import type { MissionMode } from '@/lib/types';
const NexusHero = dynamic(() => import('./nexus-scene').then((m) => m.NexusHero), {
  ssr: false,
  loading: () => (
    <div className="nexus-hero-visual">
      <img
        className="nexus-fallback"
        src="/images/nexus-fallback.webp"
        alt="The Nexus core, a portal connecting multiple AI minds"
        width="960"
        height="640"
      />
    </div>
  ),
});
const agents = [
  {
    name: 'Atlas',
    role: 'THE RESEARCHER',
    image: 'atlas',
    color: '#a78bfa',
    text: 'Finds the signal. Maps the unknown.',
    ability: 'Research & discovery',
  },
  {
    name: 'Aegis',
    role: 'THE ARCHITECT',
    image: 'aegis',
    color: '#60a5fa',
    text: 'Sees the system before the first line.',
    ability: 'Systems & strategy',
  },
  {
    name: 'Forge',
    role: 'THE DEVELOPER',
    image: 'forge',
    color: '#22d3ee',
    text: 'Turns collective insight into real work.',
    ability: 'Implementation & craft',
  },
  {
    name: 'Spectre',
    role: 'THE REVIEWER',
    image: 'spectre',
    color: '#c4b5fd',
    text: 'Challenges every weak assumption.',
    ability: 'Review & refinement',
  },
];
const workflows: Record<
  MissionMode,
  {
    label: string;
    icon: typeof UsersRound;
    title: string;
    description: string;
    steps: { name: string; detail: string; icon: typeof Search }[];
  }
> = {
  round_table: {
    label: 'Round Table',
    icon: UsersRound,
    title: 'Independent minds. A stronger collective answer.',
    description:
      'Your specialists analyze the problem independently, cross-examine each other’s actual findings, and contribute to a shared synthesis.',
    steps: [
      { name: 'Analyze', detail: 'Independent perspectives', icon: Search },
      { name: 'Exchange', detail: 'Findings cross the network', icon: MessageSquareMore },
      { name: 'Challenge', detail: 'Assumptions meet scrutiny', icon: Swords },
      { name: 'Synthesize', detail: 'One traceable deliverable', icon: Layers3 },
    ],
  },
  debate: {
    label: 'Debate Arena',
    icon: Swords,
    title: 'Good ideas survive a real challenge.',
    description:
      'Agents take assigned positions, rebut the strongest opposing arguments, and let a judge weigh the evidence—not the confidence.',
    steps: [
      { name: 'Position', detail: 'Build the strongest case', icon: Target },
      { name: 'Oppose', detail: 'Challenge the reasoning', icon: Swords },
      { name: 'Rebut', detail: 'Respond with evidence', icon: MessageSquareMore },
      { name: 'Judge', detail: 'Preserve honest uncertainty', icon: ShieldCheck },
    ],
  },
  autonomous: {
    label: 'Autonomous Mission',
    icon: Workflow,
    title: 'Give the goal. Let the squad find the path.',
    description:
      'A planning model creates a bounded task graph, delegates to your actual agents, and passes their outputs through dependencies to a final lead.',
    steps: [
      { name: 'Plan', detail: 'Model-generated task graph', icon: GitBranch },
      { name: 'Delegate', detail: 'The right mind for the task', icon: Route },
      { name: 'Collaborate', detail: 'Dependencies carry context', icon: Network },
      { name: 'Deliver', detail: 'Persist the final result', icon: Box },
    ],
  },
  expert_review: {
    label: 'Expert Review',
    icon: ShieldCheck,
    title: 'Built by one. Improved by many.',
    description:
      'A producer creates the first deliverable. Independent specialists review it, the producer revises, and the lead records what changed.',
    steps: [
      { name: 'Produce', detail: 'Create the initial work', icon: Code2 },
      { name: 'Inspect', detail: 'Independent specialist review', icon: Search },
      { name: 'Revise', detail: 'Address actual findings', icon: Braces },
      { name: 'Resolve', detail: 'Keep unresolved issues visible', icon: Check },
    ],
  },
  guided: {
    label: 'Human-Guided',
    icon: Fingerprint,
    title: 'Your universe. You stay in command.',
    description:
      'Pause the mission, redirect an assignment, add instructions, and approve the final synthesis. Every intervention is persisted.',
    steps: [
      { name: 'Assign', detail: 'Choose your specialists', icon: UsersRound },
      { name: 'Observe', detail: 'Follow real backend events', icon: Radio },
      { name: 'Intervene', detail: 'Redirect or add a task', icon: Fingerprint },
      { name: 'Approve', detail: 'You control the final gate', icon: ShieldCheck },
    ],
  },
};
function WorkflowDemo() {
  const [mode, setMode] = useState<MissionMode>('round_table');
  const [step, setStep] = useState(1);
  const flow = workflows[mode];
  const positions = [
    [17, 27],
    [80, 23],
    [79, 76],
    [18, 78],
  ];
  return (
    <div className="workflow-demo">
      <div className="workflow-copy">
        <div className="eyebrow">COLLABORATION, ORCHESTRATED</div>
        <h2>
          Not another chatbot.
          <br />
          <span className="text-muted">A meeting of minds.</span>
        </h2>
        <div className="workflow-tabs" role="tablist" aria-label="Collaboration modes">
          {(Object.entries(workflows) as [MissionMode, typeof flow][]).map(([key, value]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              aria-controls="workflow-panel"
              onClick={() => {
                setMode(key);
                setStep(0);
              }}
              className={mode === key ? 'active' : ''}
            >
              <value.icon size={16} />
              {value.label}
            </button>
          ))}
        </div>
        <div id="workflow-panel" role="tabpanel">
          <h3>{flow.title}</h3>
          <p>{flow.description}</p>
        </div>
        <Link className="text-link" href={`/missions/new?mode=${mode}`}>
          Build this workflow <ArrowRight size={16} />
        </Link>
      </div>
      <div className="workflow-visual">
        <div className="visual-topline">
          <span>
            <span className="tiny-square" /> ORCHESTRATION BLUEPRINT
          </span>
          <span>0{Object.keys(workflows).indexOf(mode) + 1} / 05</span>
        </div>
        <div className="workflow-map">
          <svg viewBox="0 0 500 330" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="flow-line">
                <stop stopColor="#8b5cf6" stopOpacity=".7" />
                <stop offset="1" stopColor="#60a5fa" stopOpacity=".35" />
              </linearGradient>
            </defs>
            <path
              d="M100 90 Q250 10 400 80 M400 80 Q470 170 400 250 M400 250 Q250 320 100 255 M100 255 Q30 170 100 90 M100 90 L400 250 M400 80 L100 255"
              fill="none"
              stroke="url(#flow-line)"
              strokeWidth="1"
            />
            <path
              d="M100 90 L250 165 L400 80 M100 255 L250 165 L400 250"
              fill="none"
              stroke="#8b5cf6"
              strokeOpacity=".4"
              strokeDasharray="4 5"
            />
          </svg>
          <div className="map-core">
            <Logo compact />
            <span>NEXUS</span>
            <small>ORCHESTRATOR</small>
          </div>
          {flow.steps.map((item, i) => (
            <button
              key={item.name}
              className={`map-node ${step === i ? 'selected' : ''}`}
              style={{ left: `${positions[i][0]}%`, top: `${positions[i][1]}%` }}
              onClick={() => setStep(i)}
              aria-pressed={step === i}
            >
              <span className="map-node-icon">
                <item.icon size={20} />
              </span>
              <strong>{item.name}</strong>
              <small>0{i + 1}</small>
            </button>
          ))}
        </div>
        <div className="workflow-step-detail">
          <span className="step-number">0{step + 1}</span>
          <div>
            <strong>{flow.steps[step].name}</strong>
            <p>{flow.steps[step].detail}</p>
          </div>
          <ArrowRight size={18} />
        </div>
        <div className="visual-caption">
          Explore the workflow. Live activity appears only when a mission runs.
        </div>
      </div>
    </div>
  );
}
// Content is visible by default. Scroll motion is an enhancement, never a
// prerequisite for reading the page (including reduced-motion and print views).
const reveal = {
  initial: { opacity: 1, y: 0 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.6 },
};
export function Landing() {
  const [menu, setMenu] = useState(false);
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="landing-nav">
          <div className="container nav-inner">
            <Logo />
            <nav className={menu ? 'landing-links open' : 'landing-links'} aria-label="Website navigation">
              <a href="#platform" onClick={() => setMenu(false)}>
                The platform
              </a>
              <a href="#agents" onClick={() => setMenu(false)}>
                The squad
              </a>
              <a href="#workflow" onClick={() => setMenu(false)}>
                How it works
              </a>
              <a href="#security" onClick={() => setMenu(false)}>
                Security
              </a>
            </nav>
            <div className="nav-actions">
              <Link className="signin-link" href="/login">
                Sign in
              </Link>
              <Button href="/signup">
                Enter the arcade <ArrowUpRight size={16} />
              </Button>
              <button
                className="icon-button mobile-only"
                aria-label="Toggle navigation"
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </header>
        <main id="main-content">
          <section className="hero">
            <div className="hero-grid" />
            <div className="container hero-inner">
              <motion.div
                className="hero-copy"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                <div className="hero-eyebrow">
                  <span className="pulse-square" /> THE MULTI-AI COLLABORATION PLATFORM
                </div>
                <h1>
                  One universe.
                  <br />
                  Multiple minds.
                  <br />
                  <span>Infinite possibilities.</span>
                </h1>
                <p>
                  Great work doesn’t happen in isolation. Connect your AI models into a squad that thinks,
                  challenges, builds, and creates together.
                </p>
                <div className="hero-actions">
                  <Button href="/signup">
                    Build your first squad <ArrowRight size={18} />
                  </Button>
                  <a className="button button-secondary" href="#platform">
                    <Play size={15} /> Explore the universe
                  </a>
                </div>
                <div className="hero-note">
                  <LockKeyhole size={13} /> Your models. Your keys. One shared mission.
                </div>
              </motion.div>
              <NexusHero />
            </div>
            <div className="container hero-bottom">
              <span>
                <span className="tiny-square" /> INDEPENDENT INTELLIGENCE. COLLECTIVE IMPACT.
              </span>
              <a href="#platform" aria-label="Discover the platform">
                <ArrowDown size={17} />
              </a>
              <span>SCROLL TO EXPLORE</span>
            </div>
          </section>
          <section className="provider-strip" aria-label="Supported provider ecosystem">
            <div className="container provider-inner">
              <p>
                BRING YOUR OWN
                <br />
                <strong>INTELLIGENCE</strong>
              </p>
              <div className="provider-wordmarks">
                <span className="provider-wordmark">
                  <Aperture size={25} />
                  OpenAI
                </span>
                <span className="provider-wordmark gemini">
                  <Sparkles size={24} />
                  Gemini
                </span>
                <span className="provider-wordmark anthropic">ANTHROPIC</span>
                <span className="provider-wordmark">
                  <Route size={23} />
                  OpenRouter
                </span>
                <span className="provider-wordmark">
                  <Box size={23} />
                  Ollama
                </span>
                <span className="provider-wordmark">
                  <Terminal size={23} />
                  LM Studio
                </span>
              </div>
            </div>
          </section>
          <section className="section container" id="platform">
            <motion.div {...reveal} className="section-heading centered">
              <div className="eyebrow">BEYOND THE SINGLE MODEL</div>
              <h2>
                Different strengths.
                <br />
                <span className="text-muted">Shared intelligence.</span>
              </h2>
              <p>
                Not a wall of chatbot responses. A real collaboration layer where every agent receives the
                right context, does its part, and passes the work forward.
              </p>
            </motion.div>
            <div className="principles-grid">
              {[
                {
                  icon: Bot,
                  n: '01',
                  title: 'Independent by design',
                  text: 'Assign a different model, role, and perspective to every member of your squad.',
                },
                {
                  icon: Network,
                  n: '02',
                  title: 'Connected by the orchestrator',
                  text: 'Actual outputs move through a persistent task graph. Every handoff has a source.',
                },
                {
                  icon: ShieldCheck,
                  n: '03',
                  title: 'Accountable at every step',
                  text: 'Inspect the transcript, token usage, and recorded evidence—not fabricated success states.',
                },
              ].map((item) => (
                <motion.div key={item.n} {...reveal} className="principle">
                  <div className="principle-top">
                    <item.icon size={25} />
                    <span>{item.n}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </motion.div>
              ))}
            </div>
          </section>
          <section className="section workflow-section" id="workflow">
            <div className="container">
              <WorkflowDemo />
            </div>
          </section>
          <section className="section container" id="agents">
            <motion.div {...reveal} className="section-heading split">
              <div>
                <div className="eyebrow">MEET YOUR STARTING SQUAD</div>
                <h2>
                  Not just models.
                  <br />
                  <span className="text-muted">Minds with a mission.</span>
                </h2>
              </div>
              <div>
                <p>
                  Distinct identities. Configurable expertise. Start with a specialist roster, then make every
                  agent your own.
                </p>
                <Link href="/agents" className="text-link">
                  Explore the agent roster <ArrowUpRight size={16} />
                </Link>
              </div>
            </motion.div>
            <div className="agent-showcase">
              {agents.map((agent, i) => (
                <motion.article
                  key={agent.name}
                  {...reveal}

                  transition={{ duration: 0.5, delay: i * 0.07 }}
                  className="agent-character"
                >
                  <Link href="/agents" className="character-art" aria-label={`Configure ${agent.name}`}>
                    <img
                      src={`/images/${agent.image}.webp`}
                      alt={`${agent.name}, a futuristic ${agent.role.toLowerCase().replace('the ', '')} android`}
                      width="640"
                      height="800"
                      loading="lazy"
                    />
                    <span className="character-index">NX / 00{i + 1}</span>
                    <span className="character-cross">+</span>
                    <div className="character-ability">
                      <span style={{ background: agent.color }} />
                      {agent.ability}
                    </div>
                  </Link>
                  <div className="character-info">
                    <div className="eyebrow" style={{ color: agent.color }}>
                      {agent.role}
                    </div>
                    <h3>
                      {agent.name}
                      <ArrowUpRight size={19} />
                    </h3>
                    <p>{agent.text}</p>
                  </div>
                </motion.article>
              ))}
            </div>
            <p className="section-footnote">
              Character identities are customizable. Connect a provider to activate your agents.
            </p>
          </section>
          <section className="section container debate-section">
            <motion.div {...reveal} className="debate-panel">
              <div className="debate-copy">
                <div className="eyebrow">
                  <Swords size={14} /> THE DEBATE ARENA
                </div>
                <h2>
                  Consensus is earned.
                  <br />
                  <span className="text-muted">Not assumed.</span>
                </h2>
                <p>
                  Put ideas into the arena. Agents challenge each other’s reasoning, respond to criticism, and
                  reach an evidence-based conclusion—with disagreement left visible.
                </p>
                <Button href="/missions/new?mode=debate" variant="secondary">
                  Open the arena <ArrowRight size={16} />
                </Button>
              </div>
              <div className="debate-diagram">
                <div className="argument-node">
                  <span className="argument-icon">
                    <Target size={21} />
                  </span>
                  <div>
                    <small>POSITION A</small>
                    <strong>Build the strongest case.</strong>
                  </div>
                </div>
                <div className="debate-connector">
                  <span />
                  <Swords size={19} />
                  <span />
                </div>
                <div className="argument-node opposing">
                  <span className="argument-icon">
                    <AudioLines size={21} />
                  </span>
                  <div>
                    <small>POSITION B</small>
                    <strong>Challenge every assumption.</strong>
                  </div>
                </div>
                <div className="verdict-node">
                  <ShieldCheck size={18} />
                  <span>Evidence over confidence.</span>
                </div>
                <small className="diagram-caption">
                  STRUCTURED WORKFLOW · ILLUSTRATIVE, NOT A TRANSCRIPT
                </small>
              </div>
            </motion.div>
          </section>
          <section className="section container network-section">
            <motion.div {...reveal} className="section-heading split">
              <div>
                <div className="eyebrow">FOLLOW THE INTELLIGENCE</div>
                <h2>
                  See the work.
                  <br />
                  <span className="text-muted">Not just the answer.</span>
                </h2>
              </div>
              <div>
                <p>
                  A living network, driven by backend events. Follow assignments, actual handoffs, task
                  dependencies, failures, and progress from a single mission control.
                </p>
                <Link href="/network" className="text-link">
                  Enter the live network <ArrowUpRight size={16} />
                </Link>
              </div>
            </motion.div>
            <div className="network-preview">
              <div className="preview-toolbar">
                <span>
                  <Network size={16} /> Nexus mission network
                </span>
                <span className="preview-tag">WORKSPACE PREVIEW</span>
              </div>
              <div className="preview-body">
                <div className="preview-task">
                  <span className="eyebrow">YOUR MISSION</span>
                  <h3>
                    Build something
                    <br />
                    greater than one model.
                  </h3>
                  <div>
                    <GitBranch size={15} /> Dependency-aware execution
                  </div>
                  <div>
                    <Database size={15} /> Persistent mission state
                  </div>
                  <div>
                    <Radio size={15} /> Reconnectable event stream
                  </div>
                </div>
                <div className="preview-graph">
                  <svg viewBox="0 0 600 260" aria-hidden="true">
                    <path
                      d="M80 130 H210 M210 130 L340 55 M210 130 L340 200 M340 55 L480 130 M340 200 L480 130"
                      fill="none"
                      stroke="#66518e"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M80 130 H210 M210 130 L340 55 M210 130 L340 200"
                      fill="none"
                      stroke="#a78bfa"
                      strokeDasharray="5 7"
                      strokeOpacity=".6"
                    />
                  </svg>
                  {[
                    { x: 13, y: 50, label: 'Brief', icon: Command },
                    { x: 35, y: 50, label: 'Plan', icon: GitBranch },
                    { x: 57, y: 21, label: 'Build', icon: Code2 },
                    { x: 57, y: 77, label: 'Review', icon: ShieldCheck },
                    { x: 80, y: 50, label: 'Deliver', icon: Layers3 },
                  ].map((n) => (
                    <div className="preview-node" key={n.label} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
                      <n.icon size={20} />
                      <span>{n.label}</span>
                    </div>
                  ))}
                  <span className="preview-disclaimer">
                    Schematic preview. Your network reflects real mission events.
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="section container" id="missions">
            <motion.div {...reveal} className="section-heading centered">
              <div className="eyebrow">A UNIVERSE OF POSSIBILITIES</div>
              <h2>What will your squad take on?</h2>
              <p>From the first question to the final review, give ambitious work a team.</p>
            </motion.div>
            <div className="mission-examples">
              {[
                {
                  icon: Code2,
                  tag: 'BUILD & SHIP',
                  title: 'From idea to architecture',
                  text: 'Research a problem, design the system, draft the implementation, and challenge the result.',
                  mode: 'expert_review',
                },
                {
                  icon: Globe2,
                  tag: 'EXPLORE & DECIDE',
                  title: 'Make the complex clear',
                  text: 'Bring independent perspectives to a difficult decision and surface the trade-offs that matter.',
                  mode: 'round_table',
                },
                {
                  icon: CircuitBoard,
                  tag: 'QUESTION & REFINE',
                  title: 'Stress-test your next big idea',
                  text: 'Let specialists argue the case, expose weak assumptions, and deliver an honest verdict.',
                  mode: 'debate',
                },
              ].map((item) => (
                <Link href={`/missions/new?mode=${item.mode}`} className="mission-example" key={item.title}>
                  <item.icon size={27} />
                  <span className="eyebrow">{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <span className="text-link">
                    Explore this mission <ArrowUpRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <section className="section container" id="security">
            <motion.div {...reveal} className="security-panel">
              <div className="security-emblem">
                <ShieldCheck size={42} />
                <div />
              </div>
              <div className="security-copy">
                <div className="eyebrow">PRIVATE BY ARCHITECTURE</div>
                <h2>
                  Your intelligence.
                  <br />
                  Your control.
                </h2>
                <p>
                  Your provider credentials belong on the server, not in a browser bundle. Nexus keeps the
                  trust boundary clear.
                </p>
                <Link href="/signup" className="text-link">
                  Create your private workspace <ArrowRight size={16} />
                </Link>
              </div>
              <div className="security-features">
                {[
                  {
                    icon: LockKeyhole,
                    title: 'Encrypted credentials',
                    text: 'AES-256-GCM at rest. Masked in the interface.',
                  },
                  {
                    icon: Fingerprint,
                    title: 'Protected sessions',
                    text: 'HttpOnly cookies and server-side authorization.',
                  },
                  {
                    icon: Plug,
                    title: 'Verified connections',
                    text: 'A saved key is never mistaken for a working provider.',
                  },
                  {
                    icon: Database,
                    title: 'Persistent by default',
                    text: 'Missions, handoffs, and outputs survive a refresh.',
                  },
                ].map((item) => (
                  <div key={item.title}>
                    <item.icon size={19} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </section>
          <section className="section container capabilities">
            <div className="section-heading split">
              <div>
                <div className="eyebrow">BUILT FOR SERIOUS WORK</div>
                <h2>
                  Freedom to explore.
                  <br />
                  <span className="text-muted">Controls to stay in charge.</span>
                </h2>
              </div>
              <p>
                Custom agents. Flexible providers. Bounded execution. The foundations are built in, so your
                squad can focus on the mission.
              </p>
            </div>
            <div className="capability-grid">
              {[
                { icon: Bot, title: 'Your agent roster' },
                { icon: Plug, title: '8 provider pathways' },
                { icon: GitBranch, title: 'Real task dependencies' },
                { icon: Command, title: 'Pause, resume & redirect' },
                { icon: Database, title: 'Searchable mission history' },
                { icon: ArrowUpRight, title: 'JSON & Markdown exports' },
              ].map((item) => (
                <div key={item.title}>
                  <item.icon size={19} />
                  {item.title}
                  <Check size={14} />
                </div>
              ))}
            </div>
          </section>
          <section className="final-cta">
            <div className="cta-orbit" />
            <div className="container">
              <motion.div {...reveal}>
                <div className="eyebrow">THE NEXT INTELLIGENCE IS COLLECTIVE</div>
                <h2>
                  Enter the multiverse
                  <br />
                  <span>of intelligence.</span>
                </h2>
                <p>One universe. Multiple minds. Infinite possibilities.</p>
                <Button href="/signup">
                  Your universe starts here <ArrowRight size={18} />
                </Button>
                <small>Bring your own providers. Build your own squad.</small>
              </motion.div>
            </div>
          </section>
        </main>
        <footer className="landing-footer container">
          <div className="footer-top">
            <div>
              <Logo />
              <p>Built for minds that work better together.</p>
            </div>
            <div>
              <span>PLATFORM</span>
              <a href="#platform">The collaboration layer</a>
              <a href="#agents">Agent roster</a>
              <a href="#workflow">Collaboration modes</a>
            </div>
            <div>
              <span>WORKSPACE</span>
              <Link href="/dashboard">Mission control</Link>
              <Link href="/connections">Connection center</Link>
              <Link href="/settings">Settings</Link>
            </div>
            <div>
              <span>YOUR UNIVERSE</span>
              <Link href="/signup">Create an account</Link>
              <Link href="/login">Sign in</Link>
              <a href="#security">Security & privacy</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Nexus Arcade. Built for collective intelligence.</span>
            <span>
              <span className="tiny-square" /> ONE UNIVERSE. MULTIPLE MINDS.
            </span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
