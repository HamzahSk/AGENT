// openai-client.js — dual-mode: Codex Responses + Chat Completions
function normalizedBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("The API base URL cannot be empty.");
  return normalized;
}

export function chatCompletionsUrl(baseUrl) {
  const normalized = normalizedBaseUrl(baseUrl);
  if (normalized.endsWith("/chat/completions")) return normalized;
  if (normalized.endsWith("/responses")) {
    return `${normalized.slice(0, -"/responses".length)}/chat/completions`;
  }
  return `${normalized}/chat/completions`;
}

export function responsesUrl(baseUrl) {
  const normalized = normalizedBaseUrl(baseUrl);
  if (normalized.endsWith("/responses")) return normalized;
  if (normalized.endsWith("/chat/completions")) {
    return `${normalized.slice(0, -"/chat/completions".length)}/responses`;
  }
  return `${normalized}/responses`;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => part?.text ?? part?.content ?? "")
    .filter(Boolean)
    .join("");
}

function extractTextFromSSE(raw) {
  const deltas = [];
  let completedText = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta" && event.delta) {
        deltas.push(event.delta);
      } else if (event.type === "response.completed" && event.response) {
        completedText = extractResponseText(event.response);
      } else if (event.choices?.[0]?.delta?.content) {
        deltas.push(event.choices[0].delta.content);
      }
    } catch {
      // abaikan event keepalive / provider-specific
    }
  }
  return (deltas.join("") || completedText).trim();
}

export function extractResponseText(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.output_text === "string") return data.output_text.trim();

  const choiceText = contentText(data.choices?.[0]?.message?.content);
  if (choiceText) return choiceText.trim();

  const output = [];
  for (const item of data.output ?? []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if ((part?.type === "output_text" || part?.type === "text") && part.text) {
        output.push(part.text);
      }
    }
  }
  return output.join("").trim();
}

function apiError(status, rawBody) {
  let message = rawBody;
  try {
    const data = JSON.parse(rawBody);
    message = data?.error?.message ?? data?.message ?? rawBody;
  } catch {
    // pertahankan teks error mentah dari provider
  }
  const error = new Error(`AI API request failed (${status}): ${message || "Unknown error"}`);
  error.status = status;
  return error;
}

// --- Payload untuk Responses API (format Codex CLI) ---
function codexResponsesPayload(messages, model, parameters = {}) {
  const instructions = messages
    .filter((m) => m.role === "system")
    .map((m) => contentText(m.content))
    .filter(Boolean)
    .join("\n\n");

  const input = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: "message",
      role: m.role,
      content: [{
        type: m.role === "assistant" ? "output_text" : "input_text",
        text: contentText(m.content),
      }],
    }));

  const effort = parameters.effort || "medium";
  const rest = { ...parameters };
  delete rest.effort;

  const payload = {
    model,
    input,
    store: false,
    stream: true,
    include: ["reasoning.encrypted_content"],
    reasoning: { effort, summary: "auto" },
  };

  if (instructions) payload.instructions = instructions;

  if (rest.tools && rest.tools.length) {
    payload.tools = rest.tools;
    payload.tool_choice = "auto";
    payload.parallel_tool_calls = true;
  }

  Object.assign(payload, rest);
  return payload;
}

// --- Payload untuk Chat Completions API ---
function chatCompletionsPayload(messages, model, parameters = {}) {
  const rest = { ...parameters };
  delete rest.effort;
  delete rest.include;
  delete rest.reasoning;

  return {
    model,
    messages,
    stream: false,
    ...rest,
  };
}

export class OpenAICompatibleClient {
  constructor({
    apiKey,
    baseUrl,
    model,
    apiMode = "auto",
    timeoutMs = 60_000,
    fetchImpl = fetch,
  }) {
    if (!apiKey) throw new Error("Missing API key.");
    if (!model) throw new Error("An AI model name is required.");
    if (!["auto", "responses", "chat_completions"].includes(apiMode)) {
      throw new Error("apiMode must be auto, responses, or chat_completions.");
    }

    this.apiKey = apiKey;
    this.baseUrl = normalizedBaseUrl(baseUrl);
    this.model = model;
    this.apiMode = apiMode;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  preferredMode() {
    if (this.apiMode !== "auto") return this.apiMode;
    if (this.baseUrl.endsWith("/responses")) return "responses";
    if (this.baseUrl.endsWith("/chat/completions")) return "chat_completions";
    // Base URL umum mengikuti kontrak README: coba Chat Completions dulu,
    // lalu fallback ke Responses jika route tersebut memang tidak tersedia.
    return "chat_completions";
  }

  async request(mode, { messages, model, parameters }) {
    const isResponses = mode === "responses";
    const endpoint = isResponses ? responsesUrl(this.baseUrl) : chatCompletionsUrl(this.baseUrl);
    const body = isResponses
      ? codexResponsesPayload(messages, model, parameters)
      : chatCompletionsPayload(messages, model, parameters);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: isResponses ? "text/event-stream" : "application/json, text/event-stream",
          ...(isResponses
            ? {
                originator: "codex_cli_rs",
                "User-Agent": "codex_cli_rs/0.20.0 (Linux x86_64)",
              }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) throw apiError(response.status, rawBody);

      const contentType = response.headers.get("content-type") || "";
      let text = "";
      if (contentType.includes("text/event-stream") || rawBody.trimStart().startsWith("data:")) {
        text = extractTextFromSSE(rawBody);
      } else {
        try {
          text = extractResponseText(JSON.parse(rawBody));
        } catch {
          text = rawBody.trim();
        }
      }
      if (!text) throw new Error("The API response did not contain assistant text.");
      return text;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`AI API request timed out after ${this.timeoutMs} ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async complete({ messages, model = this.model, ...parameters }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("At least one message is required.");
    }

    const preferred = this.preferredMode();
    try {
      return await this.request(preferred, { messages, model, parameters });
    } catch (error) {
      const endpointMismatch = error?.status === 400
        && /(unsupported|unknown|not found|invalid).*(endpoint|route|chat|response|url|path)/i.test(error.message);
      const canFallback = this.apiMode === "auto"
        && ([404, 405, 501].includes(error?.status) || endpointMismatch);
      if (!canFallback) throw error;
      const fallback = preferred === "responses" ? "chat_completions" : "responses";
      return this.request(fallback, { messages, model, parameters });
    }
  }
}
