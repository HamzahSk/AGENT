import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { LanguageTutor } from "../src/language-tutor.js";
import {
  OpenAICompatibleClient,
  chatCompletionsUrl,
} from "../src/openai-client.js";

test("builds an OpenAI-compatible chat completions URL", () => {
  assert.equal(
    chatCompletionsUrl("https://example.com/v1/"),
    "https://example.com/v1/chat/completions",
  );
  assert.equal(
    chatCompletionsUrl("https://example.com/chat/completions"),
    "https://example.com/chat/completions",
  );
});

test("sends model, messages, and bearer authentication", async (context) => {
  let received;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = {
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(body),
    };

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ choices: [{ message: { content: "Hello learner!" } }] }),
    );
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const { port } = server.address();
  const client = new OpenAICompatibleClient({
    apiKey: "test-key",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    model: "test-model",
  });

  const answer = await client.complete({
    messages: [{ role: "user", content: "Hello" }],
  });

  assert.equal(answer, "Hello learner!");
  assert.equal(received.url, "/v1/chat/completions");
  assert.equal(received.authorization, "Bearer test-key");
  assert.equal(received.body.model, "test-model");
  assert.equal(received.body.messages[0].content, "Hello");
});

test("supports an explicit OpenAI Responses API endpoint", async (context) => {
  let received;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = { url: request.url, body: JSON.parse(body) };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "Ready to learn!" }],
      }],
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const { port } = server.address();
  const client = new OpenAICompatibleClient({
    apiKey: "test-key",
    baseUrl: `http://127.0.0.1:${port}/v1/responses`,
    apiMode: "responses",
    model: "test-model",
  });
  const answer = await client.complete({
    messages: [
      { role: "system", content: "You are a tutor." },
      { role: "user", content: "Hello" },
    ],
  });

  assert.equal(answer, "Ready to learn!");
  assert.equal(received.url, "/v1/responses");
  assert.equal(received.body.instructions, "You are a tutor.");
  assert.equal(received.body.input[0].content[0].text, "Hello");
});

test("auto mode falls back to Responses when chat completions is unavailable", async (context) => {
  const paths = [];
  const server = createServer(async (request, response) => {
    paths.push(request.url);
    for await (const _chunk of request) {
      // Drain the request body before replying.
    }
    if (request.url.endsWith("/chat/completions")) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "route not found" } }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ output_text: "Fallback worked" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const { port } = server.address();
  const client = new OpenAICompatibleClient({
    apiKey: "test-key",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    model: "test-model",
  });
  const answer = await client.complete({
    messages: [{ role: "user", content: "Hello" }],
  });

  assert.equal(answer, "Fallback worked");
  assert.deepEqual(paths, ["/v1/chat/completions", "/v1/responses"]);
});

test("creates a lesson prompt for the selected language", async () => {
  let request;
  const tutor = new LanguageTutor({
    async complete(value) {
      request = value;
      return "Generated lesson";
    },
  });

  const result = await tutor.createLesson({
    targetLanguage: "Japanese",
    nativeLanguage: "Indonesian",
    level: "beginner",
    topic: "greetings",
  });

  assert.equal(result, "Generated lesson");
  assert.match(request.messages[0].content, /Japanese/);
  assert.match(request.messages[1].content, /greetings/);
});
