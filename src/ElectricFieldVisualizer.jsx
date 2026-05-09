import React, { useCallback, useEffect, useRef, useState } from "react";

const COULOMB_K = 2800;
const MIN_R_SAMPLES = 14;
const GRID_STEP = 28;
const ARROW_LENGTH = 12;
const ARROW_HEAD = 4.5;
const CHARGE_RADIUS = 22;
const CHARGE_HIT_SLACK = 6;
const CLICK_THRESHOLD = 5;
const FIELD_CUTOFF = 4800;
const FIELD_CUTOFF_SQ = FIELD_CUTOFF * FIELD_CUTOFF;

const ARROW_ALPHA_LO = 0.3;
const ARROW_ALPHA_HI = 0.5;

const VIEW_MARGIN = 72;

const TAU_VIEW = 0.14;
const TAU_CHARGE = 0.11;
const TAU_MICRO = 0.08;

const RESIZE_DEBOUNCE_MS = 100;

const FIELD_CACHE_MAX = 120000;

const BG_TOP = "#070b14";
const BG_MID = "#0c1222";
const BG_BOTTOM = "#101a2e";
const POS_NEON = "#ff2ea6";
const POS_CORE = "#ff6b9d";
const NEG_NEON = "#00f0ff";
const NEG_CORE = "#5cefff";

const glassPanelClass =
  "rounded-2xl border border-white/[0.1] bg-[rgba(12,16,28,0.42)] shadow-2xl shadow-black/50 backdrop-blur-[12px] transition-all duration-200 ease-out";

const glowBtn = (active, activeCls, idleCls) =>
  `rounded-2xl border px-3 py-2.5 text-sm font-semibold tracking-tight transition-all duration-200 ease-out ${active ? activeCls : idleCls}`;

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `q-${idCounter}`;
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function gridKey(wx, wy) {
  const gwx = Math.round((wx - GRID_STEP * 0.5) / GRID_STEP);
  const gwy = Math.round((wy - GRID_STEP * 0.5) / GRID_STEP);
  return `${gwx},${gwy}`;
}

function fieldAt(x, y, charges) {
  let Ex = 0;
  let Ey = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy;
    if (r2 > FIELD_CUTOFF_SQ) continue;
    const r = Math.sqrt(r2);
    if (r < MIN_R_SAMPLES) continue;
    const r3 = r * r2;
    const s = (COULOMB_K * c.q) / r3;
    Ex += s * dx;
    Ey += s * dy;
  }
  return { Ex, Ey, mag: Math.hypot(Ex, Ey) };
}

function findChargeAt(x, y, charges) {
  const hitR = CHARGE_RADIUS + CHARGE_HIT_SLACK;
  const r2 = hitR * hitR;
  for (let i = charges.length - 1; i >= 0; i--) {
    const c = charges[i];
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy <= r2) return { charge: c, index: i };
  }
  return null;
}

function smoothK(dt, tau) {
  if (tau <= 1e-6) return 1;
  return 1 - Math.exp(-dt / tau);
}

