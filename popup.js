const $ = id => document.getElementById(id);
let host = "";

async function refresh() {
  const s = await chrome.storage.local.get(["enabled", "sites"]);
  $("enabled").checked = s.enabled !== false;
  $("demo").checked = !!(await chrome.storage.local.get("demoMode")).demoMode;
  const on = host && (s.sites || []).includes(host);
  $("haunt").textContent = on ? "Banish from this site" : "Haunt this site";
  $("host").textContent = host ? (on ? "👻 haunting: " + host : "not haunted: " + host) : "This page can't be haunted";
  $("haunt").disabled = !host;
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch {}
  refresh();
})();

$("enabled").onchange = e => chrome.storage.local.set({ enabled: e.target.checked });
$("haunt").onclick = async () => {
  const { sites = [] } = await chrome.storage.local.get("sites");
  const next = sites.includes(host) ? sites.filter(x => x !== host) : [...sites, host];
  await chrome.storage.local.set({ sites: next, enabled: true });
  refresh();
  $("status").textContent = next.includes(host) ? "Haunted. Page par type karo." : "Banished.";
};
$("reset").onclick = async () => { await chrome.storage.local.set({ shown: 0 }); $("status").textContent = "Stage reset."; };
$("clear").onclick = async () => { await chrome.storage.local.set({ memory: [] }); $("status").textContent = "Memories cleared."; };
$("opts").onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

$("demo").onchange = e => chrome.storage.local.set({ demoMode: e.target.checked });

async function showStage() {
  const s = await chrome.storage.local.get(["shown", "demoMode"]);
  const step = s.demoMode ? 1 : 3;
  $("stage").textContent = "Current stage: " + Math.min(3, Math.floor((s.shown || 0) / step)) + " (shown " + (s.shown || 0) + ")";
}
showStage();
$("jump").onclick = async () => { await chrome.storage.local.set({ shown: 9, enabled: true }); $("status").textContent = "Stage 3. Ab textbox mein likho."; showStage(); };
$("reset").addEventListener("click", showStage);
$("demo").addEventListener("change", showStage);

$("summon").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "summon" }, res => {
    if (chrome.runtime.lastError) { $("status").textContent = "Tab refresh karo (Ctrl+Shift+R) phir try karo."; return; }
    $("status").textContent = res && res.ok ? "Summoned. Screen dekho..." : "Pehle 'Haunt this site' dabao.";
  });
};
