import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from './icons';
import { useDesk } from './useDesk';
import type { ScenarioId, SessionMode, ToolEvent, Workspace } from './types';

const scenarioPresentation = {
  permissions: { icon: 'shield', label: 'Access & permissions', code: '401', accent: 'cyan', hint: 'Find the missing permission' },
  quota: { icon: 'chart', label: 'Quota & cost planning', code: '429', accent: 'cyan', hint: 'Plan the next month of usage' },
  outage: { icon: 'pulse', label: 'Service unavailable', code: '503', accent: 'amber', hint: 'Handle a failed account lookup' },
  escalation: { icon: 'case', label: 'Support escalation', code: 'REVIEW', accent: 'amber', hint: 'Prepare a case for human approval' },
} as const;

const modes: { id: SessionMode; label: string; detail: string; icon: 'terminal' | 'mic' | 'arrow' }[] = [
  { id: 'preview', label: 'Guided preview', detail: 'Deterministic · no provider spend', icon: 'arrow' },
  { id: 'text', label: 'Live text', detail: 'ElevenAgents · private connection', icon: 'terminal' },
  { id: 'voice', label: 'Live voice', detail: 'Microphone · up to 90 seconds', icon: 'mic' },
];

const toolLabels: Record<string, string> = {
  lookup_workspace: 'Look up workspace',
  diagnose_error: 'Diagnose API error',
  estimate_monthly_cost: 'Forecast monthly cost',
  prepare_support_case: 'Prepare support case',
  confirm_support_case: 'Confirm support case',
  confirm_case: 'Confirm support case',
};

const number = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const currency = (value: number) => `$${value.toFixed(4)}`;
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const json = (value: unknown) => JSON.stringify(value, null, 2);

function WorkspaceCard({ workspace, id, lookupUnavailable }: { workspace?: Workspace; id?: string; lookupUnavailable: boolean }) {
  const usage = workspace ? Math.round(workspace.used_requests / Math.max(1, workspace.monthly_limit) * 100) : 0;
  return <section className="panel workspace-panel" aria-labelledby="workspace-heading">
    <div className="panel-heading"><h2 id="workspace-heading">Workspace</h2><span className="mini-label">SANDBOX</span></div>
    <div className="workspace-monogram">N<span>✦</span></div>
    <h3>{workspace?.name ?? 'Northstar workspace'}</h3>
    <p className="mono muted workspace-id">{workspace?.id ?? id ?? 'Select a scenario'}</p>
    <div className="workspace-badges"><span className="pill subtle">{workspace?.plan ?? 'Demo account'}</span><span className="pill subtle">Fictional data</span></div>
    <div className="divider" />
    <div className="usage-heading"><span>Monthly requests</span><strong>{lookupUnavailable ? 'Unverified' : workspace ? `${usage}%` : '—'}</strong></div>
    {lookupUnavailable ? <p className="lookup-unavailable">Lookup unavailable.<br />Current usage and limits could not be verified.</p> : <><progress value={workspace ? Math.min(100, usage) : 0} max="100" aria-label="Monthly requests used" /><p className="usage-value"><strong>{workspace ? number(workspace.used_requests) : '—'}</strong><span> / {workspace ? number(workspace.monthly_limit) : '—'}</span></p></>}
    <dl className="workspace-facts"><div><dt>Rate limit</dt><dd>{lookupUnavailable ? 'Unverified' : workspace ? `${number(workspace.rate_limit_per_minute)} / min` : '—'}</dd></div><div><dt>Account boundary</dt><dd><span className="tiny-dot" />Session bound</dd></div></dl>
    <p className="footnote">{lookupUnavailable ? 'Workspace identity comes from demo context. Live account facts are unavailable.' : workspace ? 'Tools can access only this session’s workspace.' : 'Account facts load when you start a session.'}</p>
  </section>;
}

