// Server-only OpenAI Responses API transport for the condition interpreter. No retries; failures return a safe
// category and the caller falls back. Never logs or returns the key, the prompt or the model output.
import type { ModelTransport, TransportResult } from '../conditions/interpreter';

export const INTERPRETER_MODEL = process.env.OPENAI_INTERPRETER_MODEL || 'gpt-6-luna';
export const INTERPRETER_TIMEOUT_MS = 8000;
const MAX_OUTPUT_TOKENS = 2000;

interface ResponsesBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
}

export function openAiTransport(
  apiKey: string,
  opts: { model?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): ModelTransport {
  const doFetch = opts.fetchImpl ?? fetch;
  return async ({ system, user, schema }): Promise<TransportResult> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? INTERPRETER_TIMEOUT_MS);
    try {
      const res = await doFetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: opts.model ?? INTERPRETER_MODEL,
          reasoning: { effort: 'low' },
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          text: { format: { type: 'json_schema', name: 'condition_clauses', strict: true, schema } },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
        }),
      });
      if (!res.ok) return { ok: false, category: res.status >= 500 || res.status === 429 ? 'unavailable' : 'http_error' };
      const body = (await res.json()) as ResponsesBody;
      if (body.status === 'incomplete' || body.incomplete_details?.reason) return { ok: false, category: 'truncated' };
      const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
      if (parts.some((p) => p.type === 'refusal')) return { ok: false, category: 'refusal' };
      const text = parts
        .filter((p) => p.type === 'output_text')
        .map((p) => p.text ?? '')
        .join('');
      return text ? { ok: true, text } : { ok: false, category: 'bad_json' };
    } catch (err) {
      return { ok: false, category: (err as { name?: string })?.name === 'AbortError' ? 'timeout' : 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** The production transport, or null (offline fallback) when no key is configured. */
export function defaultTransport(): ModelTransport | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? openAiTransport(key) : null;
}
