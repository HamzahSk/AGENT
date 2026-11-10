import assert from "node:assert/strict";
import test from "node:test";
import { renderLearningComponent } from "../src/rich-components.js";

test("renders an offline interactive quiz with a readable fallback table", () => {
  const component = renderLearningComponent({
    type: "quiz",
    title: "Quick check",
    instructions: "Choose one answer.",
    expectsReply: true,
    replyPrompt: "Reply in WhatsApp.",
    items: [{
      question: "What does hola mean?",
      options: ["Hello", "Goodbye"],
      answer: "Hello",
      explanation: "Hola is a greeting.",
    }],
  });

  assert.match(component.html, /<!doctype html>/i);
  assert.match(component.html, /DATA\.expectsReply/);
  assert.doesNotMatch(component.html, /<input\b/i);
  assert.equal(component.table[1][0], "What does hola mean?");
  assert.equal(component.table[1][1], "Hello · Goodbye");
});

test("fill-in-the-blank activities do not use an embedded keyboard field", () => {
  const component = renderLearningComponent({
    type: "fill_blank",
    title: "Complete the sentence",
    expectsReply: true,
    replyPrompt: "Send your answer in WhatsApp.",
    items: [{ prompt: "I ___ happy.", answer: "am", hint: "to be" }],
  });

  assert.doesNotMatch(component.html, /<input\b/i);
  assert.match(component.html, /Cara menjawab/);
  assert.match(component.html, /Kirim jawabanmu melalui chat WhatsApp/);
});

test("escapes model content before embedding it in the HTML script", () => {
  const component = renderLearningComponent({
    type: "flashcards",
    title: "Safety",
    items: [{ word: "</script><script>alert(1)</script>", translation: "test" }],
  });

  assert.doesNotMatch(component.html, /<script>alert\(1\)<\/script>/);
  assert.match(component.html, /\\u003c\/script\\u003e/);
});
