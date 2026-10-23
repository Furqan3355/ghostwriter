// Border se milte hue background rang ko transparent karta hai (flood fill). JPEG/JFIF ke liye.
function removeBg(c, tol) {
  const ctx = c.getContext("2d"), W = c.width, H = c.height;
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  // agar image pehle se transparent hai to haath mat lagao
  const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + (W - 1)) * 4];
  if (corners.some(i => d[i + 3] < 250)) return false;
  const counts = new Map();
  const add = (x, y) => {
    const i = (y * W + x) * 4, k = (d[i] >> 4) + "," + (d[i + 1] >> 4) + "," + (d[i + 2] >> 4);
    const e = counts.get(k) || { n: 0, r: d[i], g: d[i + 1], b: d[i + 2] };
    e.n++; counts.set(k, e);
  };
  for (let x = 0; x < W; x++) { add(x, 0); add(x, H - 1); }
  for (let y = 0; y < H; y++) { add(0, y); add(W - 1, y); }
  const ring = 2 * (W + H);
  const bgs = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 4).filter(e => e.n > ring * 0.04);
  if (!bgs.length) return false;
  const t2 = tol * tol;
  const near = i => {
    for (const b of bgs) {
      const dr = d[i] - b.r, dg = d[i + 1] - b.g, db = d[i + 2] - b.b;
      if (dr * dr + dg * dg + db * db <= t2) return true;
    }
    return false;
  };
  const seen = new Uint8Array(W * H), stack = [];
  const push = (x, y) => { const p = y * W + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (seen[p]) { out[p * 4 + 3] = 0; continue; }
    // kinare naram karo
    if ((x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (y > 0 && seen[p - W]) || (y < H - 1 && seen[p + W])) out[p * 4 + 3] = 140;
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return true;
}
if (typeof module !== "undefined") module.exports = { removeBg };
