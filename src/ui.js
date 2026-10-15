import { BIKES, UPS, upCost, PAL, NAMES, MAPS, VISORS, FLAME_HEX, persist } from './data.js';

const $ = id => document.getElementById(id);
const hx = c => '#' + c.toString(16).padStart(6, '0');
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ctx: { save, rebuild(), applyMap(i), sfx(fn), audio }
export function createGarage(ctx) {
  const save = ctx.save, look = save.look;
  const TABS = ['MOTO', 'PINTURA', 'PILOTO', 'MEJORAS', 'MAPA'];
  let tab = 0;
  const body = $('gBody'), tabsEl = $('gTabs');

  const changed = (rebuild = true) => { persist(save); if (rebuild) ctx.rebuild(); render(); };
  const ok = () => ctx.sfx(() => ctx.audio.click());

  function swatches(label, list, key, none) {
    const row = mk('div', 'grow'); row.appendChild(mk('div', 'glab', label));
    const sw = mk('div', 'gsw');
    list.forEach((c, i) => {
      const b = mk('button', 'sw' + (look[key] === i ? ' sel' : ''));
      if (none && i === 0) { b.textContent = '✕'; b.style.background = '#333'; } else b.style.background = hx(c);
      b.addEventListener('click', () => { look[key] = i; ok(); changed(); });
      sw.appendChild(b);
    });
    row.appendChild(sw); body.appendChild(row);
  }
  function cycle(label, key, opts) {
    const row = mk('div', 'grow'); row.appendChild(mk('div', 'glab', label));
    const b = mk('button', 'mb gcyc', opts[look[key]] || opts[0]);
    b.addEventListener('click', () => { look[key] = (look[key] + 1) % opts.length; ok(); changed(); });
    row.appendChild(b); body.appendChild(row);
  }
  const bar = (v, max) => '█'.repeat(Math.round(v * 10 / max)) + '░'.repeat(10 - Math.round(v * 10 / max));

  function render() {
    $('gMoney').textContent = '🪙 ' + save.money;
    tabsEl.innerHTML = '';
    TABS.forEach((n, i) => {
      const b = mk('button', 'gtab' + (i === tab ? ' sel' : ''), n);
      b.addEventListener('click', () => { tab = i; ok(); render(); });
      tabsEl.appendChild(b);
    });
    body.innerHTML = '';

    if (tab === 0) {
      BIKES.forEach((b, i) => {
        const owned = save.owned.includes(i), cur = save.bike === i;
        const card = mk('button', 'gcard' + (cur ? ' sel' : ''));
        card.appendChild(mk('div', 'gname', b.name));
        card.appendChild(mk('div', 'gdesc', b.desc + '  ·  ' + (cur ? 'EQUIPADA' : owned ? 'TUYA' : '🪙 ' + b.price)));
        card.appendChild(mk('div', 'gstat', 'VEL ' + bar(b.vmax, 90) + '  ACE ' + bar(b.acc, 32)));
        card.appendChild(mk('div', 'gstat', 'AGA ' + bar(b.hand, 1.4) + '  EQU ' + bar(b.bal, 1.4)));
        card.addEventListener('click', () => {
          if (owned) { save.bike = i; ok(); changed(); return; }
          if (save.money >= b.price) { save.money -= b.price; save.owned.push(i); save.bike = i; ctx.sfx(() => ctx.audio.buy()); changed(); }
          else ctx.sfx(() => ctx.audio.deny());
        });
        body.appendChild(card);
      });
    } else if (tab === 1) {
      swatches('COLOR', PAL.paint, 'paint');
      swatches('DETALLES', PAL.accent, 'accent');
      swatches('RINES', PAL.rim, 'rim');
      swatches('NEÓN BAJO LA MOTO', PAL.neon, 'neon', true);
      swatches('LLAMAS DEL ESCAPE', FLAME_HEX, 'flame');
    } else if (tab === 2) {
      cycle('PILOTO', 'sex', ['ELLA', 'ÉL']);
      swatches('TRAJE', PAL.suit, 'suit');
      swatches('FRANJAS', PAL.stripe, 'stripe');
      cycle('ESTILO DE TRAJE', 'suitStyle', ['LISO', 'FRANJAS', 'PROTECCIONES']);
      swatches('CASCO', PAL.helmet, 'helmet');
      cycle('DISEÑO DE CASCO', 'helmStyle', ['LISO', 'FRANJA', 'CRESTA']);
      swatches('VISERA', VISORS.map(v => v.c), 'visor');
      swatches('PELO', PAL.hair, 'hair');
      cycle('NOMBRE EN LA ESPALDA', 'name', NAMES);
    } else if (tab === 3) {
      const lv = save.ups[save.bike] || (save.ups[save.bike] = [0, 0, 0, 0]);
      body.appendChild(mk('div', 'glab', BIKES[save.bike].name));
      UPS.forEach((u, i) => {
        const row = mk('div', 'gup');
        row.appendChild(mk('div', 'gname', u.n + '  ' + '●'.repeat(lv[i]) + '○'.repeat(5 - lv[i])));
        row.appendChild(mk('div', 'gdesc', u.d));
        const cost = upCost(lv[i]);
        const b = mk('button', 'mb', lv[i] >= 5 ? 'MÁXIMO' : 'MEJORAR  🪙 ' + cost);
        b.addEventListener('click', () => {
          if (lv[i] >= 5) return;
          if (save.money >= cost) { save.money -= cost; lv[i]++; ctx.sfx(() => ctx.audio.buy()); changed(false); }
          else ctx.sfx(() => ctx.audio.deny());
        });
        row.appendChild(b); body.appendChild(row);
      });
      body.appendChild(mk('div', 'gdesc', 'Gana monedas recogiendo 🪙 en la carretera y con tu puntuación.'));
    } else {
      MAPS.forEach((m, i) => {
        const card = mk('button', 'gcard' + (save.map === i ? ' sel' : ''));
        card.appendChild(mk('div', 'gname', m.name));
        card.style.borderLeftColor = hx(m.horizon);
        card.addEventListener('click', () => { save.map = i; ok(); persist(save); ctx.applyMap(i); render(); });
        body.appendChild(card);
      });
      const rc = mk('button', 'gcard' + (save.map === MAPS.length ? ' sel' : ''));
      rc.appendChild(mk('div', 'gname', 'ALEATORIO'));
      rc.appendChild(mk('div', 'gdesc', 'un mapa distinto en cada partida'));
      rc.addEventListener('click', () => { save.map = MAPS.length; ok(); persist(save); ctx.applyMap(save.map); render(); });
      body.appendChild(rc);
    }
  }
  return { render, open() { tab = 0; render(); } };
}
