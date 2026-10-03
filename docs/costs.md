# Agent cost model

Verified against official sources on **2026-10-03**. These are rate-card projections, not measured conversation charges. The separate Northstar support-plan forecast in the demo uses invented prices.

## ElevenAgents

| Component | Current list rate |
| --- | ---: |
| Additional voice minute | $0.080 |
| Text message | $0.003 |
| Burst voice minute | $0.160 |
| LLM | Additional, model/token dependent |

STT, TTS, knowledge bases and RAG are included in the platform layer; do not add standalone TTS pricing. Browser conversations have no external carrier fee. Subscription allowances change marginal spend: current included minutes are Free 15, Starter 75, Creator 275, Pro 1,238, Scale 3,738 and Business 12,375. Promotions and taxes are excluded. [Official pricing](https://elevenlabs.io/pricing/agents).

```text
90-second normal voice projection = 1.5 × $0.08 = $0.12 + LLM usage
10 billable text messages         = 10 × $0.003 = $0.03 + LLM usage
```

The UI shows elapsed voice duration × $0.08, explicitly excluding LLM usage and allowances. It is a usage-value projection; included minutes may absorb platform overage. Connection time, silence discounts and typed messages can affect settlement. Silence longer than 10 seconds receives a 95% platform discount. The public message price does not define a counting rule sufficient to equate transcript rows with billable messages. [Cost help](https://elevenlabs.io/docs/help-center/product/eleven-agents/how-much-does-eleven-agents-cost).

The configured LLM is GPT-4.1 mini. Its prompt, history, tool definitions, generated tokens and caching affect cost. No universal all-in rate is assumed. Review the model's current cost display or provider telemetry for actual usage. The 90-second cloud/browser limits and disabled bursting bound a demo's duration; they do not enforce an account dollar limit. [LLM cost optimization](https://elevenlabs.io/docs/eleven-agents/customization/llm/optimizing-costs).

## Compare complete orchestration stacks

| Platform | What the published price covers | What to add |
| --- | --- | --- |
| ElevenAgents | $0.08/additional voice min; STT/TTS/KB/RAG | LLM; allowance/subscription context |
| Vapi | $0.05/min hosting | Transcriber, model, voice, selected transport |
| Retell | $0.055/min voice infrastructure | TTS, model, KB/add-ons, selected transport |

Vapi's public calculator projects **$82–129 per 1,000 minutes** for a Deepgram/OpenAI/ElevenLabs example: $50 hosting, $10 transcriber, $8–45 model, $15–24 voice and $0 selected transport. That is a published configuration range, not a workload-matched quote. Actual components use different meters, including tokens and spoken characters. [Vapi pricing](https://vapi.ai/pricing), [Vapi component costs](https://docs.vapi.ai/assistants/model-intelligence/understanding-cost).

A selected Retell stack is **$0.1128/min**: $0.055 infrastructure + $0.040 ElevenLabs voice + $0.0128 GPT-4.1 mini + $0.005 KB. That projects $0.1692 for 90 seconds before additional transport/features. Retell's GPT-4.1 mini text option is $0.004 per AI message; that is a different billing boundary from ElevenAgents' platform fee plus LLM. These selections do not establish equivalent model workloads, quality or latency. [Retell pricing](https://www.retellai.com/pricing).

No vendor is ranked cheapest from these cards. A defensible comparison runs the same scripts, voices, model choices, knowledge and tool operations, then compares complete measured costs and outcomes.

## Provider-reported cost versus invoice

The current conversation schema defines `metadata.cost_fiat` as total conversation USD: LLM price plus non-LLM platform price. `metadata.cost` remains an integer with undocumented units. Keep it raw; do not label it dollars. `charging` exposes price/charge components and included-minute consumption. TTS/ASR usage fields are analytics-only, not additional billing. Null means unavailable, not zero. Do not add component prices to `cost_fiat` again. Conversation usage still does not establish the account's invoice or cash charge. [Conversation details schema](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get).

## Evidence and remaining work

Rates were checked with direct official pages/docs and Tavily. Sandbox Keychain/network access initially failed; an explicit official-site web-search fallback was used, then authorized read-only execution restored Tavily and direct retrieval. Stale search snippets were rejected when they conflicted with current pages. No competitor conversation or paid ElevenAgents session has been measured for this release. Live evaluation remains blocked by the key's Agents permissions; refresh this document after obtaining actual conversation telemetry.
