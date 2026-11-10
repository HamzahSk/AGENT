import { Hono } from 'hono';
import { fileURLToPath } from 'url';
import { DeepSeek } from '../deepseek_apk.js';

const isBun = typeof Bun !== 'undefined';
let apiKeys = (process.env.DEEPSEEK_KEYS || process.env.DEEPSEEK_TOKEN || '')
  .split(',').map(value => value.trim()).filter(Boolean);
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 50);
const sessions = new Map();
const responseSessions = new Map();
let sessionFactory = async ({ apiKey, signal }) => new DeepSeek({ auth: apiKey }).create({ signal });

function newId(prefix) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }
function unixNow() { return Math.floor(Date.now() / 1000); }
function estimateTokens(text) { return text ? Math.max(1, Math.ceil(String(text).length / 4)) : 0; }
function openaiError(message, type = 'invalid_request_error', code = null, status = 400, param = null) {
  return { status, body: { error: { message, type, param, code } } };
}
function errorResponse(c, error) {
  const status = error?.status >= 400 && error.status < 600 ? error.status : 502;
  const type = status < 500 ? 'invalid_request_error' : 'server_error';
  return c.json(openaiError(error?.message || 'Upstream request failed', type, error?.code || null, status).body, status);
}
async function readJson(c) { try { return await c.req.json(); } catch { return null; } }
function pickApiKey() {
  if (!apiKeys.length) {
    const error = new Error('No DeepSeek API key configured; set DEEPSEEK_KEYS or DEEPSEEK_TOKEN');
    error.status = 503;
    error.code = 'api_key_unavailable';
    throw error;
  }
  return apiKeys[Math.floor(Math.random() * apiKeys.length)];
}
function evictIfNeeded() {
  while (sessions.size > MAX_SESSIONS) {
    let oldest;
    for (const entry of sessions) if (!oldest || entry[1].lastUsed < oldest[1].lastUsed) oldest = entry;
    if (!oldest) return;
    sessions.delete(oldest[0]);
    for (const [responseId, chatId] of responseSessions) if (chatId === oldest[0]) responseSessions.delete(responseId);
  }
}
async function createSession({ model, requestedId, signal }) {
  const apiKey = pickApiKey();
  const session = await sessionFactory({ apiKey, model, signal });
  const chatId = requestedId || newId('chatcmpl');
  const record = { session, apiKey, model, createdAt: Date.now(), lastUsed: Date.now(), lastTools: null, lock: Promise.resolve() };
  sessions.set(chatId, record);
  evictIfNeeded();
  return { chatId, record, recreated: !!requestedId };
}
async function getSession({ chatId, model, signal }) {
  const record = chatId ? sessions.get(chatId) : null;
  if (record) { record.model = model; return { chatId, record, recreated: false }; }
  return createSession({ model, requestedId: chatId, signal });
}
async function acquire(record) {
  const previous = record.lock;
  let release;
  record.lock = new Promise(resolve => { release = resolve; });
  await previous;
  return release;
}

