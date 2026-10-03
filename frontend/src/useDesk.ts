import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation } from '@elevenlabs/client';
import { api, ApiError } from './api';
import type { Config, ProviderReport, Scenario, Session, SessionMode } from './types';

type LiveConversation = Awaited<ReturnType<typeof Conversation.startSession>>;
type MessageCallback = NonNullable<Parameters<typeof Conversation.startSession>[0]['onMessage']>;
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

const errorText = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

export function useDesk() {
  const [config, setConfig] = useState<Config | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [agentMode, setAgentMode] = useState('listening');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ProviderReport | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const conversation = useRef<LiveConversation | null>(null);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const typedEchoes = useRef<string[]>([]);
  const ending = useRef(false);
  const stopped = useRef(false);
  const startedAt = useRef<number | null>(null);
  const mounted = useRef(true);

  const updateSession = useCallback((next: Session) => {
    if (!mounted.current) return;
    sessionRef.current = next;
    setSession(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErrors([]);
    const [configResult, scenariosResult] = await Promise.allSettled([api.config(), api.scenarios()]);
    if (!mounted.current) return;
    const errors: string[] = [];
    if (configResult.status === 'fulfilled') setConfig(configResult.value);
    else errors.push(`Configuration: ${errorText(configResult.reason, 'Could not load service configuration.')}`);
    if (scenariosResult.status === 'fulfilled') setScenarios(scenariosResult.value);
    else errors.push(`Scenarios: ${errorText(scenariosResult.reason, 'Could not load presenter scenarios.')}`);
    setLoadErrors(errors);
    setLoading(false);
  }, []);

  const refresh = useCallback(async (id: string) => {
    const next = await api.session(id);
    if (sessionRef.current?.id === id) updateSession(next);
    return next;
  }, [updateSession]);

  const loadReport = useCallback(async (id: string) => {
    try {
      const next = await api.report(id);
      if (mounted.current && sessionRef.current?.id === id) setReport(next);
    } catch (failure) {
      if (mounted.current && sessionRef.current?.id === id) {
        setReport({ available: false, reason: errorText(failure, 'Provider usage is unavailable.') });
      }
    }
  }, []);

  const finishBackend = useCallback(async (id: string) => {
    await syncQueue.current;
    const next = await api.end(id);
    if (sessionRef.current?.id === id) updateSession(next);
    if (next.mode !== 'preview' && next.provider_conversation_id) void loadReport(id);
  }, [loadReport, updateSession]);

  const stop = useCallback(async () => {
    if (ending.current || !sessionRef.current) return;
    ending.current = true;
    stopped.current = true;
    const id = sessionRef.current.id;
    setBusy('Ending session');
    const current = conversation.current;
    conversation.current = null;
    try {
      // End the provider transport before closing the local session.
      if (current) await current.endSession();
    } catch {
      setError('The connection could not close cleanly. The session has stopped locally.');
    }
    try {
      await finishBackend(id);
    } catch (failure) {
      setError(errorText(failure, 'Could not save the session end. Your existing results remain available.'));
    } finally {
      if (mounted.current) {
        setConnection('ended');
        setBusy(null);
      }
      startedAt.current = null;
      ending.current = false;
    }
  }, [finishBackend]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      stopped.current = true;
      const current = conversation.current;
      conversation.current = null;
      if (current) void current.endSession().catch(() => undefined);
    };
  }, [load]);

  useEffect(() => {
    if (connection !== 'connected' && connection !== 'connecting') return;
    const limit = Math.min(90, Math.max(1, config?.max_session_seconds ?? 90));
    const timer = window.setInterval(() => {
      if (startedAt.current === null) return;
      const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(seconds);
      if (seconds >= limit) void stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [config?.max_session_seconds, connection, stop]);

  const queueMessage = useCallback((id: string, role: 'user' | 'agent', text: string) => {
    if (!text.trim()) return;
    syncQueue.current = syncQueue.current.then(async () => {
      await api.message(id, role, text);
      await refresh(id);
    }).catch((failure: unknown) => {
      if (mounted.current) setError(errorText(failure, 'Could not save the transcript. Existing messages remain available.'));
    });
  }, [refresh]);

  const start = useCallback(async (scenario: Scenario, mode: SessionMode) => {
    if (busy || connection === 'connecting' || connection === 'connected') return;
    setError(null);
    setReport(null);
    setElapsed(0);
    setBusy(mode === 'preview' ? 'Loading preview' : 'Connecting');
    stopped.current = false;
    ending.current = false;
    syncQueue.current = Promise.resolve();
    typedEchoes.current = [];
    let created: Session | null = null;
    try {
      created = await api.create(scenario.id, mode);
      updateSession(created);
      if (mode === 'preview') {
        setConnection('idle');
        updateSession(await api.preview(created.id, scenario.first_user_message));
        return;
      }
      setConnection('connecting');
      startedAt.current = null;
      if (mode === 'voice') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable');
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permissionStream.getTracks().forEach((track) => track.stop());
      }
      const id = created.id;
      const credentials = await api.connect(id, mode === 'voice' ? 'webrtc' : 'websocket');
      if (stopped.current || !mounted.current) return;
      const { Conversation } = await import('@elevenlabs/client');
      if (stopped.current || !mounted.current) return;
      let acknowledgment: Promise<void> = Promise.resolve();
      let acknowledgmentFailure: unknown = null;
      const clientTools = Object.fromEntries(
        ['lookup_workspace', 'diagnose_error', 'estimate_monthly_cost', 'prepare_support_case'].map((name) => [name, async (parameters: unknown) => {
          try {
            await acknowledgment;
            if (acknowledgmentFailure) throw acknowledgmentFailure;
            const result = await api.tool(id, name, parameters);
            await refresh(id);
            return JSON.stringify(result.result);
          } catch (failure) {
            setError(errorText(failure, 'A support tool failed. The existing trace remains available.'));
            await refresh(id).catch(() => undefined);
            return JSON.stringify({ error: 'The support tool is unavailable. Tell the user and offer a recoverable next step.' });
          }
        }]),
      );
      const common = {
        dynamicVariables: { workspace_id: created.workspace.id },
        clientTools,
        onConnect: ({ conversationId }: { conversationId: string }) => {
          startedAt.current = Date.now();
          acknowledgment = api.provider(id, conversationId).then(() => undefined).catch((failure: unknown) => {
            acknowledgmentFailure = failure;
          });
          if (!stopped.current && mounted.current) setConnection('connected');
        },
        onDisconnect: (details: { reason: string }) => {
          if (ending.current || stopped.current || !mounted.current) return;
          stopped.current = true;
          conversation.current = null;
          startedAt.current = null;
          setConnection('ended');
          if (details.reason === 'error') setError('The live connection ended unexpectedly. Start a new session when ready.');
          void finishBackend(id).catch((failure: unknown) => setError(errorText(failure, 'Could not save the session end.')));
        },
        onError: () => {
          // Provider errors can contain signed URLs; never display, log, or persist them.
          setError('The live connection encountered an error. Stop this session and start a new one when ready.');
        },
        onModeChange: ({ mode: nextMode }: { mode: string }) => setAgentMode(nextMode),
        onMessage: (message: Parameters<MessageCallback>[0]) => {
          // SDK onMessage emits final responses/transcripts. Tentative parts use other callbacks.
          if (message.role === 'user') {
            const echo = typedEchoes.current.indexOf(message.message);
            if (echo >= 0) { typedEchoes.current.splice(echo, 1); return; }
          }
          queueMessage(id, message.role, message.message);
        },
      };
      const current = mode === 'voice'
        ? await Conversation.startSession({
            ...common,
            conversationToken: credentials.conversation_token!,
            connectionType: 'webrtc',
          })
        : await Conversation.startSession({
            ...common,
            signedUrl: credentials.signed_url!,
            connectionType: 'websocket',
            textOnly: true,
          });
      if (stopped.current || !mounted.current) {
        await current.endSession();
        return;
      }
      conversation.current = current;
      setConnection('connected');
      await acknowledgment;
      if (acknowledgmentFailure) throw acknowledgmentFailure;
      await refresh(id);
    } catch (failure) {
      // Only errors from our sanitized API client may reach the interface.
      setError(errorText(failure, mode === 'voice'
        ? 'Voice could not start. Check microphone permission and the provider connection, then start a new session.'
        : 'Live text could not start. Check the provider connection, then start a new session.'));
      // A local persistence failure can occur after SDK start; close any paid transport first.
      stopped.current = true;
      const current = conversation.current;
      conversation.current = null;
      if (current) await current.endSession().catch(() => undefined);
      setConnection('error');
      startedAt.current = null;
      if (created) {
        await syncQueue.current;
        await api.end(created.id).then(updateSession).catch(() => undefined);
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [busy, connection, finishBackend, queueMessage, refresh, updateSession]);

  const send = useCallback(async (text: string) => {
    const current = sessionRef.current;
    if (!current || !text.trim() || busy) return false;
    setError(null);
    if (current.mode === 'preview') {
      setBusy('Running preview');
      try {
        updateSession(await api.preview(current.id, text));
        return true;
      } catch (failure) {
        setError(errorText(failure, 'The preview could not run. Try again.'));
        return false;
      } finally { setBusy(null); }
    }
    if (!conversation.current || connection !== 'connected') return false;
    try {
      conversation.current.sendUserMessage(text);
      typedEchoes.current.push(text);
      queueMessage(current.id, 'user', text);
      return true;
    } catch {
      setError('The message could not be sent. Stop this session and start a new one when ready.');
      return false;
    }
  }, [busy, connection, queueMessage, updateSession]);

  const confirm = useCallback(async (actionId: string) => {
    const current = sessionRef.current;
    if (!current || busy) return;
    setBusy('Creating support case');
    setError(null);
    try {
      const result = await api.confirm(current.id, actionId);
      updateSession(result.session);
      if (conversation.current && connection === 'connected') {
        conversation.current.sendContextualUpdate(`The user explicitly approved the support case. The backend created case ${result.case.id}.`);
      }
      await refresh(current.id);
    } catch (failure) {
      setError(errorText(failure, 'The case could not be confirmed. Review the trace and try again.'));
    } finally { setBusy(null); }
  }, [busy, connection, refresh, updateSession]);

  const reset = useCallback(async () => {
    if (busy) return;
    if (sessionRef.current && sessionRef.current.status !== 'ended') await stop();
    sessionRef.current = null;
    setSession(null);
    setConnection('idle');
    setError(null);
    setReport(null);
    setElapsed(0);
  }, [busy, stop]);

  const liveReady = Boolean(config?.key_loaded && config?.agent_provisioned && config?.cloud_status === 'ready');
  const seconds = session?.mode === 'preview' || connection === 'ended' || connection === 'error'
    ? session?.metrics.elapsed_seconds ?? elapsed : elapsed;

  return { config, scenarios, loadErrors, loading, load, session, connection, agentMode, busy, error, setError,
    report, elapsed: seconds, liveReady, start, stop, send, confirm, reset, refresh, loadReport };
}
