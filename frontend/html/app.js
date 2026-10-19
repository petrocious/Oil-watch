/* ═════════════════════════════════════════════════════════════════
   OILWATCH — vanilla JS, no dependencies, no build step
   Fetches /api/prices from the FastAPI backend (proxied by NGINX).
   Falls back to realistic demo data if the backend is unreachable.
   ═════════════════════════════════════════════════════════════════ */

const API = '/api';
const DEMO_FALLBACK = true;   // use demo data if /api fails

const state = {
  series: {
    ho:   { label:'Heating Oil',   color:'#f5a524', unit:'$/gal', data:[] },
    ulsd: { label:'Diesel (ULSD)', color:'#3b82f6', unit:'$/gal', data:[] },
    rbob: { label:'Gasoline',      color:'#22c55e', unit:'$/gal', data:[] },
    wti:  { label:'WTI Crude',     color:'#94a3b8', unit:'$/bbl', data:[] },
  },
  active: 'ho',
  inputs: { burn:2.5, level:75, capacity:100, temp:35 },
};

/* ── Demo data generator (realistic oil price series) ─────── */
function genSeries(base, volatility, points=30){
  const out = [];
  let v = base;
  for (let i=points; i>0; i--){
    v += (Math.random() - 0.48) * volatility;
    v = Math.max(base*0.75, Math.min(base*1.30, v));
    out.push({
      t: Date.now() - i * 86400000,
      v: +v.toFixed(3),
    });
  }
  return out;
}
function loadDemo(){
  state.series.ho.data   = genSeries(2.85, 0.06);
  state.series.ulsd.data = genSeries(3.45, 0.07);
  state.series.rbob.data = genSeries(3.05, 0.09);
  state.series.wti.data  = genSeries(78.5, 1.4);
}