function contentParts(content) {
  if (typeof content === 'string') return { text: content, urls: [] };
  if (!Array.isArray(content)) return { text: '', urls: [] };
  const text = [];
  const urls = [];
  for (const part of content) {
    if (typeof part === 'string') text.push(part);
    else if (typeof part?.text === 'string') text.push(part.text);
    else if (typeof part?.content === 'string') text.push(part.content);
    else if (part?.type === 'input_image' && typeof part.image_url === 'string') urls.push(part.image_url);
    else if (part?.type === 'image_url') {
      const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      if (typeof url === 'string') urls.push(url);
    } else if (part?.type === 'input_file') {
      if (typeof part.file_url === 'string') urls.push(part.file_url);
      if (typeof part.filename === 'string') text.push(`[Attached file: ${part.filename}]`);
    }
  }
  return { text: text.join('\n'), urls };
}
function normalizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap(tool => {
    if (tool?.type === 'namespace' && tool.name && Array.isArray(tool.tools)) {
      return tool.tools.flatMap(nested => {
        if (!['function', 'custom'].includes(nested?.type) || !nested.name) return [];
        return [{
          type: nested.type,
          namespace: tool.name,
          name: nested.name,
          description: nested.description || '',
          parameters: nested.parameters || {},
          format: nested.format,
          strict: nested.strict,
        }];
      });
    }
    if (!['function', 'custom'].includes(tool?.type)) return [];
    const definition = tool.function || tool;
    return definition.name ? [{
      type: tool.type,
      name: definition.name,
      description: definition.description || '',
      parameters: definition.parameters || {},
      format: definition.format,
      strict: definition.strict,
    }] : [];
  });
}
function toolInstructions(tools, toolChoice, isToolResultTurn) {
  if (!tools.length && !isToolResultTurn) return '';
  let instruction = '[TOOL CALLING]\n';
  if (tools.length) instruction += `Available tools:\n${JSON.stringify(tools, null, 2)}\n`;
  if (toolChoice === 'required') instruction += 'You must call one available function.\n';
  const selected = toolChoice?.function?.name || toolChoice?.name;
  if (selected) instruction += `You must call the function named ${JSON.stringify(selected)}.\n`;
  return instruction + 'To call a function tool, return only valid JSON: '
    + '{"tool_call":{"namespace":"optional_namespace","name":"function_name","arguments":{}}}. '
    + 'For a custom tool, use: {"tool_call":{"namespace":"optional_namespace","name":"tool_name","input":"raw tool input"}}. '
    + 'After a tool result, either call another function in that shape or answer normally.';
}
function flattenMessages(messages) {
  const blocks = [];
  const urls = [];
  for (const message of messages || []) {
    const parsed = contentParts(message?.content);
    urls.push(...parsed.urls);
    if (message?.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      blocks.push(`[ASSISTANT TOOL CALLS]\n${JSON.stringify(message.tool_calls.map(call => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments })))}`);
    } else if (message?.role === 'tool') {
      blocks.push(`[TOOL RESULT call_id=${message.tool_call_id || '-'}]\n${parsed.text || '(empty)'}`);
    } else if (parsed.text) {
      const role = message?.role === 'developer' ? 'DEVELOPER' : String(message?.role || 'user').toUpperCase();
      blocks.push(`[${role}]\n${parsed.text}`);
    }
  }
  return { text: blocks.join('\n\n'), urls };
}
function buildPrompt(messages, tools, toolChoice, instructions = '') {
  const flattened = flattenMessages(messages);
  const last = messages?.at(-1);
  const prefix = [instructions, toolInstructions(tools, toolChoice, last?.role === 'tool')].filter(Boolean).join('\n\n');
  return { prompt: [prefix, flattened.text].filter(Boolean).join('\n\n'), urls: flattened.urls };
}
function parseToolCall(text, tools) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value;
  try { value = JSON.parse(cleaned); } catch { return null; }
  const call = value?.tool_call || value;
  if (!call?.name) return null;
  const definitions = Array.isArray(tools) ? tools : [];
  const requestedName = String(call.name);
  const requestedNamespace = call.namespace || (requestedName.includes('.') ? requestedName.split('.', 1)[0] : null);
  const bareName = requestedName.includes('.') ? requestedName.slice(requestedName.indexOf('.') + 1) : requestedName;
  const definition = definitions.find(tool =>
    tool?.name === bareName && (!requestedNamespace || tool.namespace === requestedNamespace)
  );
  if (definitions.length && !definition) return null;
  const type = definition?.type || 'function';
  const namespace = definition?.namespace || requestedNamespace || undefined;
  if (type === 'custom') {
    let input = call.input ?? call.arguments ?? call.parameters ?? '';
    if (typeof input !== 'string') input = JSON.stringify(input);
    return { type, namespace, name: definition?.name || bareName, input };
  }
  let args = call.arguments ?? call.parameters ?? {};
  if (typeof args !== 'string') args = JSON.stringify(args);
  return { type, namespace, name: definition?.name || bareName, arguments: args };
}
function usageFor(prompt, output, reasoning = '') {
  const promptTokens = estimateTokens(prompt);
  const outputTokens = estimateTokens(output) + estimateTokens(reasoning);
  return { prompt_tokens: promptTokens, completion_tokens: outputTokens, total_tokens: promptTokens + outputTokens };
}
function responsesUsage(prompt, output, reasoning = '') {
  const inputTokens = estimateTokens(prompt);
  const reasoningTokens = estimateTokens(reasoning);
  const outputTokens = estimateTokens(output) + reasoningTokens;
  return { input_tokens: inputTokens, input_tokens_details: { cached_tokens: 0 }, output_tokens: outputTokens, output_tokens_details: { reasoning_tokens: reasoningTokens }, total_tokens: inputTokens + outputTokens };
}
function toolChoiceValue(value) {
  if (!value) return 'auto';
  if (typeof value === 'string') return value;
  if (value.type === 'function' && value.name) return { type: 'function', name: value.name };
  if (value.function?.name) return { type: 'function', name: value.function.name };
  return 'auto';
}

