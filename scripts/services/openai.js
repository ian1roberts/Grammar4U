;(function (ns) {
  const { escapeHtml } = ns.utils.dom;

  const DEFAULT_MODELS = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
  ];

  async function testApiKey(endpoint, { token } = {}) {
    if (!endpoint) {
      return { ok: false, status: 'error', message: 'No endpoint configured' };
    }

    const url = endpoint.replace(/\/$/, '') + '/v1/models';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: token ? { 'X-CG-Proxy-Token': token } : undefined
      });

      if (response.ok) {
        return { ok: true, status: 'success', message: 'Available via proxy' };
      }

      const text = await response.text().catch(() => 'Unknown error');

      if (response.status === 401) {
        return {
          ok: false,
          status: 'error',
          message: text.includes('proxy token') ? 'Proxy: token rejected' : 'Proxy: API key missing',
          detail: text
        };
      }

      if (response.status === 404) {
        return { ok: false, status: 'error', message: 'Proxy: Endpoint missing', detail: text };
      }

      return { ok: false, status: 'error', message: `Proxy: Error ${response.status}`, detail: text };
    } catch (error) {
      const message = error.message.includes('Failed to fetch') ? 'Proxy unreachable' : 'Check failed';
      return { ok: false, status: 'error', message, detail: error.message };
    }
  }

  async function fetchModels(endpoint, { busy, signal, token } = {}) {
    if (!endpoint) {
      return null;
    }

    const url = endpoint.replace(/\/$/, '') + '/v1/models';

    busy?.show('Fetching available models...');
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: token ? { 'X-CG-Proxy-Token': token } : undefined,
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return (data.data || [])
        .filter((model) => model.id.includes('gpt') || model.id.includes('o1'))
        .map((model) => ({
          id: model.id,
          name: model.id
            .replace(/^gpt-/, 'GPT-')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase())
        }));
    } finally {
      busy?.hide();
    }
  }

  async function requestChatCompletion(endpoint, body, { busy, message, token } = {}) {
    if (!endpoint) {
      throw new Error('Missing endpoint');
    }

    busy?.show(message ?? 'LLM query sent, waiting for response …');

    try {
      const response = await fetch(endpoint.replace(/\/$/, '') + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-CG-Proxy-Token': token } : {})
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI error ${response.status}: ${text}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } finally {
      busy?.hide();
    }
  }

  const ANALYSE_SYSTEM_PROMPT = {
    role: 'system',
    content:
      'You are a meticulous British-English copy editor. Return STRICT JSON: {"grammar":[],"clarity":[],"tone":[]}. Each array contains edits as {"message":str,"start":int,"end":int,"replacement":str|null}. Indices refer to the given text.',
    cache_control: { type: 'ephemeral' }
  };

  async function analyseTextWithLLM(text, { endpoint, model, busy, token }) {
    if (!endpoint) {
      throw new Error('Missing endpoint');
    }

    const chunkSize = 8000;
    const chunks = [];
    for (let index = 0; index < text.length; index += chunkSize) {
      chunks.push(text.slice(index, index + chunkSize));
    }

    const outputs = [];

    for (const [index, chunk] of chunks.entries()) {
      const content = await requestChatCompletion(
        endpoint,
        {
          model,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          messages: [ANALYSE_SYSTEM_PROMPT, { role: 'user', content: `Text (chunk ${index + 1}/${chunks.length}):\n${chunk}` }]
        },
        { busy, token }
      );

      let parsed;
      try {
        parsed = JSON.parse(content);
        if (!parsed.grammar || !parsed.clarity || !parsed.tone) {
          parsed = { grammar: [], clarity: [], tone: [] };
        }
      } catch (error) {
        console.warn('Failed to parse LLM response', error, content);
        parsed = { grammar: [], clarity: [], tone: [] };
      }

      outputs.push({ offset: index * chunkSize, data: parsed });
    }

    const results = { grammar: [], clarity: [], tone: [] };

    outputs.forEach(({ offset, data }) => {
      ['grammar', 'clarity', 'tone'].forEach((key) => {
        (data[key] || []).forEach((suggestion) => {
          if (
            !suggestion ||
            typeof suggestion.message !== 'string' ||
            typeof suggestion.start !== 'number' ||
            typeof suggestion.end !== 'number'
          ) {
            console.warn('Invalid LLM suggestion object', suggestion);
            return;
          }

          results[key].push({
            id: `llm-${key}-${offset}-${suggestion.start}-${suggestion.end}`,
            type: key,
            severity: 'medium',
            message: suggestion.message,
            start: suggestion.start + offset,
            end: suggestion.end + offset,
            fixText: suggestion.replacement,
            preview: (source) =>
              suggestion.replacement != null
                ? `${escapeHtml(source.slice(suggestion.start + offset, suggestion.end + offset))} → <mark class="add">${escapeHtml(
                    suggestion.replacement
                  )}</mark>`
                : 'Review and edit manually.'
          });
        });
      });
    });

    return results;
  }

  const REWRITE_PROMPTS = {
    simplify: 'Rewrite to be clearer and simpler without losing meaning. Short sentences; plain British English.',
    formal: 'Rewrite in a formal, professional register suitable for a business report in British English.',
    friendly: 'Rewrite to sound warm and friendly while staying concise in British English.'
  };

  const REWRITE_SYSTEM_PROMPT = {
    role: 'system',
    content: 'You are a careful British-English editor. Preserve meaning precisely.',
    cache_control: { type: 'ephemeral' }
  };

  async function rewriteWithLLM(text, mode, { endpoint, model, busy, token }) {
    const instruction = REWRITE_PROMPTS[mode];
    if (!instruction) {
      throw new Error(`Unknown rewrite mode: ${mode}`);
    }

    const content = await requestChatCompletion(
      endpoint,
      {
        model,
        temperature: 0.25,
        messages: [REWRITE_SYSTEM_PROMPT, { role: 'user', content: `${instruction}\n\nText:\n"""${text}"""` }]
      },
      { busy, token }
    );

    return content;
  }

  ns.services = ns.services || {};
  ns.services.openai = {
    DEFAULT_MODELS,
    testApiKey,
    fetchModels,
    analyseTextWithLLM,
    rewriteWithLLM
  };
})(window.CG = window.CG || {});