/* ── Fetch from backend ──────────────────────────────────── */
async function loadFromAPI(){
  try{
    const r = await fetch(`${API}/prices?days=30`, {cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j?.series){
      for (const k in state.series){
        if (Array.isArray(j.series[k]) && j.series[k].length){
          state.series[k].data = j.series[k];
        }
      }
      return true;
    }
  }catch(e){
    console.warn('API unreachable, using demo data:', e.message);
  }
  return false;
}

/* ═════════════════════════════════════════════════════════════
   Render — top ticker
   ═════════════════════════════════════════════════════════════ */
function renderTicker(){
  const map = { ho:'tick-ho', ulsd:'tick-ulsd', rbob:'tick-rbob', wti:'tick-wti' };
  for (const k in map){
    const last = state.series[k].data.at(-1);
    const prev = state.series[k].data.at(-2);
    if (!last) continue;
    const el = document.getElementById(map[k]);
    const diff = prev ? (last.v - prev.v) : 0;
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
    el.textContent = `${last.v.toFixed(2)} ${arrow}`;
    el.style.color = diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--fg)';
  }
  document.getElementById('tick-time').textContent =
    new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

/* ═════════════════════════════════════════════════════════════
   Render — Hero cards
   ═════════════════════════════════════════════════════════════ */
function flash(el){
  el.classList.remove('flash');
  void el.offsetWidth;       // force reflow to restart animation
  el.classList.add('flash');
}

function renderHero(){
  const ho = state.series.ho.data.at(-1);
  const prev = state.series.ho.data.at(-2);
  if (ho){
    const priceEl = document.getElementById('ho-price');
    priceEl.textContent = ho.v.toFixed(3);
    flash(priceEl);
    const d = prev ? ho.v - prev.v : 0;
    const el = document.getElementById('ho-delta');
    el.textContent = `${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(3)} vs yesterday`;
    el.className = 'hero-delta ' + (d>0?'up':d<0?'down':'');
  }
  const days = tankDaysLeft();
  const daysEl = document.getElementById('tank-days');
  daysEl.textContent = days.toFixed(1);
  document.getElementById('tank-status').textContent =
    days < 10 ? '⚠ order soon' : days < 20 ? 'ok — plan next fill' : 'comfortable';
}

/* ═════════════════════════════════════════════════════════════
   Tank math
   ═════════════════════════════════════════════════════════════ */
function effectiveBurn(){
  const t = state.inputs.temp;
  const factor = 1 + (35 - t) / 60;         // colder → more burn
  return state.inputs.burn * Math.max(0.5, factor);
}
function tankDaysLeft(){
  const b = effectiveBurn();
  return b > 0 ? state.inputs.level / b : 0;
}
function tankEmptyDate(){
  const d = new Date();
  d.setDate(d.getDate() + Math.round(tankDaysLeft()));
  return d;
}

/* ═════════════════════════════════════════════════════════════
   Buy signal
   ═════════════════════════════════════════════════════════════ */
function computeSignal(){
  const ho = state.series.ho.data;
  if (ho.length < 5) return { verdict:'HOLD', reason:'not enough data', cls:'hold' };
  const last = ho.at(-1).v;
  const prices = ho.map(p=>p.v);
  const low = Math.min(...prices), high = Math.max(...prices);
  const avg = prices.reduce((a,b)=>a+b,0) / prices.length;
  const pos = (last - low) / (high - low || 1);
  const days = tankDaysLeft();

  if (days < 7)
    return { verdict:'BUY NOW', reason:`tank empties in ${days.toFixed(1)} days`, cls:'buy' };
  if (pos < 0.20)
    return { verdict:'BUY', reason:`in the cheapest 20% of the last 30 days (${(pos*100).toFixed(0)}% from low)`, cls:'buy' };
  if (pos > 0.80)
    return { verdict:'WAIT', reason:`in the most expensive 20% of the last 30 days (${(pos*100).toFixed(0)}% from low)`, cls:'wait' };
  return { verdict:'HOLD', reason:`near the 30-day average ($${avg.toFixed(3)})`, cls:'hold' };
}
function renderSignal(){
  const s = computeSignal();
  const t = document.getElementById('signal-text');
  t.textContent = s.verdict;
  t.className = s.cls;
  document.getElementById('signal-reason').textContent = s.reason;
}

/* ═════════════════════════════════════════════════════════════
   Canvas — price line chart
   ═════════════════════════════════════════════════════════════ */
function drawPriceChart(){
  const c = document.getElementById('priceChart');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = 280;
  c.width = w*dpr; c.height = h*dpr; c.style.height = h+'px';
  const ctx = c.getContext('2d'); ctx.scale(dpr,dpr);

  const s = state.series[state.active];
  const data = s.data;
  if (!data.length) return;

  const pad = { l:56, r:20, t:20, b:32 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;

  const vals = data.map(d=>d.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const yMin = min - range*0.12, yMax = max + range*0.12;
  const yR = yMax - yMin;

  const x = i => pad.l + (i/(data.length-1))*iw;
  const y = v => pad.t + ih - ((v - yMin)/yR)*ih;

  // Grid
  ctx.strokeStyle = '#1e2a3f'; ctx.lineWidth = 1;
  ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = '#8b98ad';
  for (let i=0; i<=4; i++){
    const yy = pad.t + (i/4)*ih;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w-pad.r, yy); ctx.stroke();
    const val = yMax - (i/4)*yR;
    ctx.fillText(val.toFixed(2), 10, yy+4);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t+ih);
  grad.addColorStop(0, s.color+'66');
  grad.addColorStop(1, s.color+'00');
  ctx.beginPath();
  ctx.moveTo(x(0), y(data[0].v));
  data.forEach((d,i)=>ctx.lineTo(x(i), y(d.v)));
  ctx.lineTo(x(data.length-1), pad.t+ih);
  ctx.lineTo(x(0), pad.t+ih);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Line with subtle glow
  ctx.shadowColor = s.color; ctx.shadowBlur = 12;
  ctx.beginPath();
  data.forEach((d,i)=> i ? ctx.lineTo(x(i), y(d.v)) : ctx.moveTo(x(i), y(d.v)));
  ctx.strokeStyle = s.color; ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round'; ctx.stroke();
  ctx.shadowBlur = 0;

  // Last dot
  const li = data.length - 1;
  ctx.beginPath();
  ctx.arc(x(li), y(data[li].v), 10, 0, Math.PI*2);
  ctx.fillStyle = s.color + '33'; ctx.fill();
  ctx.beginPath();
  ctx.arc(x(li), y(data[li].v), 4, 0, Math.PI*2);
  ctx.fillStyle = s.color; ctx.fill();

  // X labels
  ctx.fillStyle = '#8b98ad';
  data.forEach((d,i)=>{
    if (i % 5 === 0 || i === li){
      const dd = new Date(d.t);
      ctx.fillText(`${dd.getMonth()+1}/${dd.getDate()}`, x(i)-16, h-10);
    }
  });

  // Footer
  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
  document.getElementById('chart-foot').textContent =
    `30-day range for ${s.label}: $${min.toFixed(3)} – $${max.toFixed(3)} · average $${avg.toFixed(3)} · current $${vals.at(-1).toFixed(3)}`;
}

/* ═════════════════════════════════════════════════════════════
   Canvas — tank depletion
   ═════════════════════════════════════════════════════════════ */
function drawTankChart(){
  const c = document.getElementById('tankChart');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = 240;
  c.width = w*dpr; c.height = h*dpr; c.style.height = h+'px';
  const ctx = c.getContext('2d'); ctx.scale(dpr,dpr);

  const { level, capacity } = state.inputs;
  const burn = effectiveBurn();
  const days = Math.min(60, Math.max(1, Math.ceil(level / burn)));

  const pad = { l:56, r:20, t:20, b:32 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;

  ctx.strokeStyle = '#1e2a3f'; ctx.lineWidth = 1;
  ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = '#8b98ad';
  for (let i=0; i<=4; i++){
    const yy = pad.t + (i/4)*ih;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w-pad.r, yy); ctx.stroke();
    ctx.fillText(`${Math.round(capacity - (i/4)*capacity)} gal`, 10, yy+4);
  }

  const x = i => pad.l + (i/Math.max(1,days))*iw;
  const y = v => pad.t + ih - (v/capacity)*ih;

  // Danger zone under 15%
  ctx.fillStyle = 'rgba(255,77,77,.08)';
  ctx.fillRect(pad.l, y(capacity*0.15), iw, ih - (y(capacity*0.15)-pad.t));

  // Depletion line with gradient + glow
  const grad = ctx.createLinearGradient(pad.l, 0, pad.l+iw, 0);
  grad.addColorStop(0, '#22c55e');
  grad.addColorStop(1, '#f5a524');

  ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let i=0; i<=days; i++){
    const v = Math.max(0, level - burn*i);
    i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v));
  }
  ctx.strokeStyle = grad; ctx.lineWidth = 3;
  ctx.lineJoin = 'round'; ctx.stroke();
  ctx.shadowBlur = 0;

  // Empty marker
  const ex = x(days);
  ctx.beginPath();
  ctx.moveTo(ex, pad.t); ctx.lineTo(ex, pad.t+ih);
  ctx.strokeStyle = '#ff4d4d'; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  ctx.fillText('empty', ex-22, pad.t+14);

  document.getElementById('tank-foot').textContent =
    `At ${burn.toFixed(2)} gal/day, your ${level} gal will last ~${days} days — empties on ${tankEmptyDate().toLocaleDateString()}.`;
}