function streamResponse(c, task, { chatId, sendDoneMarker = false } = {}) {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const requestSignal = c.req.raw.signal;
  const onAbort = () => abortController.abort(requestSignal.reason || new Error('Client disconnected'));
  requestSignal?.addEventListener('abort', onAbort, { once: true });
  let heartbeat;
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const write = data => {
        if (closed) return false;
        try { controller.enqueue(encoder.encode(data)); return true; }
        catch (error) { closed = true; abortController.abort(error); return false; }
      };
      const send = (value, event) => write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(value)}\n\n`);
      const comment = value => write(`: ${value}\n\n`);
      heartbeat = setInterval(() => comment(`keepalive ${Date.now()}`), 10000);
      void (async () => {
        try {
          await task({ send, comment, signal: abortController.signal });
          if (sendDoneMarker && !closed) write('data: [DONE]\n\n');
        } catch (error) {
          if (!abortController.signal.aborted && !closed) {
            send({ error: { message: error.message || 'Streaming request failed', type: 'server_error', param: null, code: error.code || null } });
            if (sendDoneMarker) write('data: [DONE]\n\n');
          }
        } finally {
          clearInterval(heartbeat);
          requestSignal?.removeEventListener('abort', onAbort);
          if (!closed) { closed = true; try { controller.close(); } catch {} }
        }
      })();
    },
    cancel(reason) {
      closed = true;
      clearInterval(heartbeat);
      requestSignal?.removeEventListener('abort', onAbort);
      abortController.abort(reason || new Error('Client disconnected'));
    },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Content-Encoding': 'identity',
    'X-Accel-Buffering': 'no',
    ...(chatId ? { 'X-Chat-Id': chatId } : {}),
  } });
}

function responseObject({ responseId, model, createdAt, status, output, usage, body, error = null }) {
  return {
    id: responseId, object: 'response', created_at: createdAt, status, background: false, error,
    incomplete_details: null, instructions: body.instructions ?? null,
    max_output_tokens: body.max_output_tokens ?? null, max_tool_calls: body.max_tool_calls ?? null,
    model, output, parallel_tool_calls: body.parallel_tool_calls ?? true,
    previous_response_id: body.previous_response_id ?? null, prompt_cache_key: body.prompt_cache_key ?? null,
    reasoning: { effort: body.reasoning?.effort ?? null, summary: body.reasoning?.summary ?? null },
    safety_identifier: body.safety_identifier ?? null, service_tier: body.service_tier ?? 'default',
    store: body.store ?? true, temperature: body.temperature ?? null,
    text: body.text || { format: { type: 'text' } }, tool_choice: toolChoiceValue(body.tool_choice),
    tools: body.tools || [], top_logprobs: body.top_logprobs ?? 0, top_p: body.top_p ?? null,
    truncation: body.truncation ?? 'disabled', usage, metadata: body.metadata || {}, user: body.user ?? null,
  };
}
function messageItem(itemId, text, status = 'completed') {
  return { id: itemId, type: 'message', status, role: 'assistant', content: text == null ? [] : [{ type: 'output_text', annotations: [], logprobs: [], text }] };
}
function functionItem(itemId, callId, call, status = 'completed') {
  return { id: itemId, type: 'function_call', status, call_id: callId, name: call.name, arguments: call.arguments, ...(call.namespace ? { namespace: call.namespace } : {}) };
}
function customItem(itemId, callId, call, status = 'completed') {
  return { id: itemId, type: 'custom_tool_call', status, call_id: callId, name: call.name, input: call.input, ...(call.namespace ? { namespace: call.namespace } : {}) };
}
function responseToolItem(itemId, callId, call, status = 'completed') {
  return call.type === 'custom' ? customItem(itemId, callId, call, status) : functionItem(itemId, callId, call, status);
}
function chatFunction(call) {
  return { name: call.namespace ? `${call.namespace}.${call.name}` : call.name, arguments: call.arguments ?? JSON.stringify({ input: call.input ?? '' }) };
}
function responseInputMessages(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (!Array.isArray(input)) return [];
  const messages = [];
  for (const item of input) {
    if (typeof item === 'string') messages.push({ role: 'user', content: item });
    else if (item?.type === 'function_call_output' || item?.type === 'custom_tool_call_output') {
      messages.push({ role: 'tool', tool_call_id: item.call_id, content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output) });
    } else if (item?.type === 'function_call') {
      messages.push({ role: 'assistant', content: '', tool_calls: [{ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } }] });
    } else if (item?.type === 'reasoning') {
      const summary = Array.isArray(item.summary) ? item.summary.map(part => part?.text || '').filter(Boolean).join('\n') : '';
      if (summary) messages.push({ role: 'assistant', content: `[Previous reasoning summary]\n${summary}` });
    } else if (item?.type === 'input_text') messages.push({ role: 'user', content: item.text || '' });
    else if (item?.role || item?.type === 'message') messages.push({ role: item.role || 'user', content: item.content ?? '' });
  }
  return messages;
}

const app = new Hono();
app.onError((error, c) => { console.error('Gateway error:', error); return errorResponse(c, error); });
app.get('/', c => c.json({ status: true, message: 'AI gateway active' }));
app.get('/health', c => c.json({ status: 'ok', sessions: sessions.size, keys: apiKeys.length, runtime: isBun ? 'bun' : 'node' }));
app.get('/v1/models', c => c.json({ object: 'list', data: [
  { id: 'deepseek-chat', object: 'model', created: unixNow(), owned_by: 'deepseek' },
  { id: 'deepseek-reasoner', object: 'model', created: unixNow(), owned_by: 'deepseek' },
] }));

app.post('/v1/chat/completions', async c => {
  const body = await readJson(c);
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return c.json(openaiError('`messages` must be a non-empty array', 'invalid_request_error', null, 400, 'messages').body, 400);
  const model = typeof body.model === 'string' && body.model ? body.model : 'deepseek-chat';
  const tools = body.tool_choice === 'none' ? [] : normalizeTools(body.tools);
  const built = buildPrompt(body.messages, tools, body.tool_choice);
  if (!built.prompt.trim()) return c.json(openaiError('No usable message content', 'invalid_request_error', null, 400, 'messages').body, 400);
  const refs = [...new Set([...(Array.isArray(body.ref_file_urls) ? body.ref_file_urls : []), ...built.urls])];
  let selected;
  try { selected = await getSession({ chatId: body.chat_id, model, signal: c.req.raw.signal }); }
  catch (error) { return errorResponse(c, error); }
  const { chatId, record, recreated } = selected;
  const useThinking = !!body.thinking || model === 'deepseek-reasoner';
  const useSearch = !!body.web_search;
  const hasTools = tools.length > 0 || body.messages.at(-1)?.role === 'tool';

  if (!body.stream) {
    const release = await acquire(record);
    try {
      const result = await record.session.chat({ prompt: built.prompt, ref_file_urls: refs, thinking_enabled: useThinking, search_enabled: useSearch, signal: c.req.raw.signal });
      record.lastUsed = Date.now();
      const text = result.message || '';
      const definitions = tools.length ? tools : record.lastTools || [];
      const call = hasTools ? parseToolCall(text, definitions) : null;
      if (tools.length) record.lastTools = tools;
      const message = call ? { role: 'assistant', content: null, tool_calls: [{ id: newId('call'), type: 'function', function: chatFunction(call) }], ...(result.thoughts ? { reasoning_content: result.thoughts } : {}) }
        : { role: 'assistant', content: text, ...(result.thoughts ? { reasoning_content: result.thoughts } : {}) };
      return c.json({ id: chatId, object: 'chat.completion', created: unixNow(), model, choices: [{ index: 0, message, finish_reason: call ? 'tool_calls' : 'stop' }], usage: usageFor(built.prompt, text, result.thoughts), deepseek: { message_id: result.message_id, parent_id: result.parent_id, session_recreated: recreated } });
    } catch (error) { return errorResponse(c, error); }
    finally { release(); }
  }

  return streamResponse(c, async ({ send, signal }) => {
    const release = await acquire(record);
    let content = '', reasoning = '', sent = 0, mode = hasTools ? 'probe' : 'text';
    let messageId = null, parentId = null;
    const created = unixNow();
    try {
      send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] });
      for await (const event of record.session.chatStream({ prompt: built.prompt, ref_file_urls: refs, thinking_enabled: useThinking, search_enabled: useSearch, signal })) {
        record.lastUsed = Date.now();
        if (event.thinking) { reasoning += event.thinking; send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { reasoning_content: event.thinking }, finish_reason: null }] }); }
        if (event.delta) {
          content += event.delta;
          if (mode === 'probe') { const first = content.trimStart()[0]; if (first && first !== '{') mode = 'text'; }
          if (mode === 'text' && content.length > sent) {
            const delta = content.slice(sent); sent = content.length;
            send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] });
          }
        }
        if (event.done) { messageId = event.message_id; parentId = event.parent_id; }
      }
      const definitions = tools.length ? tools : record.lastTools || [];
      const call = hasTools ? parseToolCall(content, definitions) : null;
      if (tools.length) record.lastTools = tools;
      if (call) send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: newId('call'), type: 'function', function: chatFunction(call) }] }, finish_reason: null }] });
      else if (content.length > sent) send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: content.slice(sent) }, finish_reason: null }] });
      send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }], deepseek: { message_id: messageId, parent_id: parentId, session_recreated: recreated } });
      if (body.stream_options?.include_usage) send({ id: chatId, object: 'chat.completion.chunk', created, model, choices: [], usage: usageFor(built.prompt, content, reasoning) });
    } finally { release(); }
  }, { chatId, sendDoneMarker: true });
});

app.post('/v1/responses', async c => {
  const body = await readJson(c);
  if (!body || body.input == null) return c.json(openaiError('`input` is required', 'invalid_request_error', null, 400, 'input').body, 400);
  if (body.background) return c.json(openaiError('Background responses are not supported', 'invalid_request_error', 'unsupported_parameter', 400, 'background').body, 400);
  const supportedToolTypes = ['function', 'custom', 'namespace', 'web_search', 'web_search_preview', 'tool_search'];
  const unsupportedTool = Array.isArray(body.tools) && body.tools.find(tool => !supportedToolTypes.includes(tool?.type));
  if (unsupportedTool) return c.json(openaiError(`Tool type ${JSON.stringify(unsupportedTool.type)} is not supported by this provider`, 'invalid_request_error', 'unsupported_tool', 400, 'tools').body, 400);
  const model = typeof body.model === 'string' && body.model ? body.model : 'deepseek-chat';
  const tools = body.tool_choice === 'none' ? [] : normalizeTools(body.tools);
  const messages = responseInputMessages(body.input);
  const built = buildPrompt(messages, tools, body.tool_choice, typeof body.instructions === 'string' ? `[DEVELOPER]\n${body.instructions}` : '');
  if (!built.prompt.trim()) return c.json(openaiError('No usable input content', 'invalid_request_error', null, 400, 'input').body, 400);
  const refs = [...new Set([...(Array.isArray(body.ref_file_urls) ? body.ref_file_urls : []), ...built.urls])];
  let chatId = body.chat_id || null;
  if (body.previous_response_id) {
    chatId = responseSessions.get(body.previous_response_id);
    if (!chatId) return c.json(openaiError(`Unknown previous_response_id: ${body.previous_response_id}`, 'invalid_request_error', 'previous_response_not_found', 404, 'previous_response_id').body, 404);
  } else if (!chatId && body.conversation) {
    const conversationId = typeof body.conversation === 'string' ? body.conversation : body.conversation?.id;
    if (conversationId) chatId = `conversation_${conversationId}`;
  }
  let selected;
  try { selected = await getSession({ chatId, model, signal: c.req.raw.signal }); }
  catch (error) { return errorResponse(c, error); }
  const { record } = selected;
  const responseId = newId('resp');
  responseSessions.set(responseId, selected.chatId);
  const createdAt = unixNow();
  const useThinking = model === 'deepseek-reasoner' || !!body.reasoning?.effort;
  const useSearch = !!body.web_search || body.tools?.some(tool => tool?.type === 'web_search' || tool?.type === 'web_search_preview');

  if (!body.stream) {
    const release = await acquire(record);
    try {
      const result = await record.session.chat({ prompt: built.prompt, ref_file_urls: refs, thinking_enabled: useThinking, search_enabled: useSearch, signal: c.req.raw.signal });
      record.lastUsed = Date.now();
      const text = result.message || '';
      const call = tools.length ? parseToolCall(text, tools) : null;
      const output = call ? [responseToolItem(newId(call.type === 'custom' ? 'ctc' : 'fc'), newId('call'), call)] : [messageItem(newId('msg'), text)];
      return c.json(responseObject({ responseId, model, createdAt, status: 'completed', output, usage: responsesUsage(built.prompt, text, result.thoughts), body }));
    } catch (error) { responseSessions.delete(responseId); return errorResponse(c, error); }
    finally { release(); }
  }

  return streamResponse(c, async ({ send, signal }) => {
    const release = await acquire(record);
    let sequence = 0, content = '', reasoning = '', sent = 0, outputItem = null, itemStarted = false;
    let mode = tools.length ? 'probe' : 'text';
    const event = (type, value) => send({ type, sequence_number: sequence++, ...value }, type);
    const startTextItem = () => {
      if (itemStarted) return;
      outputItem = messageItem(newId('msg'), null, 'in_progress'); itemStarted = true;
      event('response.output_item.added', { output_index: 0, item: outputItem });
      event('response.content_part.added', { item_id: outputItem.id, output_index: 0, content_index: 0, part: { type: 'output_text', annotations: [], logprobs: [], text: '' } });
    };
    try {
      const initial = responseObject({ responseId, model, createdAt, status: 'in_progress', output: [], usage: null, body });
      event('response.created', { response: initial });
      event('response.in_progress', { response: initial });
      if (mode === 'text') startTextItem();
      for await (const upstream of record.session.chatStream({ prompt: built.prompt, ref_file_urls: refs, thinking_enabled: useThinking, search_enabled: useSearch, signal })) {
        record.lastUsed = Date.now();
        if (upstream.thinking) reasoning += upstream.thinking;
        if (!upstream.delta) continue;
        content += upstream.delta;
        if (mode === 'probe') { const first = content.trimStart()[0]; if (first && first !== '{') { mode = 'text'; startTextItem(); } }
        if (mode === 'text' && content.length > sent) {
          const delta = content.slice(sent); sent = content.length;
          event('response.output_text.delta', { item_id: outputItem.id, output_index: 0, content_index: 0, delta, logprobs: [] });
        }
      }
      const call = tools.length ? parseToolCall(content, tools) : null;
      let finalItem;
      if (call) {
        const itemId = newId(call.type === 'custom' ? 'ctc' : 'fc'), callId = newId('call');
        const pending = call.type === 'custom' ? { ...call, input: '' } : { ...call, arguments: '' };
        event('response.output_item.added', { output_index: 0, item: responseToolItem(itemId, callId, pending, 'in_progress') });
        if (call.type === 'custom') {
          if (call.input) event('response.custom_tool_call_input.delta', { item_id: itemId, output_index: 0, delta: call.input });
          event('response.custom_tool_call_input.done', { item_id: itemId, output_index: 0, input: call.input });
        } else {
          if (call.arguments) event('response.function_call_arguments.delta', { item_id: itemId, output_index: 0, delta: call.arguments });
          event('response.function_call_arguments.done', { item_id: itemId, output_index: 0, arguments: call.arguments });
        }
        finalItem = responseToolItem(itemId, callId, call);
        event('response.output_item.done', { output_index: 0, item: finalItem });
      } else {
        startTextItem();
        if (content.length > sent) { const delta = content.slice(sent); sent = content.length; event('response.output_text.delta', { item_id: outputItem.id, output_index: 0, content_index: 0, delta, logprobs: [] }); }
        event('response.output_text.done', { item_id: outputItem.id, output_index: 0, content_index: 0, text: content, logprobs: [] });
        event('response.content_part.done', { item_id: outputItem.id, output_index: 0, content_index: 0, part: { type: 'output_text', annotations: [], logprobs: [], text: content } });
        finalItem = messageItem(outputItem.id, content);
        event('response.output_item.done', { output_index: 0, item: finalItem });
      }
      event('response.completed', { response: responseObject({ responseId, model, createdAt, status: 'completed', output: [finalItem], usage: responsesUsage(built.prompt, content, reasoning), body }) });
    } catch (error) {
      const failed = responseObject({ responseId, model, createdAt, status: 'failed', output: [], usage: null, body, error: { code: error.code || 'server_error', message: error.message } });
      event('error', { code: error.code || 'server_error', message: error.message, param: null });
      event('response.failed', { response: failed });
    } finally { release(); }
  }, { chatId: selected.chatId });
});

app.post('/v1/completions', async c => {
  const body = await readJson(c);
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) return c.json(openaiError('`prompt` must be a non-empty string', 'invalid_request_error', null, 400, 'prompt').body, 400);
  const model = body.model || 'deepseek-chat';
  let selected;
  try { selected = await getSession({ chatId: body.chat_id, model, signal: c.req.raw.signal }); }
  catch (error) { return errorResponse(c, error); }
  const completionId = newId('cmpl');
  if (!body.stream) {
    const release = await acquire(selected.record);
    try {
      const result = await selected.record.session.chat({ prompt, signal: c.req.raw.signal });
      return c.json({ id: completionId, object: 'text_completion', created: unixNow(), model, choices: [{ text: result.message || '', index: 0, logprobs: null, finish_reason: 'stop' }], usage: usageFor(prompt, result.message || '', result.thoughts) });
    } catch (error) { return errorResponse(c, error); }
    finally { release(); }
  }
  return streamResponse(c, async ({ send, signal }) => {
    const release = await acquire(selected.record);
    try {
      for await (const upstream of selected.record.session.chatStream({ prompt, signal })) if (upstream.delta) send({ id: completionId, object: 'text_completion', created: unixNow(), model, choices: [{ text: upstream.delta, index: 0, logprobs: null, finish_reason: null }] });
      send({ id: completionId, object: 'text_completion', created: unixNow(), model, choices: [{ text: '', index: 0, logprobs: null, finish_reason: 'stop' }] });
    } finally { release(); }
  }, { chatId: selected.chatId, sendDoneMarker: true });
});

app.get('/v1/sessions/:id', c => {
  const sessionId = c.req.param('id');
  const record = sessions.get(sessionId);
  if (!record) return c.json(openaiError('Session not found', 'invalid_request_error', 'session_not_found', 404).body, 404);
  return c.json({ id: sessionId, object: 'session', created: Math.floor(record.createdAt / 1000), last_used: Math.floor(record.lastUsed / 1000), model: record.model, parent_message_id: record.session.parentMessageId, deepseek_session_id: record.session.id, last_tools: record.lastTools || [] });
});
app.delete('/v1/sessions/:id', c => {
  const sessionId = c.req.param('id');
  const deleted = sessions.delete(sessionId);
  for (const [responseId, chatId] of responseSessions) if (chatId === sessionId) responseSessions.delete(responseId);
  return c.json({ id: sessionId, object: 'session.deleted', deleted });
});
app.post('/v1/files/upload-url', async c => {
  const body = await readJson(c);
  if (typeof body?.url !== 'string') return c.json(openaiError('`url` must be a string', 'invalid_request_error', null, 400, 'url').body, 400);
  try {
    const fileId = await new DeepSeek({ auth: pickApiKey() }).uploadFile(body.url, c.req.raw.signal);
    if (!fileId) return c.json(openaiError('Unsupported or rejected file', 'invalid_request_error', 'unsupported_file', 400, 'url').body, 400);
    return c.json({ object: 'file', id: fileId, url: body.url });
  } catch (error) { return errorResponse(c, error); }
});
app.get('/chat/deepseek', async c => {
  const query = c.req.query('q');
  if (!query) return c.json({ status: 'error', message: 'Parameter "q" is required' }, 400);
  try {
    const selected = await getSession({ chatId: c.req.query('id') || null, model: 'deepseek-chat', signal: c.req.raw.signal });
    const release = await acquire(selected.record);
    try {
      const result = await selected.record.session.chat({ prompt: query, signal: c.req.raw.signal });
      return c.json({ status: 'success', user_query: query, ai_response: { data: { id: selected.record.session.id, message: result.message, thoughts: result.thoughts, message_id: result.message_id, parent_id: result.parent_id } }, chat_id: selected.chatId });
    } finally { release(); }
  } catch (error) { return c.json({ status: 'error', message: error.message }, error.status || 500); }
});
app.get('/chat/olabiba', async c => {
  const query = c.req.query('q');
  if (!query) return c.json({ status: 'error', message: 'Parameter "q" is required' }, 400);
  try {
    const module = await import('../olaba.js');
    return c.json({ status: 'success', user_query: query, ai_response: await module.getOlabibaResponse(query) });
  } catch (error) { return c.json({ status: 'error', message: `Olabiba provider unavailable: ${error.message}` }, 503); }
});

export function configureGatewayForTests({ createSession: factory, keys = ['test-key'] } = {}) {
  if (factory) sessionFactory = factory;
  apiKeys = keys;
  sessions.clear(); responseSessions.clear();
}
export function resetGatewayForTests() { sessions.clear(); responseSessions.clear(); }
export { app };
export default app;
export async function startServer({ port = Number(process.env.PORT || 3000), host = process.env.HOST || '0.0.0.0' } = {}) {
  if (isBun) {
    const server = Bun.serve({ port, hostname: host, fetch: app.fetch, idleTimeout: 255 });
    console.log(`AI gateway listening at http://${host}:${server.port}`);
    return server;
  }
  const { serve } = await import('@hono/node-server');
  const server = serve({ fetch: app.fetch, port, hostname: host });
  console.log(`AI gateway listening at http://${host}:${port}`);
  return server;
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) startServer().catch(error => { console.error(error); process.exitCode = 1; });
