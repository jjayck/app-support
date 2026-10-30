/* エネ管 熱 合格ナビ Web版 — 単一ページ。データは data/*.json、記録は localStorage のみ */
(() => {
'use strict';
const SUBJECTS = {1:'エネルギー総合管理及び法規',2:'熱と流体の流れの基礎',3:'燃料と燃焼',4:'熱利用設備及びその管理'};
const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];
const KANA = ['ア','イ','ウ','エ','オ','カ'];
const BUY_URL = window.ENEKAN_BUY_URL || 'https://coconala.com/users/2355868';
const PRICE = window.ENEKAN_PRICE || '1,480';
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base = id => id.replace(/-\d+$/, '');

const D = {q:[], byId:{}, guides:{}, intros:{}, pintros:{}, past:[], notes:{}, keys:[]};
const REC_KEY = 'enekan_rec', PRO_KEY = 'enekan_pro';
let rec = {}; try { rec = JSON.parse(localStorage.getItem(REC_KEY) || '{}'); } catch (e) { rec = {}; }
function saveRec() { try { localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch (e) {} }
function isPro() { try { return !!localStorage.getItem(PRO_KEY); } catch (e) { return false; } }
function canOpen(q) { return q.free || isPro(); }

// ---------- data ----------
async function load() {
  const get = async n => (await fetch(`data/${n}.json`, {cache:'no-cache'})).json();
  const [q, guides, intros, pintros, past, notes, keys] = await Promise.all(
    ['questions','calc_guides','intros','point_intros','past','blank_notes','keys'].map(get));
  D.q = q; q.forEach(x => D.byId[x.id] = x);
  Object.assign(D, {guides, intros, pintros, past, notes, keys});
}
const ofSubject = s => D.q.filter(x => x.subject === s);
function topics(s) { const seen = []; ofSubject(s).forEach(x => { if (!seen.includes(x.topic)) seen.push(x.topic); }); return seen; }
function points(s, t) { const seen = []; ofSubject(s).filter(x => x.topic === t).forEach(x => { if (!seen.includes(x.point)) seen.push(x.point); }); return seen; }
const isCalc = q => q.blanks.some(b => b.kind === 'numeric');

// ---------- blank logic (iOS版 Model.swift と同じ規則) ----------
const digitCount = b => (b.format || '').split('').filter(c => c === '#').length;
function compose(b, digits) {
  let i = 0, out = '';
  for (const ch of (b.format || '')) out += ch === '#' ? (digits[i++] ?? ' ') : ch;
  return out;
}
function normalizeDigits(b, raw) {
  // 入力は数字だけ。桁が足りないときは左を 0 で埋める(例: "###" に 64 → 064)。×10^n 形式は全桁必要
  let d = (raw || '').replace(/[^0-9]/g, '');
  const n = digitCount(b);
  if (d.length > n) d = d.slice(0, n);
  if (d.length < n && !(b.format || '').includes('e') && d.length > 0) d = d.padStart(n, '0');
  return d;
}
function blankOK(b, a) {
  if (b.kind === 'numeric') { const d = normalizeDigits(b, a); return d.length === digitCount(b) && compose(b, d) === String(b.answer); }
  return typeof a === 'number' && a === b.answer;
}
function answerDisplay(b) {
  if (b.kind === 'choice') return `${KANA[b.answer] ?? b.answer+1} ${b.options[b.answer]}`;
  const t = String(b.answer);
  if (t.includes('e')) { const p = t.split('e'); return `${p[0]} × 10^${p[1]}`; }
  return t;
}
function maskHTML(b, digits) {
  const f = b.format || ''; let i = 0, h = '';
  for (const ch of f) {
    if (ch === '#') { const c = digits[i++]; h += `<span class="c ${c ? 'f' : ''}">${c ?? '&nbsp;'}</span>`; }
    else if (ch === 'e') h += `<span class="e"> ×10^</span>`;
    else h += esc(ch);
  }
  return h;
}
// 解説の行に空欄の印を付ける(簡略版: 正解の語が最初に出る行 + blank_notes の指定)
function explanationLines(q) {
  const lines = q.explanation.split('\n').filter(l => l.trim());
  const out = lines.map(text => ({text, labels: []}));
  const used = new Set();
  q.blanks.forEach(b => {
    if (b.kind !== 'choice') return;
    const word = b.options[b.answer];
    const parts = [word, ...word.split(/[()()]/).map(s => s.trim()).filter(Boolean)];
    const i = out.findIndex(l => parts.some(p => l.text.includes(p)));
    if (i >= 0) { out[i].labels.push(b.label); used.add(b.label); }
  });
  const notes = [];
  const nb = D.notes[base(q.id)] || {};
  Object.entries(nb).forEach(([label, v]) => {
    if (typeof v === 'number') { if (out[v] && !out[v].labels.includes(label)) out[v].labels.push(label); }
    else { const j = notes.findIndex(n => n.text === v); if (j >= 0) notes[j].labels.push(label); else notes.push({text: v, labels: [label]}); }
  });
  out.forEach(l => l.labels.sort());
  return notes.concat(out);
}

// ---------- progress ----------
function stat(ids) {
  let done = 0, ok = 0;
  ids.forEach(id => { const r = rec[id]; if (r) { done++; if (r.ok) ok++; } });
  return {n: ids.length, done, ok, rate: done ? ok / done : 0};
}
function dots(ids, max = 24) {
  const s = ids.slice(0, max).map(id => { const r = rec[id]; return `<i class="${r ? (r.ok ? 'ok' : 'ng') : ''}"></i>`; }).join('');
  return `<span class="dots">${s}</span>`;
}

// ---------- router ----------
const app = $('#app');
function go(h) { location.hash = h; }
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, ...r] = h.split('/').map(decodeURIComponent);
  window.scrollTo(0, 0);
  document.querySelectorAll('header nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + (p || '')));
  const pb = $('#probadge'); if (pb) pb.hidden = !isPro();
  try {
    if (!p) return viewHome();
    if (p === 's') return viewSubject(+r[0]);
    if (p === 't') return viewTopic(+r[0], r[1]);
    if (p === 'p') return viewPractice(r);
    if (p === 'past') return viewPast(r[0]);
    if (p === 'pro') return viewPro();
    if (p === 'textbook') return viewTextbook(+r[0], r[1]);
    if (p === 'exam') return startExam(+r[0]);
    if (p === 'weak') return startWeak(+r[0]);
    if (p === 'about') return viewAbout();
  } catch (e) { console.error(e); app.innerHTML = `<div class="card">読み込みに失敗しました。再読み込みしてください。</div>`; }
  viewHome();
}
window.addEventListener('hashchange', route);

// ---------- views ----------
function viewHome() {
  const cards = [1,2,3,4].map(s => {
    const ids = ofSubject(s).map(x => x.id); const st = stat(ids);
    const pct = Math.round(st.rate * 100);
    const freeN = ofSubject(s).filter(x => x.free).length;
    return `<a class="card subject" href="#/s/${s}">
      <div class="roman">${ROMAN[s]}</div>
      <div class="title">${esc(SUBJECTS[s])}</div>
      <div class="meta">${ids.length}問${isPro() ? '' : `(無料 ${freeN}問)`} ・ 解いた ${st.done}問 ・ 正答率 ${st.done ? pct + '%' : '—'}</div>
      <div class="bar"><i style="width:${pct}%"></i><b></b></div>
      <div class="meta">${st.done ? (pct >= 60 ? '合格ライン(60%)を超えています' : `合格ライン(60%)まで あと ${60 - pct} ポイント`) : '合格ライン 60% を目安に'}</div>
    </a>`;
  }).join('');
  const total = stat(D.q.map(x => x.id));
  app.innerHTML = `
    <h1>エネルギー管理士(熱分野)<br>論点別 練習問題 ${D.q.length}問</h1>
    <p class="lead">本番と同じマーク形式(数値は桁ごと・語句は解答群)。計算 ${Object.keys(D.guides).length} 型すべてに「やさしい解き方」つき。ログイン不要、記録はこのブラウザの中だけ。</p>
    ${isPro() ? '' : `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>無料で ${D.q.filter(x=>x.free).length} 問</b> を解けます。<span class="note">全 ${D.q.length} 問・弱点演習・ミニ模試は「全部解禁」(買い切り ¥${PRICE})で。</span></div><a class="btn gold sm" href="#/pro">全部解禁について</a></div>`}
    <div class="grid two" style="margin-top:12px">${cards}</div>
    <h2>出題傾向(過去問 R3〜R7)</h2>
    <div class="card row"><div style="flex:1">過去問 ${D.past.length} 小問の論点を年度・課目ごとに整理。各論点から類似問題へ。</div><a class="btn ghost sm" href="#/past">傾向マップ</a></div>
    <h2>これまでの記録</h2>
    <div class="card">解いた問題 ${total.done} / ${total.n}・正答率 ${total.done ? Math.round(total.rate*100)+'%' : '—'}
      <div class="actions"><button class="btn ghost sm" id="reset">記録を消す</button></div></div>
    ${seoBlock()}
    ${footer()}`;
  $('#reset').onclick = () => { if (confirm('このブラウザの学習記録をすべて消します。よろしいですか?')) { rec = {}; saveRec(); route(); } };
}
function seoBlock() {
  const li = [1,2,3,4].map(s => `<h3>課目${ROMAN[s]} ${esc(SUBJECTS[s])}</h3><ul>${topics(s).map(t => `<li><a href="#/t/${s}/${encodeURIComponent(t)}">${esc(t)}</a>(${ofSubject(s).filter(x=>x.topic===t).length}問)</li>`).join('')}</ul>`).join('');
  return `<section class="seo"><h2>収録している論点</h2>${li}
  <h2>このサイトについて</h2>
  <p class="note">エネルギー管理士試験(熱分野)の課目Ⅰ〜Ⅳを、令和3〜7年度の過去問の論点から作ったオリジナル問題で練習できます。問題文は過去問をそのまま載せていません。試験の実施機関(一般財団法人省エネルギーセンター)とは関係のない個人制作で、合格を保証するものではありません。法令・試験の内容は最新の公式情報もあわせて確認してください。<a href="#/about">くわしく</a></p></section>`;
}
function footer() {
  return `<div class="foot">エネ管 熱 合格ナビ Web版 ・ <a href="#/about">このサイトについて</a> ・ <a href="../privacy.html">プライバシーポリシー</a> ・ <a href="../support.html">お問い合わせ</a></div>`;
}

function viewSubject(s) {
  if (!SUBJECTS[s]) return viewHome();
  const ts = topics(s);
  const items = ts.map(t => {
    const qs = ofSubject(s).filter(x => x.topic === t); const ids = qs.map(x => x.id); const st = stat(ids);
    const openN = qs.filter(canOpen).length;
    return `<a class="item" href="#/t/${s}/${encodeURIComponent(t)}">
      <div class="t"><div class="n">${esc(t)}</div><div class="s">${esc((D.intros[t]||{}).one || points(s,t).join('・'))}</div></div>
      ${dots(ids, 16)}
      <div class="cnt">${st.done}/${qs.length}</div>${openN < qs.length ? `<span class="lock">🔒${qs.length-openN}</span>` : ''}
    </a>`;
  }).join('');
  const ids = ofSubject(s).map(x => x.id); const st = stat(ids);
  app.innerHTML = `
    <div class="crumb"><a href="#/">ホーム</a>課目${ROMAN[s]}</div>
    <h1>課目${ROMAN[s]} ${esc(SUBJECTS[s])}</h1>
    <p class="lead">${ids.length}問・解いた ${st.done}問・正答率 ${st.done ? Math.round(st.rate*100)+'%' : '—'}</p>
    <div class="actions" style="margin:0 0 14px">
      <a class="btn heat sm" href="#/p/s/${s}">順番に解く</a>
      <a class="btn sm" href="#/exam/${s}">ミニ模試(20問)${isPro()?'':' 🔒'}</a>
      <a class="btn ghost sm" href="#/weak/${s}">弱点だけ${isPro()?'':' 🔒'}</a>
    </div>
    <div class="list">${items}</div>
    ${footer()}`;
}

function viewTopic(s, t) {
  const qs = ofSubject(s).filter(x => x.topic === t);
  if (!qs.length) return viewSubject(s);
  const intro = D.intros[t];
  const pts = points(s, t).map(p => {
    const pq = qs.filter(x => x.point === p); const ids = pq.map(x => x.id); const st = stat(ids);
    const openN = pq.filter(canOpen).length;
    return `<a class="item" href="#/p/pt/${s}/${encodeURIComponent(t)}/${encodeURIComponent(p)}">
      <div class="t"><div class="n">${pq.some(isCalc) ? '<span class="chip calc">計算</span>' : ''}${esc(p)}</div><div class="s">${esc(D.pintros[p] || '')}</div></div>
      ${dots(ids, 8)}<div class="cnt">${st.done}/${pq.length}</div>${openN === 0 ? '<span class="lock">🔒</span>' : ''}
    </a>`;
  }).join('');
  app.innerHTML = `
    <div class="crumb"><a href="#/">ホーム</a><a href="#/s/${s}">課目${ROMAN[s]}</a>${esc(t)}</div>
    <h1>${esc(t)}</h1>
    ${intro ? `<div class="card intro"><div class="one">${esc(intro.one)}</div><div class="image">たとえると: ${esc(intro.image)}</div>
      <ol>${(intro.flow||[]).map(f => `<li>${esc(f)}</li>`).join('')}</ol><div class="exam">試験のねらい目: ${esc(intro.exam)}</div></div>` : ''}
    <div class="actions" style="margin:12px 0"><a class="btn heat sm" href="#/p/t/${s}/${encodeURIComponent(t)}">この分野を順番に解く(${qs.length}問)</a>
      <a class="btn ghost sm" href="#/textbook/${s}/${encodeURIComponent(t)}">教科書(例題と解き方)</a></div>
    <h2>論点</h2>
    <div class="list">${pts}</div>
    ${footer()}`;
}

function viewTextbook(s, t) {
  const qs = ofSubject(s).filter(x => x.topic === t);
  if (!qs.length) return viewSubject(s);
  const secs = points(s, t).map(p => {
    const pq = qs.filter(x => x.point === p);
    const rep = pq.find(x => x.free) || pq[0];
    const open = canOpen(rep);
    let body = `<div class="hint-pt">${esc(D.pintros[p] || '')}</div>`;
    if (open) {
      const g = D.guides[base(rep.id)];
      body += `<div class="stem" style="margin-top:10px;font-size:15px">${filledStem(rep)}</div>`;
      body += g ? guideHTML(g, explanationLines(rep)) : `<div class="exp">${explanationLines(rep).map(lineHTML).join('')}</div>`;
    } else body += `<div class="note" style="margin-top:8px">🔒 この論点の例題は「全部解禁」で読めます。</div>`;
    return `<div class="card"><h3 style="margin-top:0">${pq.some(isCalc) ? '<span class="chip calc">計算</span>' : ''}${esc(p)}</h3>${body}
      <div class="actions"><a class="btn sm" href="#/p/pt/${s}/${encodeURIComponent(t)}/${encodeURIComponent(p)}">この論点を解く(${pq.length}問)</a></div></div>`;
  }).join('');
  app.innerHTML = `<div class="crumb"><a href="#/">ホーム</a><a href="#/s/${s}">課目${ROMAN[s]}</a><a href="#/t/${s}/${encodeURIComponent(t)}">${esc(t)}</a>教科書</div>
    <h1>${esc(t)} の教科書</h1><p class="lead">論点ごとに代表の例題を、正解を入れた形で読めます。計算の論点は「やさしい解き方」つき。</p>${secs}${footer()}`;
}
function filledStem(q) {
  return esc(q.stem).replace(/\[([A-Z])\]/g, (m, l) => {
    const b = q.blanks.find(x => x.label === l); if (!b) return m;
    const v = b.kind === 'choice' ? b.options[b.answer] : answerDisplay(b);
    return `<span class="bl filled">${esc(v)}</span>`;
  });
}

// ---------- practice ----------
let P = null; // {ids, i, title, back, mode, answers:{}, checked:false}
function listFor(r) {
  const [kind, a, b, c] = r;
  if (kind === 's') { const s = +a; return {ids: ofSubject(s).map(x=>x.id), title: `課目${ROMAN[s]}`, back: `#/s/${s}`}; }
  if (kind === 't') { const s = +a; return {ids: ofSubject(s).filter(x=>x.topic===b).map(x=>x.id), title: b, back: `#/t/${s}/${encodeURIComponent(b)}`}; }
  if (kind === 'pt') { const s = +a; return {ids: ofSubject(s).filter(x=>x.topic===b && x.point===c).map(x=>x.id), title: c, back: `#/t/${s}/${encodeURIComponent(b)}`}; }
  if (kind === 'q') { const q = D.byId[a]; return q ? {ids:[a], title: q.point, back: `#/t/${q.subject}/${encodeURIComponent(q.topic)}`} : null; }
  if (kind === 'sim') { const ids = D.q.filter(x => base(x.id) === a).map(x=>x.id); return ids.length ? {ids, title: '類似問題', back: '#/past'} : null; }
  return null;
}
function viewPractice(r) {
  const key = r.join('/');
  if (key === 'x') { if (P) return renderQuestion(); return viewHome(); }   // 模試・弱点(一覧は P に持っている)
  if (!P || P.key !== key) {
    const L = listFor(r); if (!L) return viewHome();
    P = {key, ...L, i: 0, answers: {}, checked: false, mode: 'practice', results: []};
    // 続きから: 最初の未着手へ
    const first = L.ids.findIndex(id => !rec[id]); if (first > 0 && L.ids.length > 1) P.i = first;
  }
  renderQuestion();
}
function startExam(s) {
  if (!isPro()) return viewPro('ミニ模試');
  const pool = ofSubject(s).map(x => x.id).sort(() => Math.random() - .5).slice(0, 20);
  P = {key: 'exam' + Date.now(), ids: pool, title: `課目${ROMAN[s]} ミニ模試`, back: `#/s/${s}`, i: 0, answers: {}, checked: false, mode: 'exam', results: []};
  location.hash = '#/p/x'; renderQuestion();
}
function startWeak(s) {
  if (!isPro()) return viewPro('弱点演習');
  const pool = ofSubject(s).filter(x => rec[x.id] && !rec[x.id].ok).map(x => x.id);
  if (!pool.length) { app.innerHTML = `<div class="crumb"><a href="#/s/${s}">課目${ROMAN[s]}</a></div><div class="card">まちがえた問題はまだありません。先に「順番に解く」で解いてみてください。</div>`; return; }
  P = {key: 'weak' + Date.now(), ids: pool, title: `課目${ROMAN[s]} 弱点`, back: `#/s/${s}`, i: 0, answers: {}, checked: false, mode: 'practice', results: []};
  location.hash = '#/p/x'; renderQuestion();
}
function renderQuestion() {
  if (!P) return viewHome();
  if (P.i >= P.ids.length) return renderSummary();
  const q = D.byId[P.ids[P.i]];
  if (!canOpen(q)) return renderLocked(q);
  const stem = esc(q.stem).replace(/\[([A-Z])\]/g, (m, l) => {
    const b = q.blanks.find(x => x.label === l);
    let cls = '', txt = l;
    if (P.checked && b) { const ok = blankOK(b, P.answers[l]); cls = ok ? 'ok' : 'ng'; }
    return `<span class="bl ${cls}" data-l="${l}">${txt}</span>`;
  });
  const tables = (q.tables || []).map(t => `<div class="tbl-wrap"><div class="tbl-title">${esc(t.title)}</div><table class="qt"><thead><tr>${t.header.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${t.note?`<div class="tbl-note">${esc(t.note)}</div>`:''}</div>`).join('');
  const blanks = q.blanks.map(b => blankHTML(q, b)).join('');
  let resultBox = '', after = '';
  if (P.checked) {
    const okN = q.blanks.filter(b => blankOK(b, P.answers[b.label])).length;
    const cls = okN === q.blanks.length ? 'ok' : okN ? 'part' : 'ng';
    const word = cls === 'ok' ? '正解!' : cls === 'part' ? `部分正解(${okN}/${q.blanks.length})` : '不正解';
    resultBox = `<div class="result ${cls}">${word}</div>`;
    after = P.mode === 'exam' ? '' : explainHTML(q);
  }
  const nextLabel = P.i + 1 >= P.ids.length ? (P.ids.length > 1 ? '結果を見る' : '一覧へ') : '次の問題';
  app.innerHTML = `
    <div class="qhead"><a href="${P.back}" style="text-decoration:none;color:var(--sub)">‹ ${esc(P.title)}</a><span class="sp"></span>
      ${isCalc(q) ? '<span class="chip calc">計算</span>' : ''}${q.free ? '<span class="chip free">無料</span>' : ''}<span class="qpos">${P.i+1} / ${P.ids.length}</span></div>
    <div class="stem">${stem}${tables}</div>
    ${blanks}
    ${resultBox}
    <div class="actions">
      ${P.checked ? `<button class="btn heat" id="next">${nextLabel}</button>${P.mode==='exam'?'':`<button class="btn ghost" id="retry">もう一度</button>`}` :
        `<button class="btn heat" id="check">答え合わせ</button>${P.ids.length>1?`<button class="btn ghost" id="skip">とばす</button>`:''}`}
      ${P.i > 0 ? `<button class="btn ghost" id="prev">‹ 前へ</button>` : ''}
    </div>
    ${after}`;
  bindBlanks(q);
  const on = (id, f) => { const el = $('#' + id); if (el) el.onclick = f; };
  on('check', () => check(q));
  on('next', () => { P.i++; P.answers = {}; P.checked = false; renderQuestion(); });
  on('skip', () => { if (P.mode === 'exam') P.results.push({id: q.id, ok: false, part: 0}); P.i++; P.answers = {}; P.checked = false; renderQuestion(); });
  on('prev', () => { P.i--; P.answers = {}; P.checked = false; renderQuestion(); });
  on('retry', () => { P.answers = {}; P.checked = false; renderQuestion(); });
  const first = $('.num input'); if (first && !P.checked && window.innerWidth > 700) first.focus();
}
function blankHTML(q, b) {
  const a = P.answers[b.label];
  const ok = P.checked ? blankOK(b, a) : null;
  const res = P.checked ? `<span class="res ${ok?'ok':'ng'}">${ok ? '○' : '×'}</span>` : '';
  if (b.kind === 'choice') {
    const opts = b.options.map((o, i) => {
      let cls = a === i ? 'sel' : '';
      if (P.checked) { if (i === b.answer) cls = 'ok'; else if (a === i) cls = 'ng'; }
      return `<button class="opt ${cls}" data-l="${b.label}" data-i="${i}" ${P.checked?'disabled':''}><span class="k">${KANA[i] ?? i+1}</span><span>${esc(o)}</span></button>`;
    }).join('');
    return `<div class="blank"><div class="lab"><span class="l">${b.label}</span><span>解答群から選ぶ</span>${res}</div><div class="opts">${opts}</div></div>`;
  }
  const d = normalizeDigits(b, a);
  const hint = (b.format || '').includes('e') ? '仮数と指数の数字を続けて入力(例 3.14×10^5 → 3145)' : `数字だけ入力(${digitCount(b)}桁・小数点は自動)`;
  return `<div class="blank"><div class="lab"><span class="l">${b.label}</span><span class="u">${esc(b.unit || '')}</span>${res}</div>
    <div class="num"><div class="mask" id="mask-${b.label}">${maskHTML(b, d)}</div>
      <input type="text" inputmode="numeric" autocomplete="off" data-l="${b.label}" maxlength="${digitCount(b)}" value="${esc(a || '')}" ${P.checked?'disabled':''} placeholder="${'#'.repeat(digitCount(b))}">
      <div class="hint">${hint}</div></div>
    ${P.checked ? `<div class="ans">正解: <b>${esc(answerDisplay(b))}</b> ${esc(b.unit||'')}</div>` : ''}</div>`;
}
function bindBlanks(q) {
  app.querySelectorAll('.opt').forEach(el => el.onclick = () => { P.answers[el.dataset.l] = +el.dataset.i; app.querySelectorAll(`.opt[data-l="${el.dataset.l}"]`).forEach(o => o.classList.toggle('sel', o === el)); });
  app.querySelectorAll('.num input').forEach(el => {
    el.oninput = () => { const v = el.value.replace(/[^0-9]/g, ''); el.value = v; P.answers[el.dataset.l] = v; const b = q.blanks.find(x => x.label === el.dataset.l); $('#mask-' + b.label).innerHTML = maskHTML(b, v); };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const c = $('#check'); if (c) c.click(); } };
  });
}
function check(q) {
  const unanswered = q.blanks.filter(b => P.answers[b.label] === undefined || P.answers[b.label] === '');
  if (unanswered.length === q.blanks.length) { toast('答えを入れてください'); return; }
  P.checked = true;
  const ok = q.blanks.every(b => blankOK(b, P.answers[b.label]));
  rec[q.id] = {ok: ok ? 1 : 0, n: ((rec[q.id] || {}).n || 0) + 1, t: Date.now()}; saveRec();
  P.results.push({id: q.id, ok, part: q.blanks.filter(b => blankOK(b, P.answers[b.label])).length / q.blanks.length});
  renderQuestion();
}
function lineHTML(l) { return `<div class="line"><span class="lb">${l.labels.map(x=>`<i>${x}</i>`).join('')}</span><span>${esc(l.text)}</span></div>`; }
function guideHTML(g, lines) {
  let li = 0; const steps = []; const extra = [];
  g.steps.forEach((s, i) => { const line = lines[i]; if (s) steps.push({why: s, formula: line ? line.text : ''}); else if (line) extra.push(line.text); });
  // 行が steps より多いときは残りを「あわせて覚える」へ
  for (let i = g.steps.length; i < lines.length; i++) extra.push(lines[i].text);
  return `<div class="guide">
    <div class="g-goal"><b>何を聞かれている?</b><br>${esc(g.goal)}</div>
    <h3>記号と単位</h3><ul>${g.symbols.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
    <h3>解き方</h3>${steps.map((s,i)=>`<div class="step"><span class="no">${i+1}</span><div><div class="why">${esc(s.why)}</div>${s.formula?`<div class="formula">${esc(s.formula)}</div>`:''}</div></div>`).join('')}
    ${extra.length ? `<h3>あわせて覚える</h3><ul>${extra.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    <div class="trap"><b>つまずきやすいところ</b><br>${esc(g.trap)}</div></div>`;
}
function explainHTML(q) {
  const lines = explanationLines(q);
  const g = D.guides[base(q.id)];
  const pi = D.pintros[q.point];
  const tabs = g ? `<div class="tabs"><button class="on" data-t="g">やさしい解き方</button><button data-t="e">解説</button></div>` : '';
  const html = `<div class="card exp-card" style="margin-top:12px">
    ${pi ? `<div class="hint-pt"><b>ひとこと:</b> ${esc(pi)}</div>` : ''}
    ${tabs}
    <div id="tab-g" ${g?'':'hidden'}>${g ? guideHTML(g, lines) : ''}</div>
    <div id="tab-e" ${g?'hidden':''}><div class="exp">${lines.map(lineHTML).join('')}</div></div>
    <div class="actions"><a class="btn ghost sm" href="#/textbook/${q.subject}/${encodeURIComponent(q.topic)}">${esc(q.topic)} の教科書を開く</a></div>
  </div>`;
  setTimeout(() => { app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { app.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $('#tab-g').hidden = b.dataset.t !== 'g'; $('#tab-e').hidden = b.dataset.t !== 'e'; }); }, 0);
  return html;
}
function renderLocked(q) {
  app.innerHTML = `<div class="qhead"><a href="${P.back}" style="text-decoration:none;color:var(--sub)">‹ ${esc(P.title)}</a><span class="sp"></span><span class="qpos">${P.i+1} / ${P.ids.length}</span></div>
    <div class="card lockbox"><div class="big">🔒</div><h2 style="margin:6px 0">ここから先は「全部解禁」の問題です</h2>
    <p class="note">${esc(q.point)}</p>
    <div class="actions" style="justify-content:center"><a class="btn gold" href="#/pro">全部解禁について(¥${PRICE} 買い切り)</a>
    ${P.ids.slice(P.i+1).some(id => D.byId[id].free) ? `<button class="btn ghost" id="nextfree">次の無料問題へ</button>` : ''}</div></div>`;
  const nf = $('#nextfree'); if (nf) nf.onclick = () => { const j = P.ids.findIndex((id, k) => k > P.i && D.byId[id].free); P.i = j; P.answers = {}; P.checked = false; renderQuestion(); };
}
function renderSummary() {
  const r = P.results; const okN = r.filter(x => x.ok).length; const pts = r.reduce((a, x) => a + x.part, 0);
  const pct = r.length ? Math.round(pts / r.length * 100) : 0;
  const wrong = r.filter(x => !x.ok);
  app.innerHTML = `<div class="crumb"><a href="${P.back}">${esc(P.title)}</a>結果</div>
    <div class="card summary"><div class="note">${esc(P.title)}</div><div class="sc">${pct}<small> 点 / 100</small></div>
      <div class="note" style="margin-top:6px">${r.length}問中 ${okN}問 全問正解・部分点込み ${pct}%${P.mode==='exam' ? (pct >= 60 ? ' — 合格ライン(60点)クリア' : ' — 合格ラインまで あと ' + (60-pct) + ' 点') : ''}</div>
      <div class="actions" style="justify-content:center"><a class="btn heat" href="${P.back}">一覧へ戻る</a>${wrong.length ? `<button class="btn ghost" id="redo">まちがえた ${wrong.length} 問をやり直す</button>` : ''}</div></div>
    ${wrong.length ? `<h2>まちがえた問題</h2><div class="list">${wrong.map(w => { const q = D.byId[w.id]; return `<a class="item" href="#/p/q/${q.id}"><div class="t"><div class="n">${esc(q.point)}</div><div class="s">${esc(q.topic)}</div></div><span class="cnt">${Math.round(w.part*100)}%</span></a>`; }).join('')}</div>` : ''}`;
  const rd = $('#redo'); if (rd) rd.onclick = () => { P = {...P, key: 'redo' + Date.now(), ids: wrong.map(w => w.id), i: 0, answers: {}, checked: false, results: [], mode: 'practice'}; renderQuestion(); };
}

// ---------- past ----------
function viewPast(year) {
  const years = [...new Set(D.past.map(p => p.year))];
  const y = years.includes(year) ? year : years[years.length - 1];
  const n = y.slice(1).padStart(2, '0');
  const items = [1,2,3,4].map(s => {
    const ps = D.past.filter(p => p.year === y && p.subject === s);
    if (!ps.length) return '';
    return `<h3>課目${ROMAN[s]} ${esc(SUBJECTS[s])} <a class="sim" style="font-size:12px" target="_blank" rel="noopener" href="https://www.eccj.or.jp/mgr1/test_past/pdf/r${n}/r${n}_${s}.pdf">公式PDF ↗</a></h3>
      <div class="card">${ps.map(p => { const has = p.tag && D.q.some(x => base(x.id) === p.tag); return `<div class="pi"><div class="h"><span>問${p.problem} ${esc(p.part||'')}</span><span>${esc(p.area||'')}</span>${p.calc?'<span class="chip calc">計算</span>':''}<span class="sp"></span>${has?`<a class="sim" href="#/p/sim/${p.tag}">類似問題 ›</a>`:''}</div><div class="p">${esc(p.point)}</div></div>`; }).join('')}</div>`;
  }).join('');
  app.innerHTML = `<div class="crumb"><a href="#/">ホーム</a>出題傾向</div><h1>出題傾向マップ(過去問の論点)</h1>
    <p class="lead">令和3〜7年度の過去問 ${D.past.length} 小問を論点で整理。問題文そのものは省エネルギーセンターの公式PDFで。</p>
    <div class="past-year">${years.map(v => `<button class="${v===y?'on':''}" data-y="${v}">令和${v.slice(1)}年</button>`).join('')}</div>${items}${footer()}`;
  app.querySelectorAll('.past-year button').forEach(b => b.onclick = () => go('#/past/' + b.dataset.y));
}

// ---------- pro ----------
async function sha256(s) { const d = new TextEncoder().encode(s); const h = await crypto.subtle.digest('SHA-256', d); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const normKey = k => (k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function activate(k) {
  const nk = normKey(k);
  if (nk.length < 12) return {ok: false, msg: 'キーの形式がちがいます(例 ENK-XXXX-XXXX-XXXX)'};
  if (!crypto.subtle) return {ok: false, msg: 'このブラウザでは照合できません(https で開いてください)'};
  const h = await sha256('enekan:' + nk);
  if (D.keys.includes(h)) { try { localStorage.setItem(PRO_KEY, nk); } catch (e) { return {ok:false, msg:'保存できませんでした(プライベートブラウズ?)'}; } return {ok: true}; }
  return {ok: false, msg: 'このキーは登録されていません。大文字小文字・O と 0 を確認してください'};
}
function viewPro(from) {
  const pro = isPro();
  app.innerHTML = `<div class="crumb"><a href="#/">ホーム</a>全部解禁</div>
    <h1>全部解禁(買い切り)</h1>
    ${from ? `<p class="lead">「${esc(from)}」は全部解禁の機能です。</p>` : ''}
    <div class="card">
      ${pro ? `<div class="msg ok">✓ このブラウザでは全部解禁が有効です</div><p class="note">別の端末で使うときは、同じキーをその端末で入力してください。</p>` :
      `<div class="row" style="align-items:baseline;gap:12px"><span class="price">¥${PRICE}<small> 税込・1回だけ</small></span><span class="note">月額なし</span></div>
      <div class="feat">
        <div><b>全 ${D.q.length} 問</b>無料95問 → 課目Ⅰ〜Ⅳ すべての論点</div>
        <div><b>やさしい解き方 ${Object.keys(D.guides).length} 型</b>計算問題の全部に 1行ずつの説明</div>
        <div><b>弱点演習</b>まちがえた問題だけをくり返す</div>
        <div><b>ミニ模試</b>課目ごと 20 問ランダム・合格ラインとの差</div>
        <div><b>教科書の例題</b>207 論点すべての例題と解き方</div>
        <div><b>端末を選ばない</b>スマホ・PC どちらでも同じキーで</div>
      </div>
      <h3>買い方</h3>
      <ol class="note" style="padding-left:20px">
        <li>下のボタンから購入ページ(ココナラ)を開き、「エネ管 熱 合格ナビ Web版 ライセンスキー」を購入</li>
        <li>トークルームにライセンスキー(ENK-XXXX-XXXX-XXXX)が届きます(通常 当日中・最長 24 時間)</li>
        <li>このページの入力欄にキーを入れて「有効にする」</li>
      </ol>
      <a class="btn gold block" target="_blank" rel="noopener" href="${esc(BUY_URL)}">購入ページを開く(ココナラ)</a>
      <p class="note" style="margin-top:8px">キーはご本人の端末で使うためのものです。学習記録はこのブラウザの中だけに保存されます(端末間の同期はありません)。</p>`}
      <h3>ライセンスキーを入力</h3>
      <div class="keyin"><input id="key" placeholder="ENK-XXXX-XXXX-XXXX" value="${pro ? esc(localStorage.getItem(PRO_KEY)) : ''}"><button class="btn" id="act">${pro ? '確認する' : '有効にする'}</button></div>
      <div id="kmsg" class="msg"></div>
      ${pro ? `<div class="actions"><button class="btn ghost sm" id="deact">この端末の解禁を解除</button></div>` : ''}
    </div>
    <h2>よくある質問</h2>
    <div class="card note">
      <p><b>iPhone アプリ版はありますか?</b><br>準備中です。Web 版はスマホのブラウザでそのまま使え、ホーム画面に追加するとアプリのように開けます。</p>
      <p><b>返金は?</b><br>キーをお渡しした後の返金はできません。無料 95 問で使い心地を確かめてからご購入ください。</p>
      <p><b>内容の更新は?</b><br>問題や解き方の追加・修正は同じキーのまま使えます。</p>
    </div>${footer()}`;
  $('#act').onclick = async () => { const r = await activate($('#key').value); const m = $('#kmsg'); m.className = 'msg ' + (r.ok ? 'ok' : 'ng'); m.textContent = r.ok ? '✓ 全部解禁が有効になりました' : r.msg; if (r.ok) setTimeout(() => route(), 800); };
  const dc = $('#deact'); if (dc) dc.onclick = () => { localStorage.removeItem(PRO_KEY); route(); };
}

function viewAbout() {
  app.innerHTML = `<div class="crumb"><a href="#/">ホーム</a>このサイトについて</div><h1>このサイトについて</h1>
  <div class="card note">
    <p>エネルギー管理士試験(熱分野)の自習用に、個人が制作した練習問題サイトです。課目Ⅰ〜Ⅳの ${D.q.length} 問は、令和3〜7年度の過去問の論点をもとに作ったオリジナル問題で、過去問の問題文は掲載していません。</p>
    <p>試験の実施機関(一般財団法人省エネルギーセンター)とは関係ありません。合格を保証するものではなく、法令や試験の内容は最新の公式情報もあわせて確認してください。</p>
    <p>ログインはなく、学習の記録・ライセンスキーはこのブラウザの中(localStorage)だけに保存され、外部へ送信しません。ブラウザのデータを消すと記録も消えます。</p>
    <p>数値の解答は本番と同じ「桁ごとのマーク」方式です。桁が足りないときは左を 0 で埋めて判定します。</p>
    <p>お問い合わせ: <a href="../support.html">サポートページ</a></p>
  </div>${footer()}`;
}

// ---------- calculator (本番と同じ普通の電卓) ----------
function setupCalc() {
  const fab = document.createElement('button'); fab.className = 'calcfab'; fab.title = '電卓'; fab.textContent = '🧮';
  const box = document.createElement('div'); box.className = 'calc';
  box.innerHTML = `<div class="disp" id="cd">0</div><div class="keys">
    ${['MC','MR','M+','C','7','8','9','÷','4','5','6','×','1','2','3','−','0','.','√','+','%','←','=',''].map(k => k ? `<button class="${'÷×−+'.includes(k)?'op':k==='='?'eq':''}" data-k="${k}">${k}</button>` : '<span></span>').join('')}
  </div><div class="note">本番は関数電卓不可。四則・√・%・メモリだけ</div>`;
  document.body.append(fab, box);
  fab.onclick = () => box.classList.toggle('open');
  let cur = '0', acc = null, op = null, mem = 0, fresh = true;
  const disp = $('#cd', box); const show = () => disp.textContent = cur;
  const fmt = v => { if (!isFinite(v)) return 'Error'; let s = String(+v.toPrecision(12)); return s; };
  const apply = () => { if (op && acc !== null) { const a = +acc, b = +cur; cur = fmt(op==='+'?a+b:op==='−'?a-b:op==='×'?a*b:b===0?NaN:a/b); } acc = null; op = null; };
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (/[0-9]/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; }
    else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
    else if (k === 'C') { cur = '0'; acc = null; op = null; fresh = true; }
    else if (k === '←') { cur = cur.length > 1 ? cur.slice(0, -1) : '0'; }
    else if ('÷×−+'.includes(k)) { if (op && !fresh) apply(); acc = cur; op = k; fresh = true; }
    else if (k === '=') { apply(); fresh = true; }
    else if (k === '√') { cur = fmt(Math.sqrt(+cur)); fresh = true; }
    else if (k === '%') { cur = fmt(op && acc !== null ? +acc * +cur / 100 : +cur / 100); fresh = true; }
    else if (k === 'MC') mem = 0; else if (k === 'MR') { cur = fmt(mem); fresh = true; } else if (k === 'M+') { mem += +cur; fresh = true; }
    show();
  });
}

let toastT; function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); } t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

// ---------- boot ----------
load().then(() => { setupCalc(); route(); const pb = $('#probadge'); if (pb) pb.hidden = !isPro(); })
  .catch(e => { console.error(e); app.innerHTML = `<div class="card">問題データを読み込めませんでした。通信状態を確認して再読み込みしてください。</div>`; });
})();