function drawChargeNeon(ctx, cx, cy, r, isPos, scale, hoverBoost, selected) {
  const neon = isPos ? POS_NEON : NEG_NEON;
  const neonSoft = isPos ? "rgba(255,46,166," : "rgba(0,240,255,";
  const auraR = r * 3.2 * (hoverBoost || 1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  ctx.globalCompositeOperation = "screen";

  const g1 = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, auraR);
  g1.addColorStop(0, `${neonSoft}0.55)`);
  g1.addColorStop(0.4, `${neonSoft}0.22)`);
  g1.addColorStop(1, `${neonSoft}0)`);
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 28;
  ctx.shadowColor = neon;
  const g2 = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 1, cx, cy, r * 1.08);
  g2.addColorStop(0, "#ffffff");
  g2.addColorStop(0.25, isPos ? POS_CORE : NEG_CORE);
  g2.addColorStop(0.75, neon);
  g2.addColorStop(1, isPos ? "rgba(120,0,70,0.9)" : "rgba(0,80,120,0.9)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(248,250,252,0.96)";
  ctx.font = `bold ${Math.floor(r * 1.2)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isPos ? "+" : "−", cx, cy + 0.5);

  const ringBoost = selected ? 1.35 : hoverBoost > 1 ? 1.15 : 1;
  if (selected || hoverBoost > 1.01) {
    ctx.strokeStyle = selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = selected ? 2.5 : 1.75;
    ctx.shadowBlur = selected ? 18 : 12;
    ctx.shadowColor = neon;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8 * ringBoost, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export function ElectricFieldVisualizer() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const removeBtnWrapRef = useRef(null);
  const bgCanvasRef = useRef(null);

  const chargesRef = useRef([]);
  const renderPosRef = useRef(new Map());
  const viewDrawRef = useRef({ x: 0, y: 0 });
  const chargeScaleRef = useRef(new Map());
  const chargeScaleTargetRef = useRef(new Map());

  const hoverIdRef = useRef(null);
  const animTimeRef = useRef(0);

  const dragRef = useRef({
    active: false,
    index: -1,
    pointerId: null,
    startX: 0,
    startY: 0,
    placeCandidate: false,
  });

  const fieldCacheRef = useRef(new Map());
  const chargesStampRef = useRef(0);

  const lastFrameTsRef = useRef(null);

  const [charges, setCharges] = useState([]);
  const [placeSign, setPlaceSign] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const viewOffsetRef = useRef({ x: 0, y: 0 });

  const [hudWorld, setHudWorld] = useState({ x: 0, y: 0 });

  const middlePanRef = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    pointerId: null,
  });

  const rafRef = useRef(0);
  const logicalSizeRef = useRef({ w: 0, h: 0 });
  const resizeDebounceRef = useRef(0);

  const arrowBatchRef = useRef({
    n: 0,
    data: new Float32Array(4096),
    ensure(n) {
      const need = n * 6;
      if (this.data.length < need) {
        this.data = new Float32Array(Math.ceil(need * 1.5));
      }
    },
  });

  useEffect(() => {
    viewOffsetRef.current = viewOffset;
  }, [viewOffset]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      if (resizeDebounceRef.current) window.clearTimeout(resizeDebounceRef.current);
    };
  }, []);

  const bumpChargesStamp = useCallback(() => {
    chargesStampRef.current += 1;
    fieldCacheRef.current.clear();
  }, []);

  useEffect(() => {
    chargesRef.current = charges;
    for (const c of charges) {
      if (!renderPosRef.current.has(c.id)) {
        renderPosRef.current.set(c.id, { x: c.x, y: c.y });
      }
      if (!chargeScaleRef.current.has(c.id)) {
        chargeScaleRef.current.set(c.id, 0.82);
        chargeScaleTargetRef.current.set(c.id, 1);
      }
    }
    const ids = new Set(charges.map((c) => c.id));
    for (const key of [...renderPosRef.current.keys()]) {
      if (!ids.has(key)) {
        renderPosRef.current.delete(key);
        chargeScaleRef.current.delete(key);
        chargeScaleTargetRef.current.delete(key);
      }
    }
    bumpChargesStamp();
  }, [charges, bumpChargesStamp]);

  const redrawOffscreenBg = useCallback((w, h) => {
    let bg = bgCanvasRef.current;
    if (!bg || bg.width !== w || bg.height !== h) {
      bg = document.createElement("canvas");
      bg.width = w;
      bg.height = h;
      bgCanvasRef.current = bg;
    }
    const bctx = bg.getContext("2d");
    const g = bctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(0.45, BG_MID);
    g.addColorStop(1, BG_BOTTOM);
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, w, h);
  }, []);

  const getOrComputeField = useCallback((wx, wy, list, useCache, gen) => {
    const key = gridKey(wx, wy);
    if (useCache) {
      const ent = fieldCacheRef.current.get(key);
      if (ent && ent.gen === gen) return ent;
    }
    const { Ex, Ey, mag } = fieldAt(wx, wy, list);
    if (useCache && fieldCacheRef.current.size < FIELD_CACHE_MAX) {
      fieldCacheRef.current.set(key, { gen, Ex, Ey, mag });
    }
    return { Ex, Ey, mag };
  }, []);

  const drawArrowBatches = useCallback((ctx, batch, n, maxMag, timeSec) => {
    if (n === 0) return;
    const d = batch.data;
    const NUM_BINS = 8;
    const pathsStroke = Array.from({ length: NUM_BINS }, () => new Path2D());
    const pathsFill = Array.from({ length: NUM_BINS }, () => new Path2D());

    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const sx = d[o];
      const sy = d[o + 1];
      const ux = d[o + 2];
      const uy = d[o + 3];
      const mag = d[o + 4];
      const phase = d[o + 5];

      const strength = maxMag > 0 ? mag / maxMag : 0;
      const pulse = 0.88 + 0.12 * Math.sin(timeSec * 2.6 + phase + (sx + sy) * 0.01);
      const baseA = ARROW_ALPHA_LO + clamp01(strength) * (ARROW_ALPHA_HI - ARROW_ALPHA_LO);
      const alpha = clamp01(baseA * pulse);
      const bin = Math.min(NUM_BINS - 1, Math.floor(alpha * NUM_BINS));

      const xh = sx + ux * ARROW_LENGTH;
      const yh = sy + uy * ARROW_LENGTH;
      pathsStroke[bin].moveTo(sx, sy);
      pathsStroke[bin].lineTo(xh, yh);

      const ah = ARROW_HEAD;
      const bx = xh - ux * ah;
      const by = yh - uy * ah;
      const px = -uy;
      const py = ux;
      const tri = pathsFill[bin];
      tri.moveTo(xh, yh);
      tri.lineTo(bx + px * (ah * 0.55), by + py * (ah * 0.55));
      tri.lineTo(bx - px * (ah * 0.55), by - py * (ah * 0.55));
      tri.closePath();
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.65;

    for (let b = 0; b < NUM_BINS; b++) {
      const a = (b + 0.5) / NUM_BINS;
      const base = ARROW_ALPHA_LO + a * (ARROW_ALPHA_HI - ARROW_ALPHA_LO);
      ctx.globalAlpha = base * 0.92;
      ctx.strokeStyle = `rgba(215, 232, 255, ${0.75 + 0.25 * base})`;
      ctx.stroke(pathsStroke[b]);
    }

    for (let b = 0; b < NUM_BINS; b++) {
      const a = (b + 0.5) / NUM_BINS;
      const fillA = ARROW_ALPHA_LO + a * (ARROW_ALPHA_HI - ARROW_ALPHA_LO);
      ctx.globalAlpha = fillA * 0.95;
      ctx.fillStyle = `rgba(235, 245, 255, ${0.85 + 0.15 * a})`;
      ctx.fill(pathsFill[b]);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    const { w: lw, h: lh } = logicalSizeRef.current;
    if (lw <= 0 || lh <= 0) return;

    const nowMs = performance.now();
    const lastTs = lastFrameTsRef.current;
    const dt = lastTs != null ? Math.min(0.05, (nowMs - lastTs) / 1000) : 1 / 60;
    lastFrameTsRef.current = nowMs;
    animTimeRef.current += dt;

    const t = animTimeRef.current;

    const list = chargesRef.current;
    const targetVo = viewOffsetRef.current;

    const kv = smoothK(dt, middlePanRef.current.active ? 0.001 : TAU_VIEW);
    const kc = smoothK(dt, TAU_CHARGE);
    const km = smoothK(dt, TAU_MICRO);

    if (middlePanRef.current.active) {
      viewDrawRef.current.x = targetVo.x;
      viewDrawRef.current.y = targetVo.y;
    } else {
      viewDrawRef.current.x += (targetVo.x - viewDrawRef.current.x) * kv;
      viewDrawRef.current.y += (targetVo.y - viewDrawRef.current.y) * kv;
    }

    const ox = viewDrawRef.current.x;
    const oy = viewDrawRef.current.y;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / lw;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const iw = Math.max(1, Math.round(lw));
    const ih = Math.max(1, Math.round(lh));
    let bg = bgCanvasRef.current;
    if (!bg || bg.width !== iw || bg.height !== ih) {
      redrawOffscreenBg(iw, ih);
      bg = bgCanvasRef.current;
    }
    ctx.drawImage(bg, 0, 0, lw, lh);

    const wxMin = -ox;
    const wxMax = lw - ox;
    const wyMin = -oy;
    const wyMax = lh - oy;

    const pts = [];
    const wxStart =
      Math.ceil((wxMin - GRID_STEP * 0.5) / GRID_STEP) * GRID_STEP + GRID_STEP * 0.5;
    for (let wx = wxStart; wx < wxMax; wx += GRID_STEP) {
      const wyStart =
        Math.ceil((wyMin - GRID_STEP * 0.5) / GRID_STEP) * GRID_STEP + GRID_STEP * 0.5;
      for (let wy = wyStart; wy < wyMax; wy += GRID_STEP) {
        const sx = wx + ox;
        const sy = wy + oy;
        pts.push({ wx, wy, sx, sy, phase: ((wx * 0.017 + wy * 0.023) % 6.283) + 6.283 });
      }
    }

    const useFieldCache = !dragRef.current.active;
    const gen = chargesStampRef.current;

    let maxMag = 1e-12;
    const samplesMag = new Float32Array(pts.length);
    const samplesUx = new Float32Array(pts.length);
    const samplesUy = new Float32Array(pts.length);

    for (let i = 0; i < pts.length; i++) {
      const { wx, wy } = pts[i];
      const { Ex, Ey, mag } = getOrComputeField(wx, wy, list, useFieldCache, gen);
      samplesMag[i] = mag;
      const m = Math.hypot(Ex, Ey);
      if (m > 1e-10) {
        samplesUx[i] = Ex / m;
        samplesUy[i] = Ey / m;
      } else {
        samplesUx[i] = 0;
        samplesUy[i] = 0;
      }
      if (mag > maxMag) maxMag = mag;
    }

    const ab = arrowBatchRef.current;
    ab.ensure(pts.length);
    let bi = 0;
    for (let i = 0; i < pts.length; i++) {
      const m = samplesMag[i];
      if (m < 1e-10) continue;
      const o = bi * 6;
      ab.data[o] = pts[i].sx;
      ab.data[o + 1] = pts[i].sy;
      ab.data[o + 2] = samplesUx[i];
      ab.data[o + 3] = samplesUy[i];
      ab.data[o + 4] = m;
      ab.data[o + 5] = pts[i].phase;
      bi++;
    }
    ab.n = bi;

    drawArrowBatches(ctx, ab, bi, maxMag, t);

    const dragIdx = dragRef.current.active ? dragRef.current.index : -1;
    const hoverId = hoverIdRef.current;

    const ml = VIEW_MARGIN;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      let rx = renderPosRef.current.get(c.id)?.x ?? c.x;
      let ry = renderPosRef.current.get(c.id)?.y ?? c.y;
      if (dragIdx === i) {
        rx = c.x;
        ry = c.y;
      } else {
        rx += (c.x - rx) * kc;
        ry += (c.y - ry) * kc;
      }
      renderPosRef.current.set(c.id, { x: rx, y: ry });

      let sc = chargeScaleRef.current.get(c.id) ?? 1;
      const st = chargeScaleTargetRef.current.get(c.id) ?? 1;
      sc += (st - sc) * km;
      chargeScaleRef.current.set(c.id, sc);

      const cx = rx + ox;
      const cy = ry + oy;
      if (
        cx + CHARGE_RADIUS < -ml ||
        cx - CHARGE_RADIUS > lw + ml ||
        cy + CHARGE_RADIUS < -ml ||
        cy - CHARGE_RADIUS > lh + ml
      ) {
        continue;
      }

      const isPos = c.q > 0;
      const selected = c.id === selectedId;
      const hb = c.id === hoverId ? 1.06 : dragIdx === i ? 1.08 : 1;
      drawChargeNeon(ctx, cx, cy, CHARGE_RADIUS, isPos, sc, hb, selected);
    }

    ctx.restore();

    const rb = removeBtnWrapRef.current;
    if (rb && selectedId) {
      const sel = list.find((q) => q.id === selectedId);
      const rp = sel ? renderPosRef.current.get(sel.id) : null;
      if (sel && rp) {
        rb.style.left = `${rp.x + ox}px`;
        rb.style.top = `${rp.y + oy - CHARGE_RADIUS - 40}px`;
        rb.style.transform = "translateX(-50%)";
      }
    }
  }, [selectedId, getOrComputeField, redrawOffscreenBg, drawArrowBatches]);

  useEffect(() => {
    const tick = (ts) => {
      drawFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  const applyResize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    logicalSizeRef.current = { w, h };
    redrawOffscreenBg(Math.round(w), Math.round(h));
    bumpChargesStamp();
    drawFrame();
  }, [drawFrame, redrawOffscreenBg, bumpChargesStamp]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    applyResize();

    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = window.setTimeout(() => {
        applyResize();
      }, RESIZE_DEBOUNCE_MS);
    });

    ro.observe(wrap);
    return () => {
      ro.disconnect();
      window.clearTimeout(resizeDebounceRef.current);
    };
  }, [applyResize]);

  const syncChargesFromRef = () => {
    setCharges([...chargesRef.current]);
  };

  const removeSelected = useCallback(() => {
    if (selectedId == null) return;
    chargesRef.current = chargesRef.current.filter((c) => c.id !== selectedId);
    setSelectedId(null);
    syncChargesFromRef();
  }, [selectedId]);

  const resetView = useCallback(() => {
    viewOffsetRef.current = { x: 0, y: 0 };
    setViewOffset({ x: 0, y: 0 });
  }, []);

  const endMiddlePan = useCallback((canvas, pointerId) => {
    if (!middlePanRef.current.active) return;
    middlePanRef.current.active = false;
    middlePanRef.current.pointerId = null;
    document.body.style.cursor = "";
    setViewOffset({ ...viewOffsetRef.current });
    if (canvas && pointerId != null) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {}
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId != null) {
          e.preventDefault();
          chargesRef.current = chargesRef.current.filter((c) => c.id !== selectedId);
          setSelectedId(null);
          syncChargesFromRef();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const setSquish = (id, target) => {
    if (id) chargeScaleTargetRef.current.set(id, target);
  };

  const onPointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.button === 1) {
      e.preventDefault();
      middlePanRef.current = {
        active: true,
        lastX: e.clientX,
        lastY: e.clientY,
        pointerId: e.pointerId,
      };
      document.body.style.cursor = "grabbing";
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = sx - viewOffsetRef.current.x;
    const wy = sy - viewOffsetRef.current.y;

    const hit = findChargeAt(wx, wy, chargesRef.current);
    if (hit) {
      setSelectedId(hit.charge.id);
      setSquish(hit.charge.id, 0.88);
      dragRef.current = {
        active: true,
        index: hit.index,
        pointerId: e.pointerId,
        startX: sx,
        startY: sy,
        placeCandidate: false,
      };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    setSelectedId(null);
    dragRef.current = {
      active: false,
      index: -1,
      pointerId: e.pointerId,
      startX: sx,
      startY: sy,
      placeCandidate: true,
    };
  };

  const onPointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = sx - viewOffsetRef.current.x;
    const wy = sy - viewOffsetRef.current.y;

    setHudWorld({ x: wx, y: wy });

    if (middlePanRef.current.active && e.pointerId === middlePanRef.current.pointerId) {
      e.preventDefault();
      const m = middlePanRef.current;
      const dx = e.clientX - m.lastX;
      const dy = e.clientY - m.lastY;
      m.lastX = e.clientX;
      m.lastY = e.clientY;
      viewOffsetRef.current.x += dx;
      viewOffsetRef.current.y += dy;
      return;
    }

    const d = dragRef.current;
    if (!d.active && e.buttons === 0) {
      const h = findChargeAt(wx, wy, chargesRef.current);
      hoverIdRef.current = h ? h.charge.id : null;
    }

    if (d.active && d.index >= 0) {
      const list = chargesRef.current;
      const c = list[d.index];
      if (c) {
        c.x = wx;
        c.y = wy;
      }
      return;
    }

    if (d.placeCandidate) {
      const dx = sx - d.startX;
      const dy = sy - d.startY;
      if (Math.hypot(dx, dy) > CLICK_THRESHOLD) d.placeCandidate = false;
    }
  };

  const onPointerLeave = () => {
    hoverIdRef.current = null;
  };

  const onPointerUp = (e) => {
    const canvas = canvasRef.current;
    const d = dragRef.current;

    if (e.button === 1) {
      e.preventDefault();
      endMiddlePan(canvas, e.pointerId);
      return;
    }

    if (d.active && d.pointerId === e.pointerId) {
      const list = chargesRef.current;
      const c = list[d.index];
      if (c) setSquish(c.id, 1.06);
      d.active = false;
      d.index = -1;
      syncChargesFromRef();
      if (c) {
        window.setTimeout(() => setSquish(c.id, 1), 90);
      }
      if (canvas && d.pointerId != null) {
        try {
          canvas.releasePointerCapture(d.pointerId);
        } catch {}
      }
      d.pointerId = null;
      return;
    }

    if (d.placeCandidate && d.pointerId === e.pointerId && e.button === 0) {
      const cRect = canvas?.getBoundingClientRect();
      if (cRect) {
        const sx = e.clientX - cRect.left;
        const sy = e.clientY - cRect.top;
        const dx = sx - d.startX;
        const dy = sy - d.startY;
        if (Math.hypot(dx, dy) <= CLICK_THRESHOLD) {
          const wwx = sx - viewOffsetRef.current.x;
          const wwy = sy - viewOffsetRef.current.y;
          const id = nextId();
          const q = { id, x: wwx, y: wwy, q: placeSign };
          chargesRef.current = [...chargesRef.current, q];
          chargeScaleRef.current.set(id, 0.78);
          chargeScaleTargetRef.current.set(id, 1);
          syncChargesFromRef();
        }
      }
    }
    d.placeCandidate = false;
  };

  const onPointerCancel = (e) => {
    const canvas = canvasRef.current;
    if (middlePanRef.current.active) {
      endMiddlePan(canvas, e.pointerId);
    }
    const d = dragRef.current;
    if (d.active && d.pointerId === e.pointerId) {
      const list = chargesRef.current;
      const c = list[d.index];
      if (c) setSquish(c.id, 1);
      d.active = false;
      d.index = -1;
      syncChargesFromRef();
      if (canvas) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
      d.pointerId = null;
    }
    d.placeCandidate = false;
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-screen w-full overflow-hidden font-sans text-slate-100"
      style={{
        background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_MID} 50%, ${BG_BOTTOM} 100%)`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onAuxClick={(ev) => {
          if (ev.button === 1) ev.preventDefault();
        }}
      />

      <div
        className={`pointer-events-auto absolute left-4 top-4 z-10 max-w-[min(92vw,300px)] px-4 py-3 ${glassPanelClass}`}
        style={{ WebkitBackdropFilter: "blur(12px)" }}
      >
        <h1 className="mb-2 text-[13px] font-semibold tracking-tight text-slate-50">
          Electric Field Visualiser
        </h1>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Place mode
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPlaceSign(1)}
            className={glowBtn(
              placeSign === 1,
              `border-white/20 bg-[rgba(255,46,166,0.15)] text-pink-50 shadow-[0_0_22px_rgba(255,46,166,0.35)] ring-1 ring-pink-400/40`,
              "border-white/[0.08] bg-white/[0.05] text-slate-300 hover:border-pink-400/30 hover:bg-[rgba(255,46,166,0.08)] hover:shadow-[0_0_18px_rgba(255,46,166,0.2)]",
            )}
          >
            + Positive
          </button>
          <button
            type="button"
            onClick={() => setPlaceSign(-1)}
            className={glowBtn(
              placeSign === -1,
              `border-white/20 bg-[rgba(0,240,255,0.12)] text-cyan-50 shadow-[0_0_22px_rgba(0,240,255,0.3)] ring-1 ring-cyan-400/40`,
              "border-white/[0.08] bg-white/[0.05] text-slate-300 hover:border-cyan-400/35 hover:bg-[rgba(0,240,255,0.08)] hover:shadow-[0_0_18px_rgba(0,240,255,0.2)]",
            )}
          >
            − Negative
          </button>
        </div>
      </div>

      <div
        className={`pointer-events-auto absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2 text-right ${glassPanelClass} px-3 py-2.5`}
        style={{ WebkitBackdropFilter: "blur(12px)" }}
      >
        <button
          type="button"
          onClick={resetView}
          className="rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition-all duration-200 ease-out hover:border-white/25 hover:bg-white/[0.1] hover:shadow-[0_0_16px_rgba(255,255,255,0.12)]"
        >
          Reset view
        </button>
        <p className="max-w-[220px] text-[10px] leading-snug text-slate-400">
          <span className="text-slate-500">Pan:</span> middle mouse ·{" "}
          <span className="text-slate-500">Place / drag:</span> left click
        </p>
        <div className="font-mono text-[10px] tabular-nums text-slate-300">
          <span className="text-slate-500">x</span>{" "}
          <span className="text-slate-200">{hudWorld.x.toFixed(1)}</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="text-slate-500">y</span>{" "}
          <span className="text-slate-200">{hudWorld.y.toFixed(1)}</span>
        </div>
      </div>

      <div
        ref={removeBtnWrapRef}
        className={`pointer-events-auto absolute z-20 transition-opacity duration-200 ${selectedId ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            removeSelected();
          }}
          className="whitespace-nowrap rounded-xl border border-white/15 bg-[rgba(40,6,12,0.75)] px-2.5 py-1 text-[11px] font-semibold text-rose-100 shadow-lg backdrop-blur-md transition-all duration-200 ease-out hover:border-rose-400/40 hover:bg-[rgba(80,10,24,0.85)] hover:shadow-[0_0_20px_rgba(255,100,140,0.25)]"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
