// Spoort lege vlakken op: stukken pagina (hoger dan ~45% van het scherm) waar niets te zien is.
// Werkt op een screenshot van de hele pagina, dus kijkt naar wat een bezoeker echt ziet.
export async function zoekGaten(p, { drempel = 0.45 } = {}) {
  const vh = p.viewportSize().height;
  const buf = await p.screenshot({ fullPage: true, type: "png" });
  const ctx = await p.context().browser().newContext();
  const q = await ctx.newPage();
  const runs = await q.evaluate(async ({ b64, vh, drempel }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const w = Math.min(img.width, 640), sc = w / img.width, h = Math.round(img.height * sc);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, leeg = [];
    for (let y = 0; y < h; y++) {
      let mn = 765, mx = 0;
      for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4, s = d[i] + d[i + 1] + d[i + 2]; if (s < mn) mn = s; if (s > mx) mx = s; }
      leeg.push(mx - mn < 24);
    }
    const out = []; let start = -1;
    for (let y = 0; y <= h; y++) {
      if (y < h && leeg[y]) { if (start < 0) start = y; }
      else if (start >= 0) { const len = (y - start) / sc; if (len > vh * drempel) out.push([Math.round(start / sc), Math.round(len)]); start = -1; }
    }
    return out;
  }, { b64: buf.toString("base64"), vh, drempel });
  await ctx.close();
  return runs; // [[y, hoogte], ...]
}

// Zoals een bezoeker scrolt (mét beweging): per schermhoogte een screenshot, en meld schermen die grotendeels leeg zijn.
export async function zoekLegeSchermen(p, { drempel, wacht = 1000 } = {}) {
  const { width: w, height: vh } = p.viewportSize();
  // leeg = een aaneengesloten leeg stuk van meer dan 55% van het scherm én meer dan 480px (normale witruimte telt niet)
  drempel = drempel ?? Math.max(0.55, 480 / vh);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  const ctx = await p.context().browser().newContext();
  const q = await ctx.newPage();
  const out = [];
  for (let y = 0; y < H - vh * 0.5; y += Math.round(vh * 0.6)) {
    await p.evaluate((y) => window.scrollTo(0, y), y);
    await p.waitForTimeout(wacht);
    const buf = await p.screenshot({ type: "png" });
    const leegst = await q.evaluate(async ({ b64 }) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const w = Math.min(img.width, 480), sc = w / img.width, h = Math.round(img.height * sc);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let best = 0, run = 0;
      for (let y = 0; y < h; y++) {
        let mn = 765, mx = 0;
        for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4, s = d[i] + d[i + 1] + d[i + 2]; if (s < mn) mn = s; if (s > mx) mx = s; }
        run = mx - mn < 24 ? run + 1 : 0; if (run > best) best = run;
      }
      return best / h;
    }, { b64: buf.toString("base64") });
    if (leegst > drempel) out.push([y, Math.round(leegst * 100)]);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await ctx.close();
  return out; // [[scrollpositie, % leeg], ...]
}