function TraceEvent({ event, index }: { event: ToolEvent; index: number }) {
  const [expanded, setExpanded] = useState(event.status === 'error');
  return <details className={`trace-event trace-${event.status}`} open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
    <summary>
      <span className={`event-marker ${event.status}`}><Icon name={event.status === 'success' ? 'check' : event.status === 'error' ? 'close' : 'clock'} size={13} /></span>
      <span className="event-name"><span className="trace-order mono">{String(index + 1).padStart(2, '0')}</span><strong>{toolLabels[event.tool_name] ?? event.tool_name ?? event.type}</strong><span className="event-state">{event.status === 'awaiting_confirmation' ? 'Awaiting approval' : event.status === 'error' ? 'Recoverable error' : 'Completed'} · {event.duration_ms.toFixed(1)} ms</span></span>
      <Icon name="chevron" size={15} className="details-chevron" />
    </summary>
    <div className="trace-detail"><div className="code-label">Arguments</div><pre>{json(event.parameters)}</pre><div className="code-label">Result</div><pre>{json(event.result)}</pre>
      {event.source_ids.length > 0 && <><div className="code-label">Knowledge sources</div><div className="source-chips">{event.source_ids.map((source) => <span key={source} className="source-chip mono">{source}</span>)}</div></>}
    </div>
  </details>;
}