/* ═════════════════════════════════════════════════════════════
   Matrix — 28-day forecast
   ═════════════════════════════════════════════════════════════ */
function renderMatrix(){
  const wrap = document.getElementById('matrix');
  const ho = state.series.ho.data;
  if (ho.length < 3) return;

  const forecast = [];
  let base = ho.at(-1).v;
  for (let i=0; i<28; i++){
    base += (Math.random()-0.5)*0.08 + Math.sin(i/3)*0.03;
    forecast.push(+base.toFixed(3));
  }
  const min = Math.min(...forecast), max = Math.max(...forecast);

  wrap.innerHTML = '';
  forecast.forEach((p, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const rel = (p - min) / (max - min || 1);
    const cls = rel < 0.33 ? 'best' : rel < 0.66 ? 'ok' : 'bad';
    const div = document.createElement('div');
    div.className = 'cell ' + cls;
    div.style.animationDelay = (i*25) + 'ms';
    div.innerHTML = `<div class="d">${d.getMonth()+1}/${d.getDate()}</div><div class="p">$${p.toFixed(2)}</div>`;
    div.title = `${d.toDateString()} — forecast $${p}/gal`;
    wrap.appendChild(div);
  });
}

/* ═════════════════════════════════════════════════════════════
   Comparison
   ═════════════════════════════════════════════════════════════ */
