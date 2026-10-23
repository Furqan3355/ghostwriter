const $ = id => document.getElementById(id);
(async () => {
  const s = await chrome.storage.local.get(["provider","apiKey","model","memoryOn","demoMode","ghostSize","bgRemove","bgTol"]);
  $("provider").value = s.provider || "groq";
  $("apiKey").value = s.apiKey || "";
  $("model").value = s.model || "";
  $("memoryOn").checked = !!s.memoryOn;
  $("demoMode").checked = !!s.demoMode;
  $("ghostSize").value = s.ghostSize || "large";
  $("bgRemove").checked = s.bgRemove !== false;
  $("bgTol").value = s.bgTol || 45; $("bgTolV").textContent = $("bgTol").value;
  const g = await chrome.storage.local.get("ghostImgs"); renderThumbs(g.ghostImgs || []);
})();
async function save() {
  await chrome.storage.local.set({
    provider: $("provider").value, apiKey: $("apiKey").value.trim(), model: $("model").value.trim(),
    memoryOn: $("memoryOn").checked, demoMode: $("demoMode").checked, ghostSize: $("ghostSize").value, bgRemove: $("bgRemove").checked, bgTol: Number($("bgTol").value)
  });
  $("msg").textContent = "Saved.";
}
$("save").onclick = save;
$("test").onclick = async () => {
  await save();
  $("msg").textContent = "Testing...";
  chrome.runtime.sendMessage({ type: "ghost", text: "Hi team, I wanted to follow up on the", stage: 0, memory: "", now: "00:00" }, res => {
    $("msg").textContent = res?.text ? "OK: " + res.text : "Error: " + (res?.error || chrome.runtime.lastError?.message || "unknown");
  });
};

$("list").onclick = async () => {
  await save();
  $("msg").textContent = "Fetching models...";
  chrome.runtime.sendMessage({ type: "models" }, res => {
    if (!res || res.error) { $("msg").textContent = "Error: " + (res?.error || chrome.runtime.lastError?.message); return; }
    $("msg").textContent = "Model par click karo to use ho jayega:";
    $("models").innerHTML = "";
    res.ids.forEach(id => {
      const a = document.createElement("a");
      a.textContent = id; a.href = "#"; a.style.cssText = "display:block;color:#b9a6ff;margin:3px 0";
      a.onclick = async ev => { ev.preventDefault(); $("model").value = id; await save(); $("msg").textContent = "Model set: " + id; };
      $("models").appendChild(a);
    });
  });
};

function renderThumbs(list) {
  $("thumbs").innerHTML = "";
  list.forEach((src, i) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:80px;height:80px;background:#222;border-radius:6px;overflow:hidden";
    const im = document.createElement("img");
    im.src = src; im.style.cssText = "width:100%;height:100%;object-fit:contain";
    const x = document.createElement("span");
    x.textContent = "✕"; x.style.cssText = "position:absolute;top:2px;right:6px;cursor:pointer;color:#fff";
    x.onclick = async () => {
      const g = await chrome.storage.local.get("ghostImgs");
      const next = (g.ghostImgs || []).filter((_, k) => k !== i);
      await chrome.storage.local.set({ ghostImgs: next }); renderThumbs(next);
    };
    wrap.append(im, x); $("thumbs").appendChild(wrap);
  });
}
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const sc = Math.min(1, 800 / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      if ($("bgRemove").checked) removeBg(c, Number($("bgTol").value));
      URL.revokeObjectURL(url);
      let d = c.toDataURL("image/webp", 0.85);
      if (!d.startsWith("data:image/webp")) d = c.toDataURL("image/png");
      res(d);
    };
    im.onerror = rej; im.src = url;
  });
}
$("imgs").onchange = async e => {
  const g = await chrome.storage.local.get("ghostImgs");
  const out = [...(g.ghostImgs || [])];
  for (const f of e.target.files) { if (out.length >= 12) break; try { out.push(await shrink(f)); } catch (err) {} }
  await chrome.storage.local.set({ ghostImgs: out });
  renderThumbs(out); $("msg").textContent = out.length + " image(s) saved.";
  e.target.value = "";
};
$("clearImgs").onclick = async () => { await chrome.storage.local.set({ ghostImgs: [] }); renderThumbs([]); $("msg").textContent = "Images cleared."; };

$("bgTol").oninput = () => { $("bgTolV").textContent = $("bgTol").value; };
$("bgTol").onchange = save;
$("bgRemove").onchange = save;
