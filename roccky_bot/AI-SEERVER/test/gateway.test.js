import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app, configureGatewayForTests, startServer } from '../api/index.js';

function jsonRequest(path, body) {
  return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function sseEvents(response) {
  const text = await response.text();
  return text.split(/\r?\n\r?\n/).flatMap(block => {
    const event = block.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = block.split(/\r?\n/).find(line => line.startsWith('data:'))?.slice(5).trim();
    if (!data || data === '[DONE]') return data === '[DONE]' ? [{ event: 'done', data }] : [];
    return [{ event, data: JSON.parse(data) }];
  });
}
function mockFactory({ output = 'Hello world', chunks = ['Hello ', 'world'], prompts = [], onSignal } = {}) {
  return async () => ({
    id: 'deepseek-session',
    parentMessageId: null,
    async chat(options) {
      prompts.push(options.prompt);
      return { message: typeof output === 'function' ? output(options.prompt) : output, thoughts: '', message_id: 2, parent_id: 1, error: null };
    },
    async *chatStream(options) {
      prompts.push(options.prompt);
      onSignal?.(options.signal);
      for (const chunk of chunks) yield { delta: chunk };
      yield { done: true, message_id: 2, parent_id: 1 };
    },
  });
}

test('chat completions formats all roles and returns OpenAI-compatible non-stream output', async () => {
  const prompts = [];
  configureGatewayForTests({ createSession: mockFactory({ prompts }) });
  const response = await jsonRequest('/v1/chat/completions', {
    model: 'deepseek-chat',
    messages: [{ role: 'system', content: 'Be concise' }, { role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.object, 'chat.completion');
  assert.equal(body.choices[0].message.content, 'Hello world');
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.ok(body.usage.total_tokens > 0);
  assert.match(prompts[0], /\[SYSTEM\]\nBe concise/);
  assert.match(prompts[0], /\[USER\]\nHi/);
});

test('chat completions streams real deltas, finish reason, usage, and DONE', async () => {
  configureGatewayForTests({ createSession: mockFactory() });
  const response = await jsonRequest('/v1/chat/completions', {
    model: 'deepseek-chat', stream: true, stream_options: { include_usage: true }, messages: [{ role: 'user', content: 'Hi' }],
  });
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const events = await sseEvents(response);
  const chunks = events.filter(entry => entry.data?.object === 'chat.completion.chunk');
  assert.equal(chunks.flatMap(entry => entry.data.choices).map(choice => choice.delta?.content || '').join(''), 'Hello world');
  assert.equal(chunks.find(entry => entry.data.choices[0]?.finish_reason)?.data.choices[0].finish_reason, 'stop');
  assert.ok(chunks.find(entry => entry.data.usage)?.data.usage.total_tokens > 0);
  assert.equal(events.at(-1).data, '[DONE]');
});

test('chat completions emits function tool calls in stream and non-stream modes', async () => {
  const toolJson = '{"tool_call":{"name":"read_file","arguments":{"path":"a.js"}}}';
  configureGatewayForTests({ createSession: mockFactory({ output: toolJson, chunks: [toolJson.slice(0, 20), toolJson.slice(20)] }) });
  const request = { model: 'deepseek-chat', messages: [{ role: 'user', content: 'Read a.js' }], tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }] };
  const plain = await (await jsonRequest('/v1/chat/completions', request)).json();
  assert.equal(plain.choices[0].finish_reason, 'tool_calls');
  assert.equal(plain.choices[0].message.tool_calls[0].function.name, 'read_file');

  configureGatewayForTests({ createSession: mockFactory({ chunks: [toolJson.slice(0, 20), toolJson.slice(20)] }) });
  const streamed = await sseEvents(await jsonRequest('/v1/chat/completions', { ...request, stream: true }));
  const toolChunk = streamed.find(entry => entry.data?.choices?.[0]?.delta?.tool_calls);
  assert.equal(toolChunk.data.choices[0].delta.tool_calls[0].function.name, 'read_file');
  assert.equal(streamed.find(entry => entry.data?.choices?.[0]?.finish_reason)?.data.choices[0].finish_reason, 'tool_calls');
});

test('tool_choice none does not enable tool-call emulation', async () => {
  const toolJson = '{"tool_call":{"name":"read_file","arguments":{}}}';
  configureGatewayForTests({ createSession: mockFactory({ output: toolJson }) });
  const body = await (await jsonRequest('/v1/chat/completions', {
    messages: [{ role: 'user', content: 'Answer in text' }],
    tool_choice: 'none',
    tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }],
  })).json();
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.equal(body.choices[0].message.content, toolJson);
});

