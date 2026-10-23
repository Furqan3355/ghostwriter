(() => {
  console.debug("[Ghostwriter] content script loaded on", location.hostname);
  const SKIP_RE = /(?<![a-z])(pass(word|wd)?|card|cvv|cvc|otp|ssn|iban|pin|secret|token|captcha)(?![a-z])/i;
  const pageStart = Date.now();
  let ghost = null, typeIv = null, timer = null, idleTimer = null, countTimer = null;
  let reqId = 0, escTimes = [], lastSnap = "", delSnap = "", delChars = 0;

  const alive = () => { try { return !!chrome.runtime && !!chrome.runtime.id; } catch { return false; } };

  function findEditable(t) {
    if (!(t instanceof Element)) return null;
    if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return t;
    return t.closest('[contenteditable]:not([contenteditable="false"])');
  }

  function isTarget(el) {
    if (!el) return false;
    if (el.tagName === "INPUT") {
      if (!["text", "search", ""].includes(el.type)) return false;
    } else if (el.tagName !== "TEXTAREA" && !el.isContentEditable) return false;
    const ac = el.getAttribute("autocomplete") || "";
    if (/^(cc-|one-time-code|current-password|new-password)/i.test(ac)) return false;
    const meta = [el.name, el.id, ac, el.placeholder, el.getAttribute("aria-label")].join(" ");
    return !SKIP_RE.test(meta);
  }

  async function allowed() {
    if (!alive()) return false;
    const s = await chrome.storage.local.get(["enabled", "sites"]);
    return s.enabled !== false && (s.sites || []).includes(location.hostname);
  }

  function textBeforeCaret(el) {
    if (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") {
      const sel = getSelection();
      if (!sel.rangeCount) return "";
      const r = sel.getRangeAt(0);
      if (!el.contains(r.endContainer)) return "";
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.endContainer, r.endOffset);
      return pre.toString().slice(-300);
    }
    if (el.selectionStart == null || el.selectionStart !== el.selectionEnd) return "";
    return el.value.slice(0, el.selectionStart).slice(-300);
  }

  function diffDeleted(a, b) {
    if (!a || a.length <= b.length) return "";
    let k = 0;
    while (k < b.length && a[k] === b[k]) k++;
    return a.slice(k, k + (a.length - b.length)).trim();
  }

  function fullText(el) {
    return (el.tagName === "TEXTAREA" || el.tagName === "INPUT") ? el.value : el.innerText;
  }

  function caretPos(el) {
    const s = getComputedStyle(el);
    if (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") {
      const sel = getSelection();
      if (sel.rangeCount) {
        const r = sel.getRangeAt(0).cloneRange();
        r.collapse(false);
        const rect = r.getClientRects()[0];
        if (rect && (rect.height || rect.width)) return { x: rect.right, y: rect.top, h: rect.height, s };
      }
      const b = el.getBoundingClientRect();
      return { x: b.left + 8, y: b.top + 8, h: parseFloat(s.lineHeight) || 18, s };
    }
    const b = el.getBoundingClientRect();
    const d = document.createElement("div");
    ["fontFamily","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","textTransform","wordSpacing",
     "paddingTop","paddingLeft","paddingRight","paddingBottom",
     "borderTopWidth","borderLeftWidth","borderRightWidth","borderBottomWidth",
     "borderTopStyle","borderLeftStyle","borderRightStyle","borderBottomStyle","boxSizing","tabSize"]
      .forEach(p => d.style[p] = s[p]);
    Object.assign(d.style, {
      position: "fixed", left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px",
      overflow: "hidden", visibility: "hidden", pointerEvents: "none",
      whiteSpace: el.tagName === "INPUT" ? "pre" : "pre-wrap", wordWrap: "break-word"
    });
    d.textContent = el.value.slice(0, el.selectionStart);
    const m = document.createElement("span");
    m.textContent = "\u200b";
    d.appendChild(m);
    document.body.appendChild(d);
    const mr = m.getBoundingClientRect();
    const lh = parseFloat(s.lineHeight) || (parseFloat(s.fontSize) * 1.25);
    const out = { x: mr.left - el.scrollLeft, y: mr.top - el.scrollTop, h: lh, s };
    d.remove();
    return out;
  }

  let atmo = null, atmoTimer = null;
  function setAtmosphere(stage) {
    if (stage < 1 || !alive()) return;
    const lv = [0, 0.15, 0.4, 0.65][stage];
    if (!atmo) {
      atmo = document.createElement("div");
      atmo.className = "gw-atmo";
      atmo.innerHTML = '<div class="gw-breath"></div>';
      document.documentElement.appendChild(atmo);
      atmo.offsetWidth;
    }
    atmo.style.setProperty("--gw-g", lv);
    atmo.style.setProperty("--gw-b", (1 - lv * 0.4).toFixed(2));
    atmo.style.setProperty("--gw-v", (lv * 0.9).toFixed(2));
    atmo.classList.add("on");
    clearTimeout(atmoTimer);
    atmoTimer = setTimeout(clearAtmosphere, 20000);
  }
  function clearAtmosphere() {
    clearTimeout(atmoTimer);
    if (!atmo) return;
    const a = atmo; atmo = null;
    a.classList.remove("on");
    setTimeout(() => a.remove(), 3200);
  }
  function showCaption(text) {
    document.querySelectorAll(".gw-caption").forEach(n => n.remove());
    const c = document.createElement("div");
    c.className = "gw-caption";
    c.textContent = text;
    document.documentElement.appendChild(c);
    c.offsetWidth;
    c.classList.add("on");
    setTimeout(() => c.classList.remove("on"), 6500);
    setTimeout(() => c.remove(), 9500);
  }
  function banishAll() {
    clearAtmosphere();
    document.querySelectorAll(".gw-caption,.gw-fog,.gw-floater,.gw-eyes,.gw-scrawl,.gw-fig").forEach(n => n.remove());
  }
  try {
    chrome.storage.onChanged.addListener(ch => { if (ch.enabled && ch.enabled.newValue === false) banishAll(); });
  } catch (e) {}


  // ---------- apparitions: screen par asli cheezein ----------
  let lastApp = 0;
  const GHOST_SVG = '<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg"><path d="M50 5C25 5 12 25 12 50L12 112L25 98L37 112L50 98L63 112L75 98L88 112L88 50C88 25 75 5 50 5Z" fill="rgba(238,238,252,0.9)"/><ellipse cx="38" cy="45" rx="6" ry="9" fill="#14141a"/><ellipse cx="62" cy="45" rx="6" ry="9" fill="#14141a"/><ellipse cx="50" cy="73" rx="6" ry="9" fill="#14141a"/></svg>';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function addTemp(el, ms) {
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  function fog() {
    const f = document.createElement("div");
    f.className = "gw-fog";
    f.innerHTML = "<i></i><i></i><i></i>";
    addTemp(f, 16000);
  }

  function floater() {
    if (reduced()) return;
    const f = document.createElement("div");
    f.className = "gw-floater";
    f.style.top = rnd(12, 65) + "vh";
    f.innerHTML = GHOST_SVG;
    addTemp(f, 17000);
  }

  function eyes() {
    const e = document.createElement("div");
    e.className = "gw-eyes";
    e.innerHTML = '<div class="gw-eye"><b></b></div><div class="gw-eye"><b></b></div>';
    const left = Math.random() < 0.5;
    e.style[left ? "left" : "right"] = rnd(2, 7) + "vw";
    e.style.top = rnd(18, 78) + "vh";
    document.documentElement.appendChild(e);
    e.offsetWidth;
    e.classList.add("on");
    const pupils = [...e.querySelectorAll("b")];
    const move = ev => {
      if (!e.isConnected) { removeEventListener("mousemove", move); return; }
      const r = e.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
      const a = Math.atan2(dy, dx);
      pupils.forEach(p => p.style.transform = `translate(${Math.cos(a) * 6}px, ${Math.sin(a) * 3}px)`);
    };
    addEventListener("mousemove", move);
    setTimeout(() => e.classList.remove("on"), 11000);
    setTimeout(() => e.remove(), 13500);
  }

  function scrawl(line) {
    const c = ctx();
    const fallbacks = [
      `it's ${c.now}.`,
      `you've been here ${c.minutes} minute${c.minutes === 1 ? "" : "s"}.`,
      "i like it when you type.",
      "keep going. i'm listening.",
      "don't stop now."
    ];
    const t = document.createElement("div");
    t.className = "gw-scrawl";
    t.textContent = line || fallbacks[Math.floor(Math.random() * fallbacks.length)];
    t.style.left = rnd(8, 55) + "vw";
    t.style.top = rnd(14, 70) + "vh";
    t.style.transform = `rotate(${rnd(-5, 5).toFixed(1)}deg)`;
    document.documentElement.appendChild(t);
    t.offsetWidth;
    t.classList.add("on");
    setTimeout(() => t.classList.remove("on"), 7500);
    setTimeout(() => t.remove(), 10500);
  }

  let imgCache = null, sizeSetting = "large";
  const SIZE_VH = { small: 18, medium: 30, large: 45, huge: 65 };
  async function loadImgs() {
    if (imgCache) return imgCache;
    const s = await chrome.storage.local.get(["ghostImgs", "ghostSize"]);
    imgCache = s.ghostImgs || [];
    sizeSetting = s.ghostSize || "large";
    return imgCache;
  }
  try { chrome.storage.onChanged.addListener(ch => { if (ch.ghostImgs || ch.ghostSize) imgCache = null; }); } catch (e) {}

  async function figure(mode, src) {
    await loadImgs();
    const w = document.createElement("div");
    w.className = "gw-fig gw-" + mode;
    w.style.setProperty("--gw-h", (SIZE_VH[sizeSetting] || 45) + "vh");
    if (src) {
      const im = document.createElement("img");
      im.src = src; im.alt = "";
      w.appendChild(im);
    } else w.innerHTML = GHOST_SVG;
    return w;
  }

  async function apparition(stage, line, skipText, force) {
    const now = Date.now();
    if (stage < 1 || now - lastApp < (force ? 4000 : 10000)) return;
    lastApp = now;
    fog();
    if (stage < 2) return;
    eyes();
    if (!skipText) scrawl(line);
    if (reduced()) return;
    const peeks = ["peekb", "peekl", "peekr"];
    const imgs = await loadImgs();
    const order = imgs.map((_, i) => i).sort(() => Math.random() - 0.5);
    const crowd = !force && stage >= 3;
    const modes = crowd ? ["float", "loom", "peekb", "peekl", "peekr"].sort(() => Math.random() - 0.5) : null;
    const n = crowd ? 2 + (Math.random() < 0.5 ? 1 : 0) : 1;
    for (let i = 0; i < n; i++) {
      const mode = crowd ? modes[i] : peeks[Math.floor(Math.random() * peeks.length)];
      const src = imgs.length ? imgs[order[i % order.length]] : null;
      setTimeout(async () => {
        if (!alive()) return;
        const f = await figure(mode, src);
        if (mode === "peekb") f.style.left = rnd(8, 70) + "vw";
        else if (mode === "peekl" || mode === "peekr") f.style.top = rnd(8, 40) + "vh";
        else if (mode === "float") f.style.top = rnd(4, 35) + "vh";
        else f.style.setProperty("--gw-x", rnd(30, 70) + "vw");
        addTemp(f, 19000);
      }, i * 1800);
    }
  }

  try {
    chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
      if (m && m.type === "summon") {
        allowed().then(ok => {
          if (!ok) { sendResponse({ ok: false }); return; }
          lastApp = 0; setAtmosphere(3); apparition(3, null);
          sendResponse({ ok: true });
        });
        return true;
      }
    });
  } catch (e) {}

  function hideGhost() {
    if (ghost) { ghost.remove(); ghost = null; }
    clearInterval(typeIv);
    clearTimeout(countTimer);
  }

  function showGhost(el, text, mode, stage) {
    hideGhost();
    setAtmosphere(stage);
    if (mode === "whisper" && stage >= 3) { apparition(stage, null, true); showCaption(text); return; }
    apparition(stage, mode === "continue" ? null : text, false, mode === "regret");
    const p = caretPos(el);
    const whisper = mode === "whisper" || mode === "regret";
    let x = p.x, y = p.y;
    if (whisper) {
      const b = el.getBoundingClientRect();
      x = Math.max(8, b.left + 10);
      y = p.y + p.h + 6;
      if (y > innerHeight - 30) y = p.y - p.h - 6;
    }
    if (x > innerWidth - 40 || y < 0 || y > innerHeight) return;
    ghost = document.createElement("span");
    ghost.className = "gw-ghost" + (whisper ? " gw-whisper" : "");
    Object.assign(ghost.style, {
      left: x + "px", top: y + "px",
      fontFamily: p.s.fontFamily, fontSize: p.s.fontSize, fontWeight: p.s.fontWeight,
      lineHeight: p.h + "px", maxWidth: Math.min(480, innerWidth - x - 16) + "px"
    });
    document.documentElement.appendChild(ghost);
    const g = ghost;
    const full = (whisper ? "\u2014 " : " ") + text;
    let i = 0;
    typeIv = setInterval(() => {
      if (ghost !== g) { clearInterval(typeIv); return; }
      g.textContent = full.slice(0, ++i);
      if (i >= full.length) clearInterval(typeIv);
    }, whisper ? 55 : 38);
    (async () => {
      try {
        const { shown = 0 } = await chrome.storage.local.get("shown");
        chrome.storage.local.set({ shown: shown + 1 });
      } catch (e) {}
    })();
  }

  async function currentStage() {
    const s = await chrome.storage.local.get(["shown", "demoMode"]);
    const step = s.demoMode ? 1 : 3;
    return Math.min(3, Math.floor((s.shown || 0) / step));
  }

  async function pickMemory() {
    const { memoryOn, memory = [] } = await chrome.storage.local.get(["memoryOn", "memory"]);
    return memoryOn && memory.length ? memory[Math.floor(Math.random() * memory.length)] : "";
  }

  function ctx() {
    const d = new Date(), h = d.getHours();
    return {
      now: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      late: h >= 23 || h < 5,
      host: location.hostname,
      title: (document.title || "").slice(0, 80),
      minutes: Math.max(1, Math.round((Date.now() - pageStart) / 60000))
    };
  }

  async function ask(el, mode, my, deleted) {
    try {
      if (!(await allowed())) { console.debug("[Ghostwriter] site not allowed / disabled"); return; }
      const text = textBeforeCaret(el);
      if (mode === "continue" && text.trim().length < 12) { console.debug("[Ghostwriter] text too short"); return; }
      if (mode === "whisper" && text.trim().length < 20) return;
      const stage = await currentStage();
      if (mode === "whisper" && stage < 2) return;
      if (mode === "regret" && stage < 1) return;
      const memory = stage === 3 && mode === "continue" ? await pickMemory() : "";
      console.debug("[Ghostwriter] asking", mode, "stage", stage);
      chrome.runtime.sendMessage({ type: "ghost", mode, text, stage, memory, deleted: deleted || "", ctx: ctx() }, res => {
        if (chrome.runtime.lastError) return;
        if (my !== reqId) return;
        if (res && res.error) {
          console.debug("[Ghostwriter]", res.error);
          if (mode === "regret" && deleted) showGhost(el, "you erased \u201c" + deleted.slice(0, 28) + "\u201d. i remember it.", mode, stage);
          return;
        }
        const ae = (el.getRootNode && el.getRootNode().activeElement) || document.activeElement;
        if (res && res.text && ae && (ae === el || el.contains(ae) || el.matches(":focus"))) showGhost(el, res.text, mode, stage);
      });
    } catch (err) { /* extension reload hua ho to chup */ }
  }

  document.addEventListener("input", e => {
    if (!alive()) return;
    hideGhost();
    clearTimeout(timer);
    clearTimeout(idleTimer);
    const raw = (e.composedPath && e.composedPath()[0]) || e.target;
    const el = findEditable(raw);
    if (!isTarget(el)) return;
    const isDel = !!(e.inputType && e.inputType.startsWith("delete"));
    const nowText = textBeforeCaret(el);
    if (isDel) { if (!delChars) delSnap = lastSnap; delChars++; } else { delChars = 0; delSnap = ""; }
    lastSnap = nowText;
    const my = ++reqId;

    timer = setTimeout(() => {
      if (isDel) {
        const deleted = diffDeleted(delSnap, nowText);
        delChars = 0; delSnap = "";
        if (deleted.length >= 3) ask(el, "regret", my, deleted.slice(0, 80));
        return;
      }
      ask(el, "continue", my);
    }, 700);

    // agar user ruk jaye to bhoot khud bolta hai
    idleTimer = setTimeout(() => ask(el, "whisper", my), 7000);
  }, true);

  document.addEventListener("keydown", e => {
    hideGhost();
    if (e.key === "Escape" && alive()) {
      banishAll();
      const t = Date.now();
      escTimes = escTimes.filter(x => t - x < 900);
      escTimes.push(t);
      if (escTimes.length >= 3) { chrome.storage.local.set({ enabled: false }); escTimes = []; }
    }
  }, true);

  document.addEventListener("scroll", hideGhost, true);

  document.addEventListener("focusout", async e => {
    hideGhost();
    clearAtmosphere();
    clearTimeout(idleTimer);
    try {
      const el = findEditable((e.composedPath && e.composedPath()[0]) || e.target);
      if (!isTarget(el) || !(await allowed())) return;
      const { memoryOn, memory = [] } = await chrome.storage.local.get(["memoryOn", "memory"]);
      if (!memoryOn) return;
      const line = fullText(el).split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 40 && s.length < 200).pop();
      if (line && !memory.includes(line)) chrome.storage.local.set({ memory: [...memory, line].slice(-20) });
    } catch (err) {}
  }, true);
})();
