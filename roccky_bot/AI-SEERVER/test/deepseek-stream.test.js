import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeek } from '../deepseek_apk.js';

function transportFor(chunks) {
  return {
    async post(url) {
      assert.match(url, /chat\/completion$/);
      return {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        data: (async function* () {
          for (const chunk of chunks) {
            if (chunk.wait) await chunk.wait;
            yield Buffer.from(chunk.data);
          }
        })(),
      };
    },
  };
}

function clientWithChunks(chunks) {
  const client = new DeepSeek({ auth: 'test', transport: transportFor(chunks), streamIdleTimeoutMs: 500 });
  client.generateSignature = async () => 'test-signature';
  return client;
}

test('forwards partial SSE chunks incrementally and deduplicates cumulative snapshots', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = 'data: {"v":{"response":{"fragments":[{"type":"RESPONSE","content":"Hel"}]}}}\n\n';
  const second = 'data: {"v":{"response":{"fragments":[{"type":"RESPONSE","content":"Hello"}]}}}\n\n';
  const third = 'data: {"choices":[{"delta":{"type":"text","content":"!"},"finish_reason":null}]}\n\n';
  const final = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"response_message_id":12,"request_message_id":11}\n\n';
  const client = clientWithChunks([
    { data: first.slice(0, 17) },
    { data: first.slice(17) },
    { data: second, wait: gate },
    { data: third },
    { data: final },
  ]);

  const iterator = client.chatCompletionsStream({ prompt: 'hello', chat_session_id: 's1' });
  const firstEvent = await iterator.next();
  assert.deepEqual(firstEvent.value, { delta: 'Hel' });
  release();
  const events = [firstEvent.value];
  for await (const event of { [Symbol.asyncIterator]: () => iterator }) events.push(event);
  assert.equal(events.filter(event => event.delta).map(event => event.delta).join(''), 'Hello!');
  assert.deepEqual(events.at(-1), { done: true, message_id: 12, parent_id: 11 });
});

test('accepts one data event per line when blank SSE separators are absent', async () => {
  const client = clientWithChunks([{ data:
    'data: {"choices":[{"delta":{"type":"text","content":"A"},"finish_reason":null}]}\n' +
    'data: {"choices":[{"delta":{"type":"text","content":"B"},"finish_reason":null}]}\n' +
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'
  }]);
  const result = await client.chatCompletions({ prompt: 'hello', chat_session_id: 's1' });
  assert.equal(result.message, 'AB');
});

test('rejects a stream that ends without a terminal event', async () => {
  const client = clientWithChunks([{ data: 'data: {"choices":[{"delta":{"type":"text","content":"partial"}}]}\n\n' }]);
  await assert.rejects(async () => {
    for await (const event of client.chatCompletionsStream({ prompt: 'hello', chat_session_id: 's1' })) void event;
  }, error => error.code === 'UPSTREAM_STREAM_TRUNCATED');
});

test('rejects malformed upstream SSE rather than silently dropping it', async () => {
  const client = clientWithChunks([{ data: 'data: {broken json}\n\n' }]);
  await assert.rejects(async () => {
    for await (const event of client.chatCompletionsStream({ prompt: 'hello', chat_session_id: 's1' })) void event;
  }, error => error.code === 'UPSTREAM_STREAM_CORRUPTED');
});

test('aborts an upstream stream after the configured idle timeout', async () => {
  const transport = {
    async post() {
      return { status: 200, data: (async function* () {
        yield Buffer.from('data: {"choices":[{"delta":{"type":"text","content":"first"}}]}\n\n');
        await new Promise(() => {});
      })() };
    },
  };
  const client = new DeepSeek({ auth: 'test', transport, streamIdleTimeoutMs: 20 });
  client.generateSignature = async () => 'test-signature';
  await assert.rejects(async () => {
    for await (const event of client.chatCompletionsStream({ prompt: 'hello', chat_session_id: 's1' })) void event;
  }, error => error.code === 'UPSTREAM_IDLE_TIMEOUT');
});
