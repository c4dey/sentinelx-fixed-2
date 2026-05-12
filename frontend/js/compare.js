'use strict';

// ═══════════════════════════════════════════════════════════════
//  COMPARE — shared helpers
// ═══════════════════════════════════════════════════════════════

// Normalize any period string → "YYYY-MM"
function cmpNormPeriod(p) {
  if (!p) return '';
  if (/^\d{4}-\d{2}$/.test(p))   return p;
  const dm = p.match(/^(\d{4})-(\d{2})/);
  if (dm) return `${dm[1]}-${dm[2]}`;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const lm = p.match(/^([A-Za-z]{3})[-\s](\d{2,4})$/i);
  if (lm) {
    const mi = MONTHS.findIndex(m => m.toLowerCase() === lm[1].toLowerCase());
    if (mi >= 0) return `${lm[2].length===2?'20'+lm[2]:lm[2]}-${String(mi+1).padStart(2,'0')}`;
  }
  return p;
}

function cmpFmtPeriod(p) {
  const norm = cmpNormPeriod(p);
  const m    = norm.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p || '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m[2])-1]} ${m[1]}`;
}

function cmpDelta(a, b, label, higherIsBetter = false) {
  const diff = b - a;
  if (diff === 0) return `<span style="color:var(--text3)">± 0 ${label}</span>`;
  const arrow = diff > 0 ? '▲' : '▼';
  const color = (higherIsBetter ? diff > 0 : diff < 0) ? 'var(--green)' : 'var(--critical)';
  return `<span style="color:${color}">${arrow} ${Math.abs(diff)} ${label}</span>`;
}

function cmpPctDelta(a, b) {
  const diff = b - a;
  if (diff === 0) return `<span style="color:var(--text3)">± 0%</span>`;
  const arrow = diff > 0 ? '▲' : '▼';
  const color = diff > 0 ? 'var(--green)' : 'var(--critical)';
  return `<span style="color:${color}">${arrow} ${Math.abs(diff)}%</span>`;
}

function cmpBar(pct, color) {
  const c = color || (pct >= 100 ? 'var(--green)' : pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--high)' : 'var(--critical)');
  return `<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-top:4px">
    <div style="height:100%;width:${Math.min(pct,100)}%;background:${c};border-radius:3px;transition:width .4s"></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  VM COMPARE
// ═══════════════════════════════════════════════════════════════
let vmCmpA = null, vmCmpB = null;

function vmRenderCompareTab() {
  // Collect all unique months from vmData
  const months = [...new Set(vmData.map(r => cmpNormPeriod(r.period)).filter(Boolean))].sort();

  const selA = document.getElementById("vm-cmp-sel-a");
  const selB = document.getElementById("vm-cmp-sel-b");
  if (!selA || !selB) return;

  const makeOptions = (selected) =>
    months.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${cmpFmtPeriod(m)}</option>`).join('');

  selA.innerHTML = `<option value="">— Select period —</option>` + makeOptions(vmCmpA);
  selB.innerHTML = `<option value="">— Select period —</option>` + makeOptions(vmCmpB);

  if (months.length >= 2 && !vmCmpA && !vmCmpB) {
    vmCmpA = months[months.length - 2];
    vmCmpB = months[months.length - 1];
    selA.value = vmCmpA;
    selB.value = vmCmpB;
  }

  vmRunCompare();
}

function vmSetCmpPeriod(which, val) {
  if (which === 'a') vmCmpA = val || null;
  else               vmCmpB = val || null;
  vmRunCompare();
}

