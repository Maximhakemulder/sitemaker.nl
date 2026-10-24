/* Sitemaker HQ in 3D: het hele gebouw (hoofdkantoor) en één verdieping per afdeling (gebaseerd op TrueSafe HQ).
   Eén WebGL-renderer voor het gebouw en één gedeelde voor de afdelingsverdieping. */
(function () {
  if (!window.THREE || !window.SM_ORG) return;
  const T = THREE, ORG = window.SM_ORG;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dark = () => (matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light") || document.documentElement.dataset.theme === "dark";
  const PALETTE = [0x1C0747, 0xFF5757, 0x0CC0DF, 0x6C4CF1, 0xF5A623, 0x22C3B5, 0x2F8A5B, 0xD94F8A];
  const hex = (h) => parseInt(String(h).replace("#", ""), 16);

  const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.7, metalness: o.m ?? 0, emissive: o.e || 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.t ?? 1 });
  function box(w, h, d, mat, x, y, z, parent, shadow = true) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg = 14) { const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function sph(r, mat, x, y, z, parent) { const m = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }

  function mats() {
    const d = dark();
    return {
      slab: M(d ? 0x1a2940 : 0xF7F6F2, { r: 0.9 }), edge: M(0x1C0747, { r: 0.6 }), wall: M(d ? 0x22324a : 0xFFFFFF, { r: 0.8 }),
      glass: M(d ? 0x6f93c4 : 0xBFD8F0, { r: 0.1, m: 0.1, t: d ? 0.16 : 0.24 }), wood: M(d ? 0x8a6646 : 0xC9A27A, { r: 0.6 }), woodDark: M(d ? 0x5e4430 : 0x9c7651, { r: 0.6 }),
      ink: M(0x1d232c, { r: 0.5 }), skin: M(0xE8B996, { r: 0.8 }), pants: M(0x26303d, { r: 0.8 }), green: M(0x559B60, { r: 0.8 }), white: M(d ? 0xd8dde6 : 0xFFFFFF, { r: 0.6 }),
      screenOn: M(0x9fd4ff, { r: 0.3, e: 0x6fbcff, ei: 0.9 }), screenOff: M(0x2a3442, { r: 0.3 }), teal: M(0x0CC0DF, { r: 0.35, e: 0x0CC0DF, ei: d ? 0.9 : 0.35 }),
      navy: M(0x1C0747, { r: 0.55 }), street: M(d ? 0x101a2a : 0xDAD6CD, { r: 0.95 }), grass: M(d ? 0x1d3a2a : 0xB9D3A6, { r: 0.95 }),
    };
  }

  /* ---- poppetje (zelfde stijl als het B2B-kantoor) ---- */
  function figure(p, MAT) {
    const color = PALETTE[(p.color ?? 1) % PALETTE.length], look = p.look || { hair: 0x2b1d14, acc: "none" };
    const body = M(color, { r: 0.6 }), hairM = M(look.hair, { r: 0.9 });
    const g = new T.Group();
    const hip = new T.Group(); hip.position.y = 0.75; g.add(hip);
    const legL = new T.Group(); legL.position.set(-0.12, 0, 0); hip.add(legL); box(0.16, 0.72, 0.18, MAT.pants, 0, -0.36, 0, legL);
    const legR = new T.Group(); legR.position.set(0.12, 0, 0); hip.add(legR); box(0.16, 0.72, 0.18, MAT.pants, 0, -0.36, 0, legR);
    cyl(0.27, 0.24, 0.62, body, 0, 1.08, 0, g); sph(0.27, body, 0, 1.38, 0, g);
    const armL = new T.Group(); armL.position.set(-0.33, 1.33, 0); g.add(armL); box(0.13, 0.55, 0.15, body, 0, -0.26, 0, armL);
    const armR = new T.Group(); armR.position.set(0.33, 1.33, 0); g.add(armR); box(0.13, 0.55, 0.15, body, 0, -0.26, 0, armR);
    const head = sph(0.25, MAT.skin, 0, 1.82, 0, g);
    const hair = new T.Mesh(new T.SphereGeometry(0.265, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM); hair.position.set(0, 1.85, -0.01); g.add(hair);
    [-0.09, 0.09].forEach((x) => sph(0.035, MAT.ink, x, 1.84, 0.23, g));
    const smile = new T.Mesh(new T.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), MAT.ink); smile.position.set(0, 1.75, 0.235); smile.rotation.z = Math.PI; g.add(smile);
    if (look.acc === "glasses") { [-0.09, 0.09].forEach((x) => { const r = new T.Mesh(new T.TorusGeometry(0.06, 0.012, 6, 16), MAT.ink); r.position.set(x, 1.84, 0.24); g.add(r); }); }
    if (look.acc === "headset") { const band = new T.Mesh(new T.TorusGeometry(0.27, 0.022, 6, 20, Math.PI), MAT.ink); band.position.set(0, 1.84, 0); g.add(band); sph(0.06, MAT.ink, -0.27, 1.82, 0, g); sph(0.06, MAT.ink, 0.27, 1.82, 0, g); }
    if (look.acc === "bun") sph(0.12, hairM, 0, 2.08, -0.08, g);
    if (look.acc === "cap") { const cap = new T.Mesh(new T.SphereGeometry(0.275, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), MAT.navy); cap.position.set(0, 1.86, 0); g.add(cap); box(0.3, 0.03, 0.2, MAT.navy, 0, 1.9, 0.24, g); }
    return { g, legL, legR, armL, armR, head };
  }

  /* ---- profielfoto's voor alle medewerkers ---- */
  let pr = null;
  function portraits() {
    try {
      const MAT = mats();
      if (!pr) { pr = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); pr.setSize(192, 192, false); pr.setPixelRatio(1); }
      const out = {};
      ORG.forEach((d) => d.people.forEach((p) => {
        const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.9)); const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(2, 3, 4); sc.add(dl);
        const f = figure(p, MAT); f.g.rotation.y = -0.35; sc.add(f.g);
        const c = new T.PerspectiveCamera(30, 1, 0.1, 20); c.position.set(0.35, 1.78, 1.75); c.lookAt(0, 1.7, 0);
        pr.setClearColor(PALETTE[(p.color ?? 1) % PALETTE.length], 0.16); pr.render(sc, c);
        out[p.key] = pr.domElement.toDataURL("image/png");
        sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }));
      // de B2B-kantoorscène maakt ook portretten; die blijven voorgaan
      window.HQ_portraits = Object.assign(out, window.HQ_portraits || {});
      window.dispatchEvent(new Event("hq-portraits"));
    } catch (e) {}
  }

  /* ---- live-status uit het dashboard ---- */
  function isLive(dept) { return dept.status === "live"; }
  function personBusy(key) {
    if (key === "jij") return true;
    const t = window.SM_TEAM; return !!(t && t.busy && t.busy[key]);
  }

  /* ---- één verdieping opbouwen (gebruikt door gebouw én afdelingspagina) ---- */
  const FW = 13, FD = 5.2, FH = 2.5;
  function buildFloor(dept, MAT, parent, y, opts = {}) {
    const g = new T.Group(); g.position.y = y; parent.add(g);
    const accent = M(hex(dept.color), { r: 0.45 });
    box(FW + 0.3, 0.22, FD + 0.3, MAT.edge, 0, -0.11, 0, g, false);
    box(FW, 0.06, FD, MAT.slab, 0, 0.03, 0, g, false);
    box(FW + 0.32, 0.08, 0.06, accent, 0, -0.02, FD / 2 + 0.16, g, false); // kleurstrook aan de voorkant
    box(FW, FH - 0.25, 0.14, MAT.wall, 0, (FH - 0.25) / 2, -FD / 2 + 0.07, g); // achterwand
    box(0.12, FH - 0.25, FD, MAT.glass, -FW / 2 + 0.06, (FH - 0.25) / 2, 0, g, false);
    box(0.12, FH - 0.25, FD, MAT.glass, FW / 2 - 0.06, (FH - 0.25) / 2, 0, g, false);
    // naambord van de afdeling op de achterwand
    box(3.2, 0.42, 0.04, accent, -FW / 2 + 2.0, FH - 0.75, -FD / 2 + 0.16, g, false);
    // planten
    cyl(0.22, 0.18, 0.42, MAT.white, FW / 2 - 0.6, 0.24, -FD / 2 + 0.6, g); sph(0.38, MAT.green, FW / 2 - 0.6, 0.8, -FD / 2 + 0.6, g);
    const people = [], screens = [];
    const list = dept.people;
    const n = Math.max(1, list.length), span = FW - 2.4, step = Math.min(2.6, span / n);
    const x0 = -((n - 1) * step) / 2;
    list.forEach((p, i) => {
      const x = x0 + i * step, dz = -0.55;
      box(1.8, 0.1, 0.85, MAT.wood, x, 0.86, dz, g);
      [[-0.8, -0.32], [0.8, -0.32], [-0.8, 0.32], [0.8, 0.32]].forEach(([a, b]) => box(0.07, 0.82, 0.07, MAT.woodDark, x + a, 0.43, dz + b, g));
      box(0.86, 0.52, 0.05, MAT.ink, x, 1.24, dz - 0.25, g);
      const sc = box(0.78, 0.44, 0.02, MAT.screenOff, x, 1.24, dz - 0.22, g); screens.push({ key: p.key, mesh: sc });
      box(0.08, 0.26, 0.08, MAT.ink, x, 0.98, dz - 0.25, g);
      cyl(0.28, 0.28, 0.08, MAT.navy, x, 0.52, dz + 0.95, g); cyl(0.04, 0.04, 0.46, MAT.ink, x, 0.27, dz + 0.95, g);
      const f = figure(p, MAT); f.g.position.set(x, 0.05, dz + 0.85); f.g.rotation.y = Math.PI; g.add(f.g);
      people.push({ ...f, key: p.key, name: p.person, phase: Math.random() * 6, live: isLive(dept), dept, base: f.g.position.clone() });
    });
    // whiteboard in afdelingskleur
    box(1.6, 0.9, 0.04, MAT.white, FW / 2 - 2.2, 1.35, -FD / 2 + 0.16, g, false);
    box(1.2, 0.06, 0.02, accent, FW / 2 - 2.2, 1.55, -FD / 2 + 0.19, g, false);
    box(0.8, 0.06, 0.02, accent, FW / 2 - 2.4, 1.38, -FD / 2 + 0.19, g, false);
    return { g, people, screens, accent };
  }

  function makeSign() {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 256; const x = c.getContext("2d");
    const tex = new T.CanvasTexture(c);
    const draw = (img) => {
      const grd = x.createLinearGradient(0, 0, 1024, 0); grd.addColorStop(0, "#1C0747"); grd.addColorStop(1, "#2A1263"); x.fillStyle = grd; x.fillRect(0, 0, 1024, 256);
      if (img) { const h = 150, w = img.width * h / img.height; x.drawImage(img, 60, (256 - h) / 2, w, h); }
      else { x.fillStyle = "#fff"; x.font = "800 110px Archivo, Arial"; x.textBaseline = "middle"; x.fillText("sitemaker", 70, 128); }
      x.fillStyle = "#0CC0DF"; x.font = "800 64px Archivo, Arial"; x.textAlign = "right"; x.textBaseline = "middle"; x.fillText("HQ", 980, 132); x.textAlign = "left";
      x.fillStyle = "#FF5757"; x.fillRect(0, 246, 1024, 10); tex.needsUpdate = true;
    };
    draw(null); const im = new Image(); im.onload = () => draw(im); im.src = "/assets/brand/logo-wit.png";
    return new T.Mesh(new T.PlaneGeometry(8, 2), new T.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: dark() ? 0.55 : 0.2, roughness: 0.5 }));
  }

  /* ---- gemeenschappelijke scène-helper ---- */
  function makeView(container, kind) {
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const stage = document.createElement("div"); stage.className = "stage3d"; stage.appendChild(renderer.domElement);
    const overlay = document.createElement("div"); overlay.className = "ov3d";
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
    const hemi = new T.HemisphereLight(0xffffff, 0x8899aa, 0.75); scene.add(hemi);
    const sun = new T.DirectionalLight(0xffffff, 0.85); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 }); sun.shadow.bias = -0.0006; scene.add(sun); scene.add(sun.target);
    const v = { kind, container, renderer, stage, overlay, scene, cam, hemi, sun, world: new T.Group(), people: [], screens: [], labels: [], floors: [], yaw: 0, targetYaw: 0, dragging: false, lastX: 0, autoT: 0, visible: true, center: new T.Vector3(), height: 10, width: 10 };
    scene.add(v.world);
    stage.addEventListener("pointerdown", (e) => { v.dragging = true; v.lastX = e.clientX; v.moved = 0; try { stage.setPointerCapture(e.pointerId); } catch (x) {} });
    stage.addEventListener("pointermove", (e) => { if (v.dragging) { const dx = e.clientX - v.lastX; v.moved += Math.abs(dx); v.targetYaw = Math.max(-0.9, Math.min(0.9, v.targetYaw - dx * 0.006)); v.lastX = e.clientX; v.autoT = performance.now(); } else hover(v, e); });
    stage.addEventListener("pointerup", (e) => { v.dragging = false; if ((v.moved || 0) < 5) click(v, e); });
    stage.addEventListener("pointerleave", () => { if (v.hoverFloor) { v.hoverFloor = null; highlight(v); } });
    v.ro = new ResizeObserver(() => fit(v));
    v.io = new IntersectionObserver((e) => { v.visible = e[0].isIntersecting; });
    return v;
  }
  function clearView(v) {
    v.scene.remove(v.world); v.world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    v.world = new T.Group(); v.scene.add(v.world); v.overlay.innerHTML = ""; v.people = []; v.screens = []; v.labels = []; v.floors = []; v.agents = null; v.rooms = null; v.pong = null; v.ball = null;
  }
  function fit(v) {
    const w = v.container.clientWidth, h = v.container.clientHeight; if (!w || !h) return;
    v.renderer.setSize(w, h, false);
    const aspect = w / h;
    let vs = Math.max(v.height * 0.56, (v.width * 0.6) / aspect);
    v.cam.left = -vs * aspect; v.cam.right = vs * aspect; v.cam.top = vs; v.cam.bottom = -vs; v.cam.updateProjectionMatrix();
  }
  function placeCam(v) {
    const r = 60, pitch = v.kind === "building" ? 0.32 : 0.62;
    v.cam.position.set(v.center.x + Math.sin(v.yaw) * r * Math.cos(pitch), v.center.y + r * Math.sin(pitch), v.center.z + Math.cos(v.yaw) * r * Math.cos(pitch));
    v.cam.lookAt(v.center);
    v.sun.position.set(v.center.x + 18, v.center.y + 30, v.center.z + 22); v.sun.target.position.copy(v.center);
  }
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function pick(v, e) {
    if (!v.floors.length) return null;
    const r = v.stage.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, v.cam);
    const hit = ray.intersectObjects(v.floors.map((f) => f.g), true)[0];
    if (!hit) return null;
    let o = hit.object; while (o && !o.userData.dept) o = o.parent;
    return o ? o.userData.dept : null;
  }
  function hover(v, e) { if (v.kind !== "building") return; const d = pick(v, e); if (d !== v.hoverFloor) { v.hoverFloor = d; highlight(v); v.stage.style.cursor = d ? "pointer" : "grab"; } }
  function highlight(v) { v.floors.forEach((f) => { f.accent.emissive.setHex(f.dept.key === v.hoverFloor ? hex(f.dept.color) : 0x000000); f.accent.emissiveIntensity = 0.6; f.label.classList.toggle("hot", f.dept.key === v.hoverFloor); }); }
  function click(v, e) { if (v.kind !== "building") return; const d = pick(v, e); if (d) open(d); }
  function open(key) { const d = ORG.find((x) => x.key === key); if (!d) return; location.hash = "#afdeling/" + d.key; }

  /* ---- het gebouw ---- */
  function buildBuilding(v) {
    clearView(v);
    const MAT = mats(); v.scene.background = new T.Color(dark() ? 0x0B1320 : 0xE9E7E1);
    v.hemi.intensity = dark() ? 0.5 : 0.8; v.sun.intensity = dark() ? 0.5 : 0.85;
    const floors = ORG.slice().sort((a, b) => a.floor - b.floor);
    const GAP = FH + 0.25;
    // straat en gras
    box(FW + 12, 0.1, FD + 10, MAT.grass, 0, -0.45, 1.5, v.world, false);
    box(FW + 12, 0.12, 2.6, MAT.street, 0, -0.38, FD / 2 + 3.2, v.world, false);
    // entree en lift
    const shaftH = floors.length * GAP + 0.5;
    box(1.4, shaftH, 1.4, MAT.navy, FW / 2 + 0.9, shaftH / 2 - 0.25, -FD / 2 + 0.9, v.world);
    const cabin = box(1.1, 1.6, 0.2, MAT.teal, FW / 2 + 0.9, 1, -FD / 2 + 1.62, v.world, false);
    v.lift = { cabin, top: (floors.length - 1) * GAP + 1, t: 0 };
    floors.forEach((d, i) => {
      const y = i * GAP, f = buildFloor(d, MAT, v.world, y);
      f.g.userData.dept = d.key;
      v.people.push(...f.people); v.screens.push(...f.screens);
      const label = document.createElement("button"); label.type = "button"; label.className = "floor3d" + (d.status === "live" ? " live" : "");
      label.innerHTML = `<span class="fn">${d.floor}</span><b>${esc(d.name)}</b><em>${d.status === "live" ? "Aan het werk" : "Wacht op koppeling"}</em>`;
      label.style.setProperty("--fc", d.color);
      label.addEventListener("click", () => open(d.key)); label.addEventListener("mouseenter", () => { v.hoverFloor = d.key; highlight(v); }); label.addEventListener("mouseleave", () => { v.hoverFloor = null; highlight(v); });
      v.overlay.appendChild(label);
      v.floors.push({ g: f.g, dept: d, accent: f.accent, label, anchor: new T.Vector3(-FW / 2 - 0.2, y + FH * 0.55, FD / 2) });
    });
    // dak met lichtbord
    const roofY = floors.length * GAP - 0.1;
    box(FW + 0.4, 0.3, FD + 0.4, MAT.edge, 0, roofY, 0, v.world);
    const sign = makeSign(); sign.scale.set(0.9, 0.9, 1); sign.position.set(-1.2, roofY + 1.15, -FD / 2 + 0.6); v.world.add(sign);
    box(0.08, 1.4, 0.08, MAT.ink, -4.4, roofY + 0.7, -FD / 2 + 0.55, v.world); box(0.08, 1.4, 0.08, MAT.ink, 2.0, roofY + 0.7, -FD / 2 + 0.55, v.world);
    cyl(0.04, 0.04, 1.6, MAT.ink, FW / 2 - 1, roofY + 0.9, -1, v.world); sph(0.08, MAT.teal, FW / 2 - 1, roofY + 1.7, -1, v.world);
    v.height = roofY + 2.6; v.width = FW + 12;
    v.center.set(-4.2, v.height / 2 - 0.6, 0);
    fit(v);
  }

  /* ---- één verdieping (afdelingspagina) ---- */
  /* ---- levendige verdieping per afdeling: kantoortjes, keuken, pingpong ---- */
  const RW = 4.2, RD = 3.6, AIS = 2.6, LW = 7.2;
  const LINES = {
    jij: ["Hoe staan we ervoor?", "Goed bezig team!", "Even bijpraten?"],
    directeur: ["Briefing voor Maxim staat klaar", "Wat zijn de prioriteiten vandaag?", "Hoe gaat het met de omzet?"],
    marketeer: ["Kosten per afspraak gaan omlaag", "Deze advertentie werkt het best", "Briefing voor Milo komt eraan"],
    designer: ["Vijf nieuwe statics in de maak", "Welke kop vind jij sterker?", "Staan in Canva!"],
    verkoopmanager: ["Mooie concepten vandaag!", "Wie heeft zijn concept bekeken?", "Even de wachtrij doornemen"],
    scout: ["Twintig nieuwe kappers gevonden", "Morgen is Utrecht aan de beurt", "Deze heeft nog geen website!"],
    researcher: ["Info@-adres gevonden", "Openingszin staat klaar", "Deze site is van 2014..."],
    conceptmaker: ["Concept voor de hovenier is klaar", "Hun foto's zijn top", "Huisstijlkleur overgenomen"],
    postkamer: ["Mails gaan om 9:00 de deur uit", "Reactie binnen!", "Inbox gecheckt"],
    projectmanager: ["Wijziging binnen 48 uur verwerkt", "Voorstel staat klaar voor Maxim", "Deadline in de gaten"],
    webbouwer: ["Openingstijden aangepast", "Voorbeeldversie staat klaar", "Nieuwe foto geplaatst"],
    opleveraar: ["Nieuwe site in aanbouw", "Informatie is binnen, we gaan bouwen", "Binnen 2 werkdagen online"],
    service: ["Klant hulp gegeven bij de start", "Iedereen is op weg", "Even bellen met een nieuwe klant"],
    agenda: ["Nieuwe kennismaking geboekt!", "Herinnering verstuurd", "Agenda staat klaar"],
    monitor: ["Alle sites zijn online ✔", "Controle afgerond", "Snelle laadtijden vandaag"],
    controller: ["Nieuwe betaling binnen", "Factuur verstuurd", "MRR groeit"],
  };
  const GENERIC = ["Koffie?", "Even overleggen?", "Top idee!", "Heb je even?", "Lekker bezig!"];
  const REPLY = ["Top, ik pak het op!", "Goed plan 👍", "Laat maar zien", "Helemaal mee eens", "Komt goed!"];
  const lineFor = (k) => { const l = LINES[k] || GENERIC; return l[Math.floor(Math.random() * l.length)]; };

  function buildSingle(v, key) {
    clearView(v);
    const d = ORG.find((x) => x.key === key); if (!d) return;
    const MAT = mats(); v.scene.background = new T.Color(dark() ? 0x0B1320 : 0xE9E7E1);
    v.hemi.intensity = dark() ? 0.5 : 0.8; v.sun.intensity = dark() ? 0.5 : 0.85;
    const accent = M(hex(d.color), { r: 0.45 });
    const n = d.people.length, two = n > 3, perRow = Math.max(2, two ? Math.ceil(n / 2) : n);
    const D = two ? RD * 2 + AIS : RD + AIS + 1.6, W = perRow * RW + LW + 1.2, x0 = -W / 2 + 0.5;
    const HZ = two ? 0 : -D / 2 + RD + AIS / 2; // middellijn van de gang
    const w = v.world, rooms = {};
    // vloer, rand en achterwand met afdelingsbord
    box(W + 0.5, 0.4, D + 0.5, MAT.edge, 0, -0.25, 0, w, false); box(W + 0.54, 0.06, D + 0.54, accent, 0, -0.03, 0, w, false);
    box(W, 0.08, D, MAT.slab, 0, 0, 0, w, false);
    box(perRow * RW, 0.02, AIS - 0.3, M(dark() ? 0x1b2a40 : 0xE6E3DC, { r: 0.95 }), x0 + (perRow * RW) / 2, 0.05, HZ, w, false);
    box(perRow * RW - 0.4, 0.03, 0.08, accent, x0 + (perRow * RW) / 2, 0.07, HZ, w, false);
    box(W, 2.4, 0.22, MAT.navy, 0, 1.2, -D / 2 - 0.11, w);
    box(3.6, 0.5, 0.05, accent, x0 + 2.2, 1.9, -D / 2 + 0.02, w, false);
    // kantoortjes
    d.people.forEach((p, i) => {
      const row = two && i >= perRow ? 1 : 0, col = row ? i - perRow : i;
      const cx = x0 + RW * col + RW / 2, cz = row === 0 ? HZ - (AIS / 2 + RD / 2) : HZ + AIS / 2 + RD / 2, front = row === 0 ? 1 : -1;
      const g = new T.Group(); g.position.set(cx, 0, cz); w.add(g);
      box(RW - 0.25, 0.04, RD - 0.25, M(dark() ? 0x1f2f47 : 0xFBFAF7, { r: 0.85 }), 0, 0.06, 0, g, false);
      box(RW - 0.2, 1.5, 0.1, row === 0 ? MAT.wall : MAT.glass, 0, 0.75, -front * (RD / 2 - 0.08), g);
      box(0.1, 1.5, RD - 0.2, MAT.glass, -RW / 2 + 0.08, 0.75, 0, g, false); box(0.1, 1.5, RD - 0.2, MAT.glass, RW / 2 - 0.08, 0.75, 0, g, false);
      const seg = (RW - 1.4) / 2 - 0.1;
      box(seg, 1.5, 0.06, MAT.glass, -RW / 2 + 0.12 + seg / 2, 0.75, front * (RD / 2 - 0.08), g, false);
      box(seg, 1.5, 0.06, MAT.glass, RW / 2 - 0.12 - seg / 2, 0.75, front * (RD / 2 - 0.08), g, false);
      box(1.4, 0.12, 0.08, M(PALETTE[(p.color ?? 1) % PALETTE.length], { r: 0.5 }), 0, 1.44, front * (RD / 2 - 0.08), g);
      const dz = -front * 0.75;
      box(1.9, 0.1, 0.85, MAT.wood, 0, 0.86, dz, g);
      [[-0.85, -0.32], [0.85, -0.32], [-0.85, 0.32], [0.85, 0.32]].forEach(([a, b]) => box(0.07, 0.82, 0.07, MAT.woodDark, a, 0.43, dz + b, g));
      box(0.86, 0.52, 0.05, MAT.ink, 0, 1.24, dz - front * 0.22, g);
      const sc = box(0.78, 0.44, 0.02, MAT.screenOff, 0, 1.24, dz - front * 0.19, g); v.screens.push({ key: p.key, mesh: sc });
      cyl(0.28, 0.28, 0.08, MAT.navy, 0, 0.52, dz + front * 0.8, g);
      cyl(0.2, 0.16, 0.36, MAT.white, RW / 2 - 0.5, 0.22, -front * (RD / 2 - 0.5), g); sph(0.32, MAT.green, RW / 2 - 0.5, 0.7, -front * (RD / 2 - 0.5), g);
      const plate = document.createElement("div"); plate.className = "plate3d"; plate.innerHTML = `<i></i><b>${esc(p.role)}</b>`; v.overlay.appendChild(plate);
      rooms[p.key] = { front, plate, label: new T.Vector3(cx - RW / 2 + 0.4, 1.95, cz - front * (RD / 2 - 0.1)),
        seat: new T.Vector3(cx, 0.05, cz + dz + front * 0.75), visit: new T.Vector3(cx - 1.1, 0.05, cz + dz + front * 1.25),
        door: new T.Vector3(cx, 0.05, cz + front * (RD / 2 + 0.35)), hall: new T.Vector3(cx, 0.05, HZ) };
    });
    // lounge: keuken, tafel, pingpong
    const LX = x0 + perRow * RW + 0.6 + LW / 2, lz0 = -D / 2;
    box(LW - 0.4, 0.04, D - 0.4, M(dark() ? 0x223249 : 0xEFE9DF, { r: 0.85 }), LX, 0.06, 0, w, false);
    box(LW - 1.6, 0.95, 0.85, MAT.navy, LX, 0.48, lz0 + 0.8, w); box(LW - 1.4, 0.08, 0.95, MAT.wood, LX, 0.98, lz0 + 0.8, w);
    box(0.55, 0.75, 0.45, MAT.ink, LX - 1.6, 1.4, lz0 + 0.75, w); sph(0.06, MAT.teal, LX - 1.6, 1.55, lz0 + 1.0, w);
    [0, 1, 2].forEach((i) => cyl(0.07, 0.06, 0.15, MAT.white, LX + i * 0.32, 1.1, lz0 + 0.75, w));
    box(0.7, 1.7, 0.6, MAT.white, LX + LW / 2 - 0.8, 0.85, lz0 + 0.7, w); // koelkast
    cyl(0.75, 0.75, 0.07, MAT.wood, LX - 1.2, 0.8, -0.2, w); cyl(0.07, 0.07, 0.78, MAT.ink, LX - 1.2, 0.4, -0.2, w);
    [[0.95, 0], [-0.95, 0], [0, 0.95]].forEach(([a, b]) => cyl(0.24, 0.24, 0.07, accent, LX - 1.2 + a, 0.52, -0.2 + b, w));
    // pingpongtafel
    const PZ = D / 2 - (two ? 1.5 : 1.0);
    box(2.7, 0.08, 1.5, M(0x1f6b4a, { r: 0.5 }), LX + 0.9, 0.78, PZ, w); box(0.04, 0.16, 1.55, MAT.white, LX + 0.9, 0.9, PZ, w);
    box(2.7, 0.012, 0.03, MAT.white, LX + 0.9, 0.825, PZ, w, false);
    [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]].forEach(([a, b]) => box(0.06, 0.74, 0.06, MAT.ink, LX + 0.9 + a, 0.37, PZ + b, w));
    const ball = sph(0.06, M(0xFF5757, { r: 0.4 }), LX + 0.9, 1.0, PZ, w); ball.visible = false;
    // bank en plant
    box(2.2, 0.4, 0.8, accent, LX + 1.6, 0.25, -0.2, w); box(2.2, 0.55, 0.22, accent, LX + 1.6, 0.6, 0.12, w);
    cyl(0.25, 0.2, 0.45, MAT.white, LX + LW / 2 - 0.6, 0.25, D / 2 - 0.5, w); sph(0.42, MAT.green, LX + LW / 2 - 0.6, 0.85, D / 2 - 0.5, w);
    const kp = document.createElement("div"); kp.className = "plate3d"; kp.innerHTML = `<i></i><b>Keuken & pingpong</b>`; v.overlay.appendChild(kp);
    rooms.lounge = { plate: kp, label: new T.Vector3(LX - LW / 2 + 0.5, 1.95, lz0 + 0.3), hall: new T.Vector3(LX - LW / 2 + 0.2, 0.05, HZ), door: new T.Vector3(LX - LW / 2 + 0.2, 0.05, HZ) };
    v.spots = { coffee: () => new T.Vector3(LX - 0.6 + Math.random() * 1.6, 0.05, lz0 + 1.75), endA: new T.Vector3(LX + 0.9 - 1.75, 0.05, PZ), endB: new T.Vector3(LX + 0.9 + 1.75, 0.05, PZ), table: new T.Vector3(LX - 1.2, 0.05, 0.8) };
    v.ball = ball; v.pong = null; v.rooms = rooms; v.agents = {};
    d.people.forEach((p) => {
      const f = figure(p, MAT); const r = rooms[p.key]; f.g.position.copy(r.seat); f.g.rotation.y = r.front > 0 ? Math.PI : 0; w.add(f.g);
      const tag = document.createElement("div"); tag.className = "tag3d"; tag.textContent = p.person; v.overlay.appendChild(tag);
      const bubble = document.createElement("div"); bubble.className = "bubble3d"; bubble.hidden = true; v.overlay.appendChild(bubble);
      const a = { ...f, key: p.key, name: p.person, live: isLive(d), dept: d, phase: Math.random() * 6, tag, bubble, path: [], walking: false, busy: false, state: "desk", onArrive: null };
      v.people.push(a); v.agents[p.key] = a; v.labels.push({ el: tag, p: a });
    });
    v.height = D + 2.2; v.width = W + 0.5; v.center.set(0, 0.4, two ? 0.3 : 0);
    v.dept = d; v.lifeT = performance.now() + 2500;
    fit(v);
  }

  /* ---- leven op de verdieping ---- */
  const vtmp = new T.Vector3();
  function goTo(a, pts) { return new Promise((res) => { a.path = pts.map((p) => p.clone()); a.walking = true; a.onArrive = res; }); }
  async function walk(v, a, pts) { if (RM) { a.g.position.copy(pts[pts.length - 1]); return; } await goTo(a, pts); }
  function routeTo(v, from, toRoom, end) { const A = v.rooms[from], B = v.rooms[toRoom]; return [A.door, A.hall, B.hall, B.door, end]; }
  function face(a, pt) { a.g.rotation.y = Math.atan2(pt.x - a.g.position.x, pt.z - a.g.position.z); }
  function sit(v, a) { const r = v.rooms[a.key]; a.g.rotation.y = r.front > 0 ? Math.PI : 0; a.state = "desk"; a.busy = false; }
  function say(v, a, text, ms = 3600) { return new Promise((res) => { a.bubble.textContent = text; a.bubble.hidden = false; a.bubble.classList.remove("pop"); void a.bubble.offsetWidth; a.bubble.classList.add("pop"); setTimeout(() => { a.bubble.hidden = true; res(); }, ms); }); }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function idle(v) { return Object.values(v.agents || {}).filter((a) => !a.busy && !a.walking); }

  async function visitColleague(v, a, b) {
    a.busy = b.busy = true;
    await walk(v, a, routeTo(v, a.key, b.key, v.rooms[b.key].visit)); face(a, b.g.position); face(b, a.g.position);
    await say(v, a, lineFor(a.key)); await say(v, b, REPLY[Math.floor(Math.random() * REPLY.length)], 2400);
    sit(v, b); await walk(v, a, routeTo(v, b.key, a.key, v.rooms[a.key].seat)); sit(v, a);
  }
  async function coffee(v, a) {
    a.busy = true; await walk(v, a, routeTo(v, a.key, "lounge", v.spots.coffee())); a.g.rotation.y = Math.PI; a.state = "sip";
    if (Math.random() < 0.6) await say(v, a, ["Even koffie ☕", "Wie wil er ook?", "Lekker bakkie", "Even de benen strekken"][Math.floor(Math.random() * 4)], 2600);
    await wait(3500); a.state = "walk"; await walk(v, a, routeTo(v, "lounge", a.key, v.rooms[a.key].seat)); sit(v, a);
  }
  async function pingpong(v, a, b) {
    a.busy = b.busy = true;
    await Promise.all([walk(v, a, routeTo(v, a.key, "lounge", v.spots.endA)), walk(v, b, routeTo(v, b.key, "lounge", v.spots.endB))]);
    face(a, v.spots.endB); face(b, v.spots.endA); a.state = b.state = "pong";
    v.pong = { a, b, t: 0 }; v.ball.visible = true;
    await say(v, a, "Potje pingpong? 🏓", 2200);
    await wait(7000);
    await say(v, [a, b][Math.floor(Math.random() * 2)], ["Gewonnen! 🏆", "Nog eentje?", "Dat was close!"][Math.floor(Math.random() * 3)], 2400);
    v.pong = null; v.ball.visible = false; a.state = b.state = "walk";
    await Promise.all([walk(v, a, routeTo(v, "lounge", a.key, v.rooms[a.key].seat)), walk(v, b, routeTo(v, "lounge", b.key, v.rooms[b.key].seat))]);
    sit(v, a); sit(v, b);
  }
  function life(v, now) {
    if (RM || !v.agents || now < v.lifeT) return;
    v.lifeT = now + 5000 + Math.random() * 5000;
    const free = idle(v).filter((a) => !(a.live && personBusy(a.key) && Math.random() < 0.7));
    if (!free.length) return;
    const r = Math.random(), shuffle = free.sort(() => Math.random() - 0.5);
    if (r < 0.25 && shuffle.length >= 2 && !v.pong) pingpong(v, shuffle[0], shuffle[1]).catch(() => {});
    else if (r < 0.6 && shuffle.length >= 2) visitColleague(v, shuffle[0], shuffle[1]).catch(() => {});
    else coffee(v, shuffle[0]).catch(() => {});
  }
  function stepAgent(a, dt) {
    if (!a.walking || !a.path.length) return;
    const t = a.path[0]; vtmp.copy(t).sub(a.g.position); vtmp.y = 0; const dd = vtmp.length(), sp = 2.0 * dt;
    if (dd <= sp) { a.g.position.copy(t); a.path.shift(); if (!a.path.length) { a.walking = false; const f = a.onArrive; a.onArrive = null; f && f(); } return; }
    vtmp.normalize(); a.g.position.addScaledVector(vtmp, sp);
    const ang = Math.atan2(vtmp.x, vtmp.z); let df = ang - a.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); a.g.rotation.y += df * Math.min(1, dt * 10);
  }

  /* ---- animatie ---- */
  const tmp = new T.Vector3();
  function toScreen(v, p) { tmp.copy(p).project(v.cam); return { x: ((tmp.x + 1) / 2) * v.container.clientWidth, y: ((1 - tmp.y) / 2) * v.container.clientHeight }; }
  function frame(v, now, dt) {
    if (!v.dragging && !RM && now - v.autoT > 6000) v.targetYaw = (v.kind === "building" ? -0.38 : -0.25) + Math.sin(now / 9000) * 0.22;
    v.yaw += (v.targetYaw - v.yaw) * Math.min(1, dt * 3); placeCam(v);
    if (v.kind === "floor") life(v, now);
    v.people.forEach((p) => {
      p.phase += dt;
      if (p.walking !== undefined) stepAgent(p, dt);
      if (p.walking) { const k = Math.sin(p.phase * 9) * 0.6; p.legL.rotation.x = k; p.legR.rotation.x = -k; p.armL.rotation.x = -k * 0.8; p.armR.rotation.x = k * 0.8; p.g.position.y = 0.05 + Math.abs(Math.sin(p.phase * 9)) * 0.05; return; }
      p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
      if (p.state === "pong") { p.armR.rotation.x = -1.2 + Math.sin(p.phase * 7) * 0.6; p.armL.rotation.x *= 0.8; return; }
      if (p.state === "sip") { p.armR.rotation.x = -1.6 + Math.max(0, Math.sin(p.phase * 1.6)) * 0.9; return; }
      const busy = p.live && personBusy(p.key);
      const typing = busy || (v.kind === "floor" && p.state === "desk" && !p.busy && Math.sin(p.phase * 0.35) > 0.2);
      if (typing && !RM) { const t = Math.sin(p.phase * 14) * 0.12; p.armL.rotation.x = -1.0 + t; p.armR.rotation.x = -1.0 - t; }
      else { p.armL.rotation.x *= 0.9; p.armR.rotation.x *= 0.9; if (!RM) p.head.rotation.y = Math.sin(p.phase * 0.7) * 0.25; }
    });
    if (v.pong && v.ball) { v.pong.t += dt; const k = (Math.sin(v.pong.t * 3.2) + 1) / 2, A = v.spots.endA, B = v.spots.endB; v.ball.position.set(A.x + 0.5 + k * (B.x - A.x - 1.0), 0.95 + Math.abs(Math.sin(v.pong.t * 6.4)) * 0.35, A.z); }
    v.screens.forEach((s) => { const d = ORG.find((x) => x.people.some((p) => p.key === s.key)); s.mesh.material = d && d.status === "live" && personBusy(s.key) ? MATON : MATOFF; });
    if (v.lift && !RM) { v.lift.t += dt * 0.12; const k = (Math.sin(v.lift.t) + 1) / 2; v.lift.cabin.position.y = 1 + k * (v.lift.top - 1); }
    v.renderer.render(v.scene, v.cam);
    v.floors.forEach((f) => { const s = toScreen(v, f.anchor); f.label.style.transform = `translate(10px,${s.y}px)`; });
    v.labels.forEach((l) => { tmp.copy(l.p.g.position); tmp.y = 2.35; const s = toScreen(v, tmp); l.el.style.transform = `translate(${s.x}px,${s.y}px)`;
      if (l.p.bubble && !l.p.bubble.hidden) { tmp.y = 2.75; const b = toScreen(v, tmp); l.p.bubble.style.transform = `translate(${b.x}px,${b.y}px)`; } });
    if (v.rooms) Object.values(v.rooms).forEach((r) => { if (r.plate && r.label) { const s = toScreen(v, r.label); r.plate.style.transform = `translate(${s.x}px,${s.y}px)`; } });
  }
  const MATON = M(0x9fd4ff, { r: 0.3, e: 0x6fbcff, ei: 0.9 }), MATOFF = M(0x2a3442, { r: 0.3 });

  let building = null, floorView = null, floorKey = null, last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden) return;
    [building, floorView].forEach((v) => { if (v && v.visible && v.container.offsetParent) frame(v, now, dt); });
  }

  function mount(container, v) {
    v.ro.disconnect(); v.io.disconnect(); v.ro.observe(container); v.io.observe(container); v.visible = true;
    container.classList.add("o3d"); container.innerHTML = "";
    container.appendChild(v.stage); container.appendChild(v.overlay);
    const hint = document.createElement("div"); hint.className = "hint3d"; hint.textContent = v.kind === "building" ? "Klik op een verdieping · sleep om te draaien" : "Sleep om rond te kijken"; container.appendChild(hint);
    v.stage.addEventListener("pointerdown", () => { hint.style.opacity = 0; }, { once: true });
  }

  window.SM_Building = {
    mountBuilding(container) {
      if (!container) return;
      if (!building) { building = makeView(container, "building"); if (!building) return; building.yaw = building.targetYaw = -0.38; }
      building.container = container; mount(container, building); buildBuilding(building);
    },
    refresh() { if (building) buildBuilding(building); },
    showFloor(container, key) {
      if (!container) return;
      if (!floorView) { floorView = makeView(container, "floor"); if (!floorView) return; floorView.yaw = floorView.targetYaw = -0.25; }
      floorView.container = container; mount(container, floorView); floorKey = key; buildSingle(floorView, key);
      requestAnimationFrame(() => fit(floorView));
    },
  };
  window.addEventListener("hq-theme", () => { if (building) buildBuilding(building); if (floorView && floorKey) buildSingle(floorView, floorKey); });
  portraits();
  requestAnimationFrame(loop);
})();
