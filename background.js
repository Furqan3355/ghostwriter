const DEFAULT_MODEL = { groq: "llama-3.3-70b-versatile", gemini: "gemini-2.0-flash" };
const BASE = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai"
};
const SAFETY = " You are a quiet, gentle ghost, never gory, never threatening, never violent, never naming real people. Uncanny and melancholy, not scary. Use only the facts given. Output only the ghost's words, no quotes, no preamble.";

function facts(ctx) {
  return `FACTS: time is ${ctx.now}${ctx.late ? " (deep in the night)" : ""}; site is ${ctx.host}; page title is "${ctx.title}"; the writer has been on this page for ${ctx.minutes} minute(s).`;
}

function buildPrompt(mode, stage, memory, ctx, deleted) {
  if (mode === "whisper") {
    return `You are a ghost living inside this textbox, watching the writer type. Speak ONE short eerie sentence (max 14 words) directly to them, in second person, using one real detail from the FACTS or from the text they wrote. It is not a continuation of their text. ${facts(ctx)}`;
  }
  if (mode === "regret") {
    return `The writer just deleted this text: "${deleted}". You remember it. Whisper ONE short wistful sentence (max 14 words) about what they erased, as if you miss it. Second person.`;
  }
  switch (stage) {
    case 0:
      return "You are an autocomplete. Continue the user's text naturally in their voice with 6-12 words. Output only the continuation.";
    case 1:
      return "Continue the user's text in their voice in 8-14 words, but with one detail slightly off or wistful, as if something is watching.";
    case 2:
      return `Finish the user's thought in their voice in 12-20 words, as if you knew what they were about to say before they thought it, then add one small unsettling specific detail. ${facts(ctx)}`;
    default:
      return memory
        ? `Finish the user's thought in 15-25 words, then quietly echo this sentence the user wrote earlier: "${memory}". Subtle, unsettling, intimate. ${facts(ctx)}`
        : `Finish the user's thought in 15-25 words, then quietly weave in one real detail from the FACTS (the exact time, how long they have been here, or the page title) as if you have been waiting. Subtle, unsettling, intimate. ${facts(ctx)}`;
  }
}

async function getConfig() {
  const cfg = await chrome.storage.local.get(["apiKey", "provider", "model", "autoModel"]);
  const provider = cfg.provider || "groq";
  if (!cfg.apiKey) throw new Error("No API key set (open Ghostwriter options)");
  return { ...cfg, provider };
}

async function listModels(provider, apiKey) {
  const r = await fetch(BASE[provider] + "/models", { headers: { Authorization: "Bearer " + apiKey } });
  if (!r.ok) throw new Error("Models API " + r.status);
  const j = await r.json();
  return (j.data || []).map(m => String(m.id).replace(/^models\//, ""));
}

function pickChatModel(ids) {
  const bad = /whisper|tts|guard|embed|orpheus|compound|image|vision|audio|moderation|safeguard|oss/i;
  const ok = ids.filter(id => !bad.test(id));
  const prefs = [/llama-3\.3-70b/, /llama-3\.1-8b/, /llama/, /gemini-.*flash/, /gemma/, /qwen/];
  for (const p of prefs) { const f = ok.find(id => p.test(id)); if (f) return f; }
  return ok[0] || ids[0];
}

async function callChat(provider, apiKey, model, system, text) {
  const r = await fetch(BASE[provider] + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model, max_tokens: 80, temperature: 0.95,
      messages: [{ role: "system", content: system }, { role: "user", content: text || "(the textbox is quiet)" }]
    })
  });
  if (!r.ok) {
    const body = await r.text();
    const e = new Error("API " + r.status + " " + body.slice(0, 200));
    e.notFound = r.status === 404 || /model_not_found|not found/i.test(body);
    throw e;
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || "").trim().replace(/^["'“]+|["'”]+$/g, "").replace(/\s+/g, " ");
}

async function askGhost(msg) {
  const cfg = await getConfig();
  const system = buildPrompt(msg.mode || "continue", msg.stage, msg.memory, msg.ctx || {}, msg.deleted || "") + SAFETY;
  const model = cfg.model || cfg.autoModel || DEFAULT_MODEL[cfg.provider];
  try {
    return await callChat(cfg.provider, cfg.apiKey, model, system, msg.text);
  } catch (e) {
    if (!e.notFound) throw e;
    const ids = await listModels(cfg.provider, cfg.apiKey);
    const picked = pickChatModel(ids);
    if (!picked || picked === model) throw e;
    await chrome.storage.local.set({ autoModel: picked });
    return await callChat(cfg.provider, cfg.apiKey, picked, system, msg.text);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ghost") {
    askGhost(msg).then(text => sendResponse({ text })).catch(e => sendResponse({ error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "models") {
    getConfig().then(c => listModels(c.provider, c.apiKey))
      .then(ids => sendResponse({ ids })).catch(e => sendResponse({ error: String(e.message || e) }));
    return true;
  }
});