function renderCompare(){
  const wrap = document.getElementById('compare');
  const order = ['ho','ulsd','rbob','wti'];
  const vals = order.map(k => state.series[k].data.at(-1)?.v || 0);
  const max = Math.max(...vals);

  wrap.innerHTML = '';
  order.forEach((k, i) => {
    const s = state.series[k];
    const v = vals[i];
    const prev = state.series[k].data.at(-2)?.v || v;
    const d = v - prev;
    const div = document.createElement('div');
    div.className = 'cmp ' + k;
    div.innerHTML = `
      <h3>${s.label}</h3>
      <div class="big">$${v.toFixed(2)}<span class="u">${s.unit}</span></div>
      <div class="sub" style="color:${d>=0?'var(--red)':'var(--green)'}">
        ${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(3)} vs yesterday
      </div>
      <div class="bar"><i style="width:0%"></i></div>
    `;
    wrap.appendChild(div);
    // Animate bar width
    requestAnimationFrame(()=>{
      div.querySelector('.bar > i').style.width = (v/max)*100 + '%';
    });
  });
}

/* ═════════════════════════════════════════════════════════════
   Wire inputs
   ═════════════════════════════════════════════════════════════ */
function wireInputs(){
  const map = { 'in-burn':'burn', 'in-level':'level', 'in-cap':'capacity', 'in-temp':'temp' };
  const out = { burn:'out-burn', level:'out-level', capacity:'out-cap', temp:'out-temp' };

  for (const id in map){
    const key = map[id];
    const el  = document.getElementById(id);
    el.value = state.inputs[key];
    document.getElementById(out[key]).textContent = state.inputs[key];

    el.addEventListener('input', e => {
      state.inputs[key] = +e.target.value;
      document.getElementById(out[key]).textContent = e.target.value;
      renderHero();
      renderSignal();
      drawTankChart();
    });
  }
}

/* ═════════════════════════════════════════════════════════════
   Legend buttons
   ═════════════════════════════════════════════════════════════ */
function wireLegend(){
  document.querySelectorAll('.lg').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.active = btn.dataset.series;
      drawPriceChart();
    });
  });
}

/* ═════════════════════════════════════════════════════════════
   Reveal on scroll
   ═════════════════════════════════════════════════════════════ */
function wireReveal(){
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, {threshold:.15});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* ═════════════════════════════════════════════════════════════
   Mouse glow (subtle parallax)
   ═════════════════════════════════════════════════════════════ */
function wireMouseGlow(){
  window.addEventListener('mousemove', e => {
    document.body.style.setProperty('--mx', (e.clientX/window.innerWidth*100)+'%');
    document.body.style.setProperty('--my', (e.clientY/window.innerHeight*100)+'%');
  });
}

/* ═════════════════════════════════════════════════════════════
   Boot
   ═════════════════════════════════════════════════════════════ */
async function boot(){
  const ok = await loadFromAPI();
  if (!ok && DEMO_FALLBACK) loadDemo();

  renderTicker();
  renderHero();
  renderSignal();
  drawPriceChart();
  drawTankChart();
  renderMatrix();
  renderCompare();
  wireInputs();
  wireLegend();
  wireReveal();
  wireMouseGlow();

  let t;
  window.addEventListener('resize', ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{ drawPriceChart(); drawTankChart(); }, 120);
  });

  setInterval(renderTicker, 30000);
}
boot();