test('responses non-stream returns real message and function_call output items', async () => {
  configureGatewayForTests({ createSession: mockFactory({ output: 'Answer' }) });
  const text = await (await jsonRequest('/v1/responses', { model: 'deepseek-chat', input: 'Question' })).json();
  assert.equal(text.object, 'response');
  assert.equal(text.status, 'completed');
  assert.equal(text.output[0].type, 'message');
  assert.equal(text.output[0].content[0].type, 'output_text');
  assert.equal(text.output[0].content[0].text, 'Answer');

  const toolJson = '{"tool_call":{"name":"shell","arguments":{"cmd":"pwd"}}}';
  configureGatewayForTests({ createSession: mockFactory({ output: toolJson }) });
  const tool = await (await jsonRequest('/v1/responses', {
    model: 'deepseek-chat', input: 'Run pwd', tools: [{ type: 'function', name: 'shell', parameters: { type: 'object' } }],
  })).json();
  assert.equal(tool.output[0].type, 'function_call');
  assert.equal(tool.output[0].name, 'shell');
  assert.equal(tool.output[0].status, 'completed');
});

test('responses supports Codex namespace and custom tools', async () => {
  const customJson = '{"tool_call":{"namespace":"functions","name":"exec","input":"text(true);"}}';
  const namespace = {
    type: 'namespace', name: 'functions', description: '',
    tools: [{ type: 'custom', name: 'exec', description: 'Run code', format: { type: 'text' } }],
  };
  configureGatewayForTests({ createSession: mockFactory({ output: customJson }) });
  const plain = await (await jsonRequest('/v1/responses', { input: 'Use exec', tools: [namespace] })).json();
  assert.equal(plain.output[0].type, 'custom_tool_call');
  assert.equal(plain.output[0].namespace, 'functions');
  assert.equal(plain.output[0].name, 'exec');
  assert.equal(plain.output[0].input, 'text(true);');

  configureGatewayForTests({ createSession: mockFactory({ chunks: [customJson] }) });
  const streamed = await sseEvents(await jsonRequest('/v1/responses', { input: 'Use exec', tools: [namespace], stream: true }));
  assert.equal(streamed.find(entry => entry.data?.type === 'response.custom_tool_call_input.delta').data.delta, 'text(true);');
  assert.equal(streamed.find(entry => entry.data?.type === 'response.output_item.done').data.item.type, 'custom_tool_call');
});

test('responses accepts Codex web_search alongside namespaced tools', async () => {
  const prompts = [];
  configureGatewayForTests({ createSession: mockFactory({ output: 'searched answer', prompts }) });
  const response = await jsonRequest('/v1/responses', {
    input: 'Find something',
    tools: [
      { type: 'web_search' },
      { type: 'namespace', name: 'functions', description: '', tools: [{ type: 'custom', name: 'exec' }] },
    ],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).output[0].content[0].text, 'searched answer');
});

test('responses stream emits ordered lifecycle events and final response', async () => {
  configureGatewayForTests({ createSession: mockFactory({ chunks: ['A', 'B'] }) });
  const events = await sseEvents(await jsonRequest('/v1/responses', { model: 'deepseek-chat', input: 'Question', stream: true }));
  const types = events.map(entry => entry.data?.type).filter(Boolean);
  assert.deepEqual(types, [
    'response.created', 'response.in_progress', 'response.output_item.added', 'response.content_part.added',
    'response.output_text.delta', 'response.output_text.delta', 'response.output_text.done',
    'response.content_part.done', 'response.output_item.done', 'response.completed',
  ]);
  assert.deepEqual(events.filter(entry => entry.data?.type === 'response.output_text.delta').map(entry => entry.data.delta), ['A', 'B']);
  const completed = events.find(entry => entry.data?.type === 'response.completed').data.response;
  assert.equal(completed.output[0].content[0].text, 'AB');
  assert.equal(completed.status, 'completed');
  assert.ok(completed.usage.total_tokens > 0);
});