function vmRunCompare() {
  const _selA = document.getElementById("vm-cmp-sel-a"); if (_selA) vmCmpA = _selA.value || null;
  const _selB = document.getElementById("vm-cmp-sel-b"); if (_selB) vmCmpB = _selB.value || null;
  const result = document.getElementById("vm-cmp-results");
  if (!result) return;

  if (!vmCmpA || !vmCmpB) {
    result.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">Select two periods to compare</div>`;
    return;
  }
  if (vmCmpA === vmCmpB) {
    result.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">Select two <em>different</em> periods</div>`;
    return;
  }

  const rowsA = vmData.filter(r => cmpNormPeriod(r.period) === vmCmpA);
  const rowsB = vmData.filter(r => cmpNormPeriod(r.period) === vmCmpB);

  if (!rowsA.length && !rowsB.length) {
    result.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">No records found for either period</div>`;
    return;
  }

  const countSev = (rows, sev) => rows.filter(r => r.severity === sev).length;
  const countSt  = (rows, st)  => rows.filter(r => r.status  === st ).length;
  const sevs   = ['Critical','High','Medium','Low'];
  const stats  = ['Open','In Progress','Resolved'];

  // Per-asset breakdown
  const assetsA = {}, assetsB = {};
  rowsA.forEach(r => { if (!assetsA[r.asset]) assetsA[r.asset] = []; assetsA[r.asset].push(r); });
  rowsB.forEach(r => { if (!assetsB[r.asset]) assetsB[r.asset] = []; assetsB[r.asset].push(r); });
  const allAssets = [...new Set([...Object.keys(assetsA), ...Object.keys(assetsB)])].sort();

  // New / Resolved / Persisted vulnerabilities
  const idsA = new Set(rowsA.map(r => r.id));
  const idsB = new Set(rowsB.map(r => r.id));
  const newVulns      = rowsB.filter(r => !idsA.has(r.id));
  const resolvedVulns = rowsA.filter(r => !idsB.has(r.id));
  const persistedIds  = [...idsA].filter(id => idsB.has(id));

  const labelA = cmpFmtPeriod(vmCmpA);
  const labelB = cmpFmtPeriod(vmCmpB);

  result.innerHTML = `
    <!-- Header summary cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      ${[
        { label:'Total ('+labelA+')', val:rowsA.length, color:'var(--text2)' },
        { label:'Total ('+labelB+')', val:rowsB.length, color:'var(--accent)' },
        { label:'New vulns',    val:newVulns.length,      color:'var(--critical)' },
        { label:'Resolved',     val:resolvedVulns.length, color:'var(--green)' },
        { label:'Persisted',    val:persistedIds.length,  color:'var(--high)' },
      ].map(c => `<div class="stat-card" style="padding:14px 16px">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value" style="color:${c.color};font-size:22px">${c.val}</div>
      </div>`).join('')}
    </div>

    <!-- Severity breakdown side-by-side -->
    <div class="panel" style="margin-bottom:16px;padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.07em">Severity Breakdown</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        ${['a','b'].map(side => {
          const rows  = side === 'a' ? rowsA : rowsB;
          const label = side === 'a' ? labelA : labelB;
          return `<div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-bottom:10px">${label}</div>
            ${sevs.map(s => {
              const n   = countSev(rows, s);
              const pct = rows.length ? Math.round(n/rows.length*100) : 0;
              const col = {Critical:'var(--critical)',High:'var(--high)',Medium:'var(--medium)',Low:'var(--low)'}[s];
              return `<div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                  <span style="color:${col}">${s}</span>
                  <span style="font-family:var(--mono);color:var(--text2)">${n} <span style="color:var(--text3)">(${pct}%)</span></span>
                </div>
                ${cmpBar(pct, col)}
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
      <!-- Delta row -->
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-bottom:8px">Changes (${labelA} → ${labelB})</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${sevs.map(s => {
            const nA = countSev(rowsA, s), nB = countSev(rowsB, s);
            return `<div style="font-size:12px"><span style="color:var(--text3)">${s}: </span>${cmpDelta(nA, nB, '', false)}</div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Status breakdown -->
    <div class="panel" style="margin-bottom:16px;padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.07em">Status Breakdown</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        ${['a','b'].map(side => {
          const rows  = side === 'a' ? rowsA : rowsB;
          const label = side === 'a' ? labelA : labelB;
          return `<div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-bottom:10px">${label}</div>
            ${stats.map(s => {
              const n   = countSt(rows, s);
              const pct = rows.length ? Math.round(n/rows.length*100) : 0;
              const col = {Open:'var(--critical)','In Progress':'var(--high)',Resolved:'var(--green)'}[s];
              return `<div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
                  <span style="color:${col}">${s}</span>
                  <span style="font-family:var(--mono);color:var(--text2)">${n}</span>
                </div>
                ${cmpBar(pct, col)}
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Per-asset comparison table -->
    ${allAssets.length ? `
    <div class="panel" style="margin-bottom:16px;padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.07em">Per-Asset Comparison</div>
      <div style="overflow-x:auto">
        <table class="vuln-table" style="min-width:540px">
          <thead><tr>
            <th>Asset</th>
            <th>${labelA}</th>
            <th>${labelB}</th>
            <th>Change</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            ${allAssets.map(a => {
              const rA = assetsA[a] || [], rB = assetsB[a] || [];
              const critA = countSev(rA,'Critical'), critB = countSev(rB,'Critical');
              const stat  = rA.length === 0 ? '🆕 New' : rB.length === 0 ? '✅ Fixed' : critB < critA ? '📉 Improved' : critB > critA ? '📈 Worsened' : '— Same';
              const statColor = rA.length===0?'var(--accent)':rB.length===0?'var(--green)':critB<critA?'var(--green)':critB>critA?'var(--critical)':'var(--text3)';
              return `<tr>
                <td style="font-family:var(--mono);font-size:12px">${a}</td>
                <td style="font-family:var(--mono);font-size:12px;color:var(--text2)">${rA.length} vulns${critA ? ` <span style="color:var(--critical)">(${critA}C)</span>` : ''}</td>
                <td style="font-family:var(--mono);font-size:12px;color:var(--text2)">${rB.length} vulns${critB ? ` <span style="color:var(--critical)">(${critB}C)</span>` : ''}</td>
                <td>${cmpDelta(rA.length, rB.length, 'vulns', false)}</td>
                <td style="color:${statColor};font-size:12px">${stat}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- New vulnerabilities list -->
    ${newVulns.length ? `
    <div class="panel" style="margin-bottom:16px;padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--critical);margin-bottom:12px;text-transform:uppercase;letter-spacing:.07em">▲ New in ${labelB} (${newVulns.length})</div>
      <div style="overflow-x:auto">
        <table class="vuln-table">
          <thead><tr><th>ID</th><th>Name</th><th>Asset</th><th>Severity</th><th>Status</th></tr></thead>
          <tbody>${newVulns.map(r => `<tr>
            <td class="mono-text">${r.id}</td>
            <td>${r.name}</td>
            <td class="mono-text" style="color:var(--text2)">${r.asset}</td>
            <td><span class="sev-badge sev-${r.severity.toLowerCase()}">${r.severity}</span></td>
            <td>${r.status}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Resolved vulnerabilities list -->
    ${resolvedVulns.length ? `
    <div class="panel" style="padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--green);margin-bottom:12px;text-transform:uppercase;letter-spacing:.07em">✓ Resolved from ${labelA} (${resolvedVulns.length})</div>
      <div style="overflow-x:auto">
        <table class="vuln-table">
          <thead><tr><th>ID</th><th>Name</th><th>Asset</th><th>Severity</th></tr></thead>
          <tbody>${resolvedVulns.map(r => `<tr>
            <td class="mono-text">${r.id}</td>
            <td>${r.name}</td>
            <td class="mono-text" style="color:var(--text2)">${r.asset}</td>
            <td><span class="sev-badge sev-${r.severity.toLowerCase()}">${r.severity}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}

// ═══════════════════════════════════════════════════════════════
//  ESC COMPARE
// ═══════════════════════════════════════════════════════════════
let escCmpA = null, escCmpB = null;

function escRenderCompareTab() {
  // Collect unique months from escRecords (YYYY-MM)
  const months = [...new Set(escRecords.map(r => (r.date || '').slice(0,7)).filter(Boolean))].sort();

  const selA = document.getElementById("esc-cmp-sel-a");
  const selB = document.getElementById("esc-cmp-sel-b");
  if (!selA || !selB) return;

  const makeOptions = (selected) =>
    months.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${cmpFmtPeriod(m)}</option>`).join('');

  selA.innerHTML = `<option value="">— Select period —</option>` + makeOptions(escCmpA);
  selB.innerHTML = `<option value="">— Select period —</option>` + makeOptions(escCmpB);

  if (months.length >= 2 && !escCmpA && !escCmpB) {
    escCmpA = months[months.length - 2];
    escCmpB = months[months.length - 1];
    selA.value = escCmpA;
    selB.value = escCmpB;
  }

  escRunCompare();
}

function escSetCmpPeriod(which, val) {
  if (which === 'a') escCmpA = val || null;
  else               escCmpB = val || null;
  escRunCompare();
}

function escRunCompare() {
  const _selA = document.getElementById("esc-cmp-sel-a"); if (_selA) escCmpA = _selA.value || null;
  const _selB = document.getElementById("esc-cmp-sel-b"); if (_selB) escCmpB = _selB.value || null;
  const result = document.getElementById("esc-cmp-results");
  if (!result) return;

  if (!escCmpA || !escCmpB) {
    result.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">Select two periods to compare</div>`;
    return;
  }
  if (escCmpA === escCmpB) {
    result.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">Select two <em>different</em> periods</div>`;
    return;
  }

  const rowsA = escRecords.filter(r => (r.date||'').startsWith(escCmpA));
  const rowsB = escRecords.filter(r => (r.date||'').startsWith(escCmpB));

  if (!rowsA.length && !rowsB.length) {
    result.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">No records found for either period</div>`;
    return;
  }

  const labelA = cmpFmtPeriod(escCmpA);
  const labelB = cmpFmtPeriod(escCmpB);

  // Aggregate per period
  const agg = rows => ({
    totalEP:   rows.reduce((s,r) => s + r.totalEP,   0),
    totalSrv:  rows.reduce((s,r) => s + r.totalSrv,  0),
    updatedEP: rows.reduce((s,r) => s + r.updatedEP, 0),
    updatedSrv:rows.reduce((s,r) => s + r.updatedSrv,0),
  });
  const aggA = agg(rowsA), aggB = agg(rowsB);
  const pctA_ep  = aggA.totalEP  ? Math.round(aggA.updatedEP  / aggA.totalEP  * 100) : 0;
  const pctB_ep  = aggB.totalEP  ? Math.round(aggB.updatedEP  / aggB.totalEP  * 100) : 0;
  const pctA_srv = aggA.totalSrv ? Math.round(aggA.updatedSrv / aggA.totalSrv * 100) : 0;
  const pctB_srv = aggB.totalSrv ? Math.round(aggB.updatedSrv / aggB.totalSrv * 100) : 0;

  // Per-asset data
  const assetsA = {}, assetsB = {};
  rowsA.forEach(r => { if (!assetsA[r.asset]) assetsA[r.asset]={tEP:0,tSrv:0,uEP:0,uSrv:0}; assetsA[r.asset].tEP+=r.totalEP; assetsA[r.asset].tSrv+=r.totalSrv; assetsA[r.asset].uEP+=r.updatedEP; assetsA[r.asset].uSrv+=r.updatedSrv; });
  rowsB.forEach(r => { if (!assetsB[r.asset]) assetsB[r.asset]={tEP:0,tSrv:0,uEP:0,uSrv:0}; assetsB[r.asset].tEP+=r.totalEP; assetsB[r.asset].tSrv+=r.totalSrv; assetsB[r.asset].uEP+=r.updatedEP; assetsB[r.asset].uSrv+=r.updatedSrv; });
  const allAssets = [...new Set([...Object.keys(assetsA), ...Object.keys(assetsB)])].sort();

  // New / dropped / persisted assets
  const newAssets     = allAssets.filter(a =>  assetsB[a] && !assetsA[a]);
  const droppedAssets = allAssets.filter(a => !assetsB[a] &&  assetsA[a]);
  const keptAssets    = allAssets.filter(a =>  assetsB[a] &&  assetsA[a]);

  result.innerHTML = `
    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px">
      ${[
        { label:'EP Updated ('+labelA+')', val:pctA_ep+'%',  color: pctA_ep>=80?'var(--green)':pctA_ep>=50?'var(--high)':'var(--critical)' },
        { label:'EP Updated ('+labelB+')', val:pctB_ep+'%',  color: pctB_ep>=80?'var(--green)':pctB_ep>=50?'var(--high)':'var(--critical)' },
        { label:'SRV Updated ('+labelA+')',val:pctA_srv+'%', color: pctA_srv>=80?'var(--green)':pctA_srv>=50?'var(--high)':'var(--critical)' },
        { label:'SRV Updated ('+labelB+')',val:pctB_srv+'%', color: pctB_srv>=80?'var(--green)':pctB_srv>=50?'var(--high)':'var(--critical)' },
        { label:'EP Δ',  val: (pctB_ep-pctA_ep >= 0 ? '+' : '') + (pctB_ep-pctA_ep)+'%',   color: pctB_ep>=pctA_ep ? 'var(--green)' : 'var(--critical)' },
        { label:'SRV Δ', val: (pctB_srv-pctA_srv >= 0 ? '+' : '') + (pctB_srv-pctA_srv)+'%', color: pctB_srv>=pctA_srv ? 'var(--green)' : 'var(--critical)' },
      ].map(c => `<div class="stat-card" style="padding:14px 16px">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value" style="color:${c.color};font-size:20px">${c.val}</div>
      </div>`).join('')}
    </div>

    <!-- EP & SRV compliance bars side-by-side -->
    <div class="panel" style="margin-bottom:16px;padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.07em">Compliance Overview</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        ${['Endpoints','Servers'].map((type, ti) => {
          const pA = ti === 0 ? pctA_ep  : pctA_srv;
          const pB = ti === 0 ? pctB_ep  : pctB_srv;
          const tA = ti === 0 ? aggA.totalEP  : aggA.totalSrv;
          const tB = ti === 0 ? aggB.totalEP  : aggB.totalSrv;
          const uA = ti === 0 ? aggA.updatedEP : aggA.updatedSrv;
          const uB = ti === 0 ? aggB.updatedEP : aggB.updatedSrv;
          return `<div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text2);margin-bottom:10px">${type}</div>
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span style="color:var(--text3)">${labelA}</span>
                <span style="font-family:var(--mono);color:${pA>=80?'var(--green)':pA>=50?'var(--high)':'var(--critical)'}">${uA}/${tA} (${pA}%)</span>
              </div>
              ${cmpBar(pA)}
            </div>
            <div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span style="color:var(--text3)">${labelB}</span>
                <span style="font-family:var(--mono);color:${pB>=80?'var(--green)':pB>=50?'var(--high)':'var(--critical)'}">${uB}/${tB} (${pB}%)</span>
              </div>
              ${cmpBar(pB)}
            </div>
            <div style="padding-top:8px;border-top:1px solid var(--border);font-size:12px">
              Change: ${cmpPctDelta(pA, pB)}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Per-asset comparison table -->
    ${allAssets.length ? `
    <div class="panel" style="margin-bottom:16px;padding:18px 20px">
      <div style="font-size:12px;font-family:var(--mono);color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.07em">Per-Asset Comparison</div>
      <div style="overflow-x:auto">
        <table class="vuln-table" style="min-width:600px">
          <thead><tr>
            <th>Asset</th>
            <th>${labelA} EP%</th>
            <th>${labelB} EP%</th>
            <th>EP Δ</th>
            <th>${labelA} SRV%</th>
            <th>${labelB} SRV%</th>
            <th>SRV Δ</th>
            <th>Trend</th>
          </tr></thead>
          <tbody>
            ${allAssets.map(a => {
              const dA  = assetsA[a], dB = assetsB[a];
              const epA  = dA ? Math.round(dA.uEP /dA.tEP *100) : null;
              const epB  = dB ? Math.round(dB.uEP /dB.tEP *100) : null;
              const sA   = dA ? Math.round(dA.uSrv/dA.tSrv*100) : null;
              const sB   = dB ? Math.round(dB.uSrv/dB.tSrv*100) : null;
              const epDelta = (epA !== null && epB !== null) ? epB - epA : null;
              const srvDelta= (sA  !== null && sB  !== null) ? sB  - sA  : null;
              const trend = !dA ? '🆕 New' : !dB ? '➖ Removed' :
                ((epDelta||0)>0 && (srvDelta||0)>=0) ? '📈 Improved' :
                ((epDelta||0)<0 && (srvDelta||0)<=0) ? '📉 Worsened' : '— Stable';
              const trendColor = !dA?'var(--accent)':!dB?'var(--text3)':
                trend.includes('Improved')?'var(--green)':trend.includes('Worsened')?'var(--critical)':'var(--text3)';
              const fmtPct = (p,t) => p!==null ? `<span style="font-family:var(--mono);color:${p>=80?'var(--green)':p>=50?'var(--high)':'var(--critical)'}">${t?`${Math.round(p/100*(t))}/${t} `:''} ${p}%</span>` : '<span style="color:var(--text3)">—</span>';
              return `<tr>
                <td style="font-family:var(--mono);font-size:12px">${a}</td>
                <td>${fmtPct(epA, dA?.tEP)}</td>
                <td>${fmtPct(epB, dB?.tEP)}</td>
                <td>${epDelta!==null ? cmpPctDelta(epA,epB) : '—'}</td>
                <td>${fmtPct(sA,  dA?.tSrv)}</td>
                <td>${fmtPct(sB,  dB?.tSrv)}</td>
                <td>${srvDelta!==null ? cmpPctDelta(sA,sB) : '—'}</td>
                <td style="color:${trendColor};font-size:12px">${trend}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- New / dropped assets callout -->
    ${newAssets.length || droppedAssets.length ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${newAssets.length ? `<div class="panel" style="padding:14px 16px;border-left:3px solid var(--accent)">
        <div style="font-size:11px;font-family:var(--mono);color:var(--accent);margin-bottom:8px">🆕 NEW IN ${labelB.toUpperCase()}</div>
        ${newAssets.map(a => `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">${a}</div>`).join('')}
      </div>` : ''}
      ${droppedAssets.length ? `<div class="panel" style="padding:14px 16px;border-left:3px solid var(--text3)">
        <div style="font-size:11px;font-family:var(--mono);color:var(--text3);margin-bottom:8px">➖ NOT IN ${labelB.toUpperCase()}</div>
        ${droppedAssets.map(a => `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">${a}</div>`).join('')}
      </div>` : ''}
    </div>` : ''}
  `;
}