function App() {
  const desk = useDesk();
  const [selectedId, setSelectedId] = useState<ScenarioId>('permissions');
  const [mode, setMode] = useState<SessionMode>('preview');
  const [draft, setDraft] = useState('');
  const [traceFilter, setTraceFilter] = useState<'all' | 'errors'>('all');
  const scrollEnd = useRef<HTMLDivElement>(null);
  const scenario = desk.scenarios.find((item) => item.id === selectedId) ?? desk.scenarios[0];
  const session = desk.session;
  const activeLive = desk.connection === 'connected' || desk.connection === 'connecting';
  const locked = activeLive || Boolean(desk.busy);
  const isEnded = session?.status === 'ended';
  const activeMode = session?.mode ?? mode;
  const limit = Math.min(90, desk.config?.max_session_seconds ?? 90);
  const pending = session?.pending_actions.filter((action) => action.status === 'pending' || action.status === 'awaiting_confirmation') ?? [];
  const filteredEvents = session?.events.filter((event) => traceFilter === 'all' || event.status === 'error') ?? [];
  const voiceCost = activeMode === 'voice' && activeLive
    ? desk.elapsed / 60 * (desk.config?.voice_rate_per_minute ?? 0)
    : session?.metrics.estimated_voice_usd ?? 0;
  const sources = [...new Set(session?.events.flatMap((event) => event.source_ids) ?? [])];
  const latestLookup = session?.events.filter((event) => event.tool_name === 'lookup_workspace').at(-1);
  const lookupUnavailable = latestLookup?.status === 'error' && typeof latestLookup.result === 'object'
    && latestLookup.result !== null && 'error' in latestLookup.result
    && latestLookup.result.error === 'workspace_service_unavailable';
  const providerUsd = desk.report?.available && typeof desk.report.metadata?.cost_fiat === 'number'
    && Number.isFinite(desk.report.metadata.cost_fiat) ? desk.report.metadata.cost_fiat : null;
  const providerLabel = activeMode === 'preview' ? 'Not applicable' : providerUsd !== null ? currency(providerUsd)
    : desk.report ? 'Unavailable' : 'Pending report';

  useEffect(() => { scrollEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [session?.messages.length]);
  useEffect(() => {
    if (session && session.mode !== 'preview' && !session.messages.some((message) => message.role === 'user')) {
      setDraft(scenario?.first_user_message ?? '');
    }
  }, [session?.id]); // A new live session gets an editable, visible starting prompt.

  async function selectScenario(id: ScenarioId) {
    if (locked || selectedId === id) return;
    await desk.reset();
    setSelectedId(id);
    setDraft('');
    setTraceFilter('all');
  }

  async function selectMode(next: SessionMode) {
    if (locked || next === mode) return;
    await desk.reset();
    setMode(next);
    setDraft('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await desk.send(draft.trim())) setDraft('');
  }

  const statusLabel = desk.connection === 'connecting' ? 'Connecting'
    : desk.connection === 'connected' ? (activeMode === 'voice' ? desk.agentMode === 'speaking' ? 'Agent speaking' : 'Listening' : 'Connected')
    : isEnded || desk.connection === 'ended' ? 'Session ended'
    : desk.connection === 'error' ? 'Connection failed'
    : session ? 'Preview ready' : 'Ready when you are';

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" aria-label="VoiceOps Desk home"><span className="brand-symbol"><Icon name="star" size={21} /></span><span>northstar<span className="brand-secondary">cloud</span></span></a><span className="header-divider" /><span className="product-label">SUPPORT OPERATIONS</span><div className="topbar-right"><span className={`connection-pill ${desk.liveReady ? 'available' : ''}`}><span className="status-dot" />{desk.loading ? 'Checking service' : desk.liveReady ? 'Live agent available' : 'Preview available'}</span><span className="avatar" aria-label="Demo operator">JD</span></div></header>

    <main>
      <div className="hero"><div><div className="eyebrow"><span className="tiny-dot" />THE SUPPORT WORKSPACE</div><h1>VoiceOps <span>Desk.</span></h1><p>Talk through the issue. Inspect the evidence. Stay in control.</p></div><div className="hero-note"><span className="hero-note-label">NORTHSTAR CLOUD</span><strong>Fictional account.<br />Real integration.</strong><span>Four focused support scenarios</span></div></div>

      {desk.loadErrors.length > 0 && <div className="error-banner" role="alert"><div><strong>Service data could not load</strong>{desk.loadErrors.map((message) => <p key={message}>{message}</p>)}</div><button className="button outline" onClick={() => void desk.load()} disabled={desk.loading}><Icon name="refresh" size={15} />Retry loading</button></div>}

      <section className="scenario-section" aria-labelledby="scenario-heading"><div className="section-heading"><h2 id="scenario-heading">01 <span>Choose a scenario</span></h2><span className="muted small">Synthetic customer issues</span></div><div className="scenario-grid">
        {desk.loading && !desk.scenarios.length ? [1, 2, 3, 4].map((id) => <div className="scenario-skeleton" key={id} />) : desk.scenarios.map((item, index) => {
          const presentation = scenarioPresentation[item.id];
          return <button key={item.id} className={`scenario-card ${scenario?.id === item.id ? 'selected' : ''} accent-${presentation.accent}`} onClick={() => void selectScenario(item.id)} disabled={locked} aria-pressed={scenario?.id === item.id}><div className="scenario-top"><span className="scenario-icon"><Icon name={presentation.icon} size={19} /></span><span className="scenario-code mono">{presentation.code}</span>{scenario?.id === item.id && <span className="selected-check"><Icon name="check" size={11} /></span>}</div><h3>{presentation.label}</h3><p>{presentation.hint}</p><span className="scenario-index mono">SCENARIO {String(index + 1).padStart(2, '0')}</span></button>;
        })}
      </div></section>

      <section className="run-controls" aria-labelledby="mode-heading"><div className="control-mode"><div className="section-heading"><h2 id="mode-heading">02 <span>Choose how to connect</span></h2></div><div className="mode-selector" aria-label="Session mode">{modes.map((item) => <button key={item.id} className={`mode-button ${mode === item.id ? 'selected' : ''}`} onClick={() => void selectMode(item.id)} disabled={locked} aria-pressed={mode === item.id}><Icon name={item.icon} size={16} /><span>{item.label}</span></button>)}</div><p className={`mode-description ${mode === 'preview' ? 'preview-description' : ''}`}>{mode === 'preview' ? 'A scripted walkthrough using the same backend tools. No live AI or provider spend.' : mode === 'voice' ? `Starting voice requests microphone access and streams audio to ElevenLabs. Ends within ${limit} seconds.` : 'A real private ElevenAgents conversation over WebSocket. Provider usage may incur cost.'}</p></div><div className="start-control">{activeLive ? <button className="button stop-button" onClick={() => void desk.stop()} disabled={Boolean(desk.busy) && desk.busy !== 'Connecting'}><Icon name="stop" size={16} />Stop session</button> : <button className={`button primary ${mode === 'voice' ? 'voice-start' : ''}`} onClick={() => scenario && void desk.start(scenario, mode)} disabled={!scenario || Boolean(desk.busy) || desk.loading || (mode !== 'preview' && !desk.liveReady)}>{desk.busy ? <><span className="spinner" />{desk.busy}</> : <>{mode === 'voice' ? <Icon name="mic" size={16} /> : null}{session && !isEnded ? 'Start a new' : 'Start'} {mode === 'preview' ? 'preview' : mode === 'text' ? 'live text' : 'voice session'}<Icon name="arrow" size={16} /></>}</button>}{mode !== 'preview' && !desk.liveReady && <p className="start-hint">{desk.config?.cloud_status === 'missing_permissions' ? 'Provider key needs agent permissions.' : 'Configure a private agent to enable live sessions.'}</p>}{mode === 'preview' && <span className="start-hint"><span className="tiny-dot" />No credentials required</span>}</div></section>

      {desk.error && <div className="error-banner session-error" role="alert"><div><strong>Action needs attention</strong><p>{desk.error}</p></div><button className="icon-button" onClick={() => desk.setError(null)} aria-label="Dismiss error"><Icon name="close" /></button></div>}

      <div className="desk-grid">
        <aside className="context-column"><WorkspaceCard workspace={session?.workspace} id={scenario?.workspace_id} lookupUnavailable={lookupUnavailable} /><section className="panel guardrail-panel"><span className="guardrail-icon"><Icon name="shield" size={20} /></span><h3>A visible boundary</h3><p>Account reads stay scoped.<br />Support cases need your approval.</p><div className="guardrail-line"><span className="tiny-dot" />No outbound customer actions</div></section></aside>

        <section className="panel conversation-panel" aria-labelledby="conversation-heading"><div className="panel-heading conversation-heading"><div className="conversation-title"><span className="agent-avatar"><Icon name="star" size={19} /></span><div><h2 id="conversation-heading">Support conversation</h2><span className={`conversation-status ${desk.connection === 'connected' ? 'connected' : ''}`}><span className="status-dot" />{statusLabel}</span></div></div><span className={`pill mode-badge ${activeMode === 'preview' ? 'preview' : 'live'}`}>{activeMode === 'preview' ? 'GUIDED PREVIEW' : activeMode === 'voice' ? 'LIVE VOICE' : 'LIVE TEXT'}</span></div>
          {session && <div className={`session-strip ${activeMode === 'preview' ? 'preview-strip' : ''}`}><span>{activeMode === 'preview' ? 'Scripted responses · real local tool execution' : `Private ${activeMode === 'voice' ? 'WebRTC audio' : 'WebSocket text'} · no automatic reconnect`}</span><span className="mono">{activeMode === 'preview' ? 'NOT METERED' : `${time(desk.elapsed)} / ${time(limit)}`}</span></div>}
          <div className="message-list" aria-live="polite" aria-relevant="additions text">
            {!session ? <div className="conversation-empty"><div className="empty-orbit"><span /><Icon name="star" size={35} /><span /></div><div className="eyebrow">CONTEXT FIRST. ACTION SECOND.</div><h3>Let’s get to the<br />source of the issue.</h3><p>Pick a support scenario and start a session.<br />Every tool call leaves an inspectable trail.</p><div className="issue-preview"><span className="code-label">YOUR STARTING ISSUE</span><p>{scenario?.first_user_message ?? (desk.loading ? 'Loading support scenarios…' : 'Scenarios are unavailable. Retry loading above.')}</p></div></div> : session.messages.map((message, index) => <div className={`message message-${message.role}`} key={`${index}-${message.role}`}><div className="message-meta">{message.role === 'agent' ? <><span className="message-avatar"><Icon name="star" size={12} /></span>{activeMode === 'preview' ? 'Scripted support' : 'Northstar support'}<span className="message-badge">{activeMode === 'preview' ? 'PREVIEW' : 'AGENT'}</span></> : message.role === 'user' ? <><span className="message-avatar user-avatar">JD</span>You</> : <span>Session note</span>}<span className="message-number mono">{String(index + 1).padStart(2, '0')}</span></div><div className="message-body">{message.text}</div></div>)}
            {desk.busy && session && <div className="working-indicator"><span className="spinner" />{desk.busy}…</div>}
            {activeMode === 'voice' && desk.connection === 'connected' && <div className="voice-indicator"><div className={`voice-bars ${desk.agentMode}`} aria-hidden="true">{Array.from({ length: 13 }, (_, i) => <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />)}</div><span>{desk.agentMode === 'speaking' ? 'Northstar support is speaking' : 'Your microphone is on. You can speak now.'}</span></div>}
            {isEnded && <div className="ended-note"><Icon name="check" size={14} />Session ended. The conversation and evidence are retained.</div>}
            <div ref={scrollEnd} />
          </div>
          <div className="composer-wrap"><form onSubmit={(event) => void submit(event)} className="composer"><textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder={!session ? 'Start a session to send a message' : isEnded ? 'Start a new session to continue' : activeMode === 'preview' ? 'Try another scripted support question…' : 'Describe what you’re seeing…'} disabled={!session || isEnded || Boolean(desk.busy) || (activeMode !== 'preview' && desk.connection !== 'connected')} aria-label="Support message" /><button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim() || !session || isEnded || Boolean(desk.busy) || (activeMode !== 'preview' && desk.connection !== 'connected')}><Icon name="send" size={17} /></button></form><div className="composer-help"><span>{activeMode === 'preview' ? 'Deterministic preview' : activeMode === 'voice' ? 'Audio via ElevenLabs · you can also type' : 'Live text via ElevenLabs'}</span><span>Enter to send <span className="keyboard-key">↵</span></span></div></div>
        </section>

        <aside className="evidence-column"><section className="panel trace-panel" aria-labelledby="trace-heading"><div className="panel-heading"><h2 id="trace-heading">Tool activity <span className="count-badge">{session?.events.length ?? 0}</span></h2><span className="mini-label">AUDIT TRAIL</span></div><div className="trace-tabs"><button onClick={() => setTraceFilter('all')} aria-pressed={traceFilter === 'all'} className={traceFilter === 'all' ? 'selected' : ''}>All activity</button><button onClick={() => setTraceFilter('errors')} aria-pressed={traceFilter === 'errors'} className={traceFilter === 'errors' ? 'selected' : ''}>Errors <span>{session?.metrics.tool_failures ?? 0}</span></button></div><div className="trace-list">{filteredEvents.length ? filteredEvents.map((event) => <TraceEvent key={event.id} event={event} index={session!.events.indexOf(event)} />) : <div className="trace-empty"><span className="trace-empty-icon"><Icon name="terminal" size={23} /></span><h3>{traceFilter === 'errors' ? 'No tool errors' : 'Follow the evidence'}</h3><p>{traceFilter === 'errors' ? 'Failures appear here with their result and sources.' : 'Tool calls, timing, results and knowledge sources appear here.'}</p>{traceFilter === 'all' && <div className="available-tools">{['lookup_workspace', 'diagnose_error', 'estimate_monthly_cost', 'prepare_support_case'].map((name) => <div key={name}><span className="tool-dot" />{toolLabels[name]}<span className="mono">FN</span></div>)}</div>}</div>}</div>{sources.length > 0 && <div className="trace-sources"><span className="code-label">{sources.length} KNOWLEDGE {sources.length === 1 ? 'SOURCE' : 'SOURCES'}</span><div className="source-chips">{sources.map((source) => <span className="source-chip mono" key={source}>{source}</span>)}</div></div>}</section>

          <section className={`panel approval-panel ${pending.length ? 'needs-approval' : ''}`} aria-labelledby="approval-heading"><div className="panel-heading"><h2 id="approval-heading">Human approval</h2><Icon name="case" size={17} /></div>{pending.length ? pending.map((action) => <div className="pending-action" key={action.id}><span className="pill amber">REVIEW REQUIRED</span><h3>Approve a support case</h3><p>{action.summary}</p><dl><div><dt>Priority</dt><dd>{action.priority}</dd></div><div><dt>Action</dt><dd>Create one support case</dd></div></dl><button className="button approve-button" disabled={Boolean(desk.busy) || isEnded} onClick={() => void desk.confirm(action.id)}><Icon name="check" size={16} />Approve & create case</button><p className="footnote">{isEnded ? 'This session has ended. Start a new session to prepare an action.' : 'This click approves the action. Repeated confirmation creates no duplicate case.'}</p></div>) : session?.cases.length ? session.cases.map((supportCase) => <div className="created-case" key={supportCase.id}><span className="case-success"><Icon name="check" size={14} />Case created</span><strong className="mono">{supportCase.id}</strong><p>{supportCase.summary}</p><span className="pill subtle">{supportCase.priority} priority · {supportCase.status}</span></div>) : <div className="approval-empty"><span className="approval-dot" /><p>No action waiting.<span>A case is created only after you review and approve it here.</span></p></div>}</section>
        </aside>
      </div>

      <section className="session-metrics" aria-labelledby="metrics-heading"><div className="metrics-intro"><span className="eyebrow" id="metrics-heading">SESSION ACCOUNTING</span><p>Measured tools.<br />Visible assumptions.</p></div><div className="metric"><span>Tool calls</span><strong>{String(session?.metrics.tool_calls ?? 0).padStart(2, '0')}<small>calls</small></strong><span className="metric-note">{session?.metrics.tool_failures ?? 0} recoverable failures</span></div><div className="metric"><span>{activeMode === 'preview' ? 'Preview duration' : 'Elapsed time'}</span><strong className={activeMode === 'preview' ? 'provider-state' : 'mono'}>{activeMode === 'preview' ? 'Not measured' : time(desk.elapsed)}{activeMode !== 'preview' && <small>/ {limit}s limit</small>}</strong><span className="metric-note">{activeMode === 'preview' ? 'Tool durations are measured separately' : session ? 'Session wall time' : 'Starts with your session'}</span></div><div className="metric"><span>Voice cost projection</span><strong>{currency(voiceCost)}<small>USD</small></strong><span className="metric-note">{activeMode === 'preview' ? 'No provider spend in preview' : activeMode === 'text' ? 'Voice projection does not price text usage' : desk.config ? `${currency(desk.config.voice_rate_per_minute)} / voice minute` : 'Rate unavailable'}</span></div><div className="metric provider-metric"><span>Provider billing</span><strong className="provider-state">{providerLabel}{providerUsd !== null && <small>USD</small>}</strong><span className="metric-note">{activeMode === 'preview' ? 'Deterministic execution' : desk.report?.available === false ? desk.report.reason ?? 'Provider report unavailable' : providerUsd !== null ? 'Provider-reported cost in USD' : desk.report ? 'USD amount not reported' : 'Reported separately from estimates'}</span>{session?.provider_conversation_id && <button className="text-button" onClick={() => void desk.loadReport(session.id)}>Refresh usage <Icon name="refresh" size={11} /></button>}</div></section>
      <div className="accounting-note"><span>{session?.metrics.price_note ?? desk.config?.price_note ?? 'Voice estimates use the configured rate. They do not enforce a provider spending cap.'}</span>{desk.report && <details><summary>Provider report</summary><pre>{json(desk.report)}</pre></details>}</div>
    </main>
    <footer><span><Icon name="star" size={14} />VoiceOps Desk <span className="footer-divider">/</span> Northstar Cloud demo</span><span>Private ElevenAgents connection <span className="tiny-dot" /> React + FastAPI</span></footer>
  </div>;
}

export default App;