test('responses stream reports upstream failure through error and response.failed events', async () => {
  configureGatewayForTests({ createSession: async () => ({
    id: 'failure-session',
    async *chatStream() { throw Object.assign(new Error('provider broke'), { code: 'upstream_failure' }); },
  }) });
  const events = await sseEvents(await jsonRequest('/v1/responses', { input: 'Question', stream: true }));
  assert.equal(events.find(entry => entry.data?.type === 'error').data.code, 'upstream_failure');
  const failed = events.find(entry => entry.data?.type === 'response.failed').data.response;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.message, 'provider broke');
});

test('responses previous_response_id reuses the session and converts function outputs', async () => {
  const prompts = [];
  let factoryCalls = 0;
  const factory = mockFactory({ output: prompt => prompt.includes('TOOL RESULT') ? 'Finished' : 'First', prompts });
  configureGatewayForTests({ createSession: async options => { factoryCalls++; return factory(options); } });
  const first = await (await jsonRequest('/v1/responses', { input: 'Start' })).json();
  const second = await (await jsonRequest('/v1/responses', {
    previous_response_id: first.id,
    input: [{ type: 'function_call_output', call_id: 'call_1', output: 'tool data' }],
  })).json();
  assert.equal(factoryCalls, 1);
  assert.equal(second.output[0].content[0].text, 'Finished');
  assert.match(prompts[1], /\[TOOL RESULT call_id=call_1\]\ntool data/);
});

test('client stream cancellation aborts the provider work', async () => {
  let aborted = false;
  configureGatewayForTests({ createSession: async () => ({
    id: 'cancel-session',
    async *chatStream({ signal }) {
      yield { delta: 'first' };
      await new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
    },
  }) });
  const response = await jsonRequest('/v1/chat/completions', { stream: true, messages: [{ role: 'user', content: 'wait' }] });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(aborted, true);
});

test('concurrent streaming requests remain isolated and complete once', async () => {
  configureGatewayForTests({ createSession: mockFactory({ chunks: ['x', 'y', 'z'] }) });
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => jsonRequest('/v1/responses', { input: `request ${index}`, stream: true })));
  const batches = await Promise.all(responses.map(sseEvents));
  for (const events of batches) {
    assert.equal(events.filter(entry => entry.data?.type === 'response.completed').length, 1);
    assert.equal(events.filter(entry => entry.data?.type === 'response.output_text.delta').map(entry => entry.data.delta).join(''), 'xyz');
  }
});

test('the real HTTP server flushes the first delta before upstream completion', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  configureGatewayForTests({ createSession: async () => ({
    id: 'network-session',
    async *chatStream() {
      yield { delta: 'first' };
      await gate;
      yield { delta: 'second' };
      yield { done: true, message_id: 2, parent_id: 1 };
    },
  }) });
  const server = await startServer({ port: 0, host: '127.0.0.1' });
  try {
    if (!server.listening) await once(server, 'listening');
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'network test', stream: true }),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let beforeCompletion = '';
    while (!beforeCompletion.includes('response.output_text.delta')) {
      const read = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('first network delta was buffered')), 500)),
      ]);
      assert.equal(read.done, false);
      beforeCompletion += decoder.decode(read.value, { stream: true });
    }
    assert.match(beforeCompletion, /"delta":"first"/);
    assert.doesNotMatch(beforeCompletion, /response\.completed/);
    release();
    let rest = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
    }
    assert.match(rest, /"delta":"second"/);
    assert.match(rest, /response\.completed/);
  } finally {
    release?.();
    await new Promise(resolve => server.close(resolve));
  }
});
