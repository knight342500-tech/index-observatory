const element = id => document.getElementById(id);
const html = text => String(text ?? '—').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const number = (v, n=2) => v == null ? '—' : Number(v).toFixed(n);
const pct = v => v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
const colored = v => `<span class="number ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${pct(v)}</span>`;
const chip = (value, cls='gray') => `<span class="chip ${cls}">${html(value)}</span>`;
const gateColor = state => ({红:'red',绿:'green',黄:'yellow'})[state] || 'gray';
const set = (id, body) => { element(id).innerHTML = body; };
const table = (id, headings, rows) => set(id, `<thead><tr>${headings.map(x => `<th scope="col">${html(x)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(x => `<td>${x}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${headings.length}">当前筛选没有匹配记录</td></tr>`}</tbody>`);
let data = null, latest = null, baseline = null, showingAll = false, kind = 'daily', inFlight = false;

function charts() {
  set('trends', data.clusters.map(c => `<div class="trend"><small>${html(c.name)} · 近 32 个计划日</small><canvas id="trend${c.id}" aria-label="${html(c.name)}合成指数走势" role="img"></canvas></div>`).join(''));
  for (const c of data.clusters) {
    const canvas = element(`trend${c.id}`);
    if (!canvas) continue;
    const ctx = canvas.getContext('2d'), width = canvas.offsetWidth, h = 25, density = devicePixelRatio || 1;
    canvas.width = width * density; canvas.height = h * density; ctx.scale(density,density);
    const series = c.trend.map(d => d.level), valid = series.filter(x => x !== null);
    if (valid.length < 2) continue;
    const base = Math.min(...valid), range = Math.max(...valid) - base || 1;
    ctx.beginPath(); ctx.strokeStyle = '#4c8577'; ctx.lineWidth = 1.5;
    series.forEach((v,i) => {
      if (v == null) return;
      const x = 2 + (width-4)*i/(series.length-1), y = h-2-(h-4)*(v-base)/range;
      if (series[i-1] == null) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }
}

function signals() {
  const filter = element('signalFilter').value;
  const rows = data.signals.filter(r => !filter || (filter === '机会观察' ? r.priority === '观察' : r.priority === filter));
  const priority = {'风险复核':0,'待确认':1,'观察':2};
  rows.sort((a,b) => priority[a.priority]-priority[b.priority] || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const selected = showingAll ? rows : rows.slice(0,9);
  table('signalTable',['指数','状态','触发 / 确认','观察点位','失效与复核'],selected.map(r => [
    `<b>${html(r.name)}</b><small>${html(r.id)}</small>`, `${chip(r.priority,r.priority==='风险复核'?'red':r.priority==='待确认'?'yellow':'green')} ${html(r.kind)}<small>${html(r.tags.join(' · ') || '以价线跟踪')}</small>`, `<span class="number">${html(r.date)}</span><small>确认 ${html(r.confirm)}</small>`, `<span class="number">${number(r.level)}</span><small>触发量比 ${number(r.v)}</small>`, `${html(r.rule)}<small>${html(r.review)}</small>`]));
  element('more').hidden = rows.length<=9;
  element('more').textContent = showingAll ? '收起' : `查看全部 ${rows.length} 条活动信号`;
}

function indexRows() {
  const text = element('search').value.trim().toLowerCase();
  const rows = data.indexes.filter(x => [x.id,x.name,x.code].some(v => String(v).toLowerCase().includes(text)));
  table('indexTable',['ID / 指数','收盘','1 日','5 日','20 日','MA20','MA60','量比','来源与状态'],rows.map(r => [`<b>${html(r.name)}</b><small>${html(r.id)} · ${html(r.code)}</small>`, `<span class="number">${number(r.close)}</span>`, colored(r.r1),colored(r.r5),colored(r.r20), `<span class="number">${number(r.m20)}</span>`,`<span class="number">${number(r.m60)}</span>`,`<span class="number">${number(r.v)}</span>`, `${html(r.source || '待确认')}<small>${html(r.note)}${r.last ? ` · ${html(r.last)}` : ''}${r.received_at ? ` · 采集 ${html(r.received_at.slice(11,19))}` : ''}</small>`]));
}

function period() {
  const p = data.periods[kind];
  const names = {'daily':'日','weekly':'周','monthly':'月'};
  const counts = new Map();
  for (const event of p.events) counts.set(event.kind,(counts.get(event.kind)||0)+1);
  const breakdown = [...counts].map(([label,n])=>`<li>${html(label)} ${n} 条</li>`).join('');
  const monthNote = kind==='monthly' ? `<p>修复量能同日同簇增量 · ${data.evidence.map(x => `${html(x.period)} ${pct(x.delta)}（${x.days} 个独立日期）`).join(' / ')}</p>` : '';
  set('period', `<div class="period-date">${html(p.start)}${p.end===p.start?'':` 至 ${html(p.end)}`} · ${p.days} 个已入库沪深交易日</div><div class="period-grid"><div class="scroll"><table><thead><tr><th>投资簇</th><th>累计点位变化</th><th>有效区间</th></tr></thead><tbody>${p.clusters.map(c => `<tr><td>${html(c.name)}</td><td>${colored(c.ret)}</td><td>${c.valid} / ${c.expected}</td></tr>`).join('')}</tbody></table></div><div><h3>${names[kind]}内触发构成</h3><p>${p.events.length} 条指数事件 · ${new Set(p.events.map(e=>e.date)).size} 个独立日期。</p>${monthNote}<ul>${breakdown || '<li>此窗口无记录</li>'}</ul><p class="footnote">周报与月报截至本快照交易日。指数点位变化按有效观察窗口统计。</p></div></div>`);
}

function decision() {
  const report = data.decision;
  if (!report) { element('decision').hidden = true; return; }
  element('decision').hidden = false;
  const anchors = report.anchors.map(a => `<div><b>${html(a.name)}</b> ${colored(a.ret)}<small>${html(a.state)} · ${number(a.close)} / MA20 ${number(a.ma)}</small></div>`).join('');
  const lists = ['机会', '风险'].map(category => {
    const selected = report.actions.filter(a => a.category === category);
    const cards = selected.map(a => `<li><b>${html(a.name)} · ${html(a.kind)}</b><small>${html(a.evidence)}</small><p>${html(a.action)}。</p><p>${html(a.condition_label || "跟踪条件")} · ${html(a.condition)}。</p>${a.notes?.length ? `<small>${html(a.notes.join(' · '))}</small>` : ''}<small>复核 ${html(a.review)}</small></li>`).join('');
    const empty = report.published ? '当前可评估范围内无活动项。' : '覆盖不足，本截面暂缓发布。';
    return `<div><h3>${category === '机会' ? '机会观察' : '风险复核'}</h3>${cards ? `<ol>${cards}</ol>` : `<p class="footnote">${empty}</p>`}</div>`;
  }).join('');
  const watch=(data.watch||[]).slice(0,6).map(item=>`<li><b>${html(item.name)}</b> · ${html(item.detail.join(' / '))}</li>`).join('');
  set('decision', `<div class="section-title"><div><h2>市场判断与下一步</h2><p>${html(report.title)} · ${html(report.summary)}</p>${report.activity ? `<p>${html(report.activity)}</p>` : ""}</div></div><div class="decision-anchors">${anchors}</div><div class="decision-actions">${lists}</div><p class="decision-stance"><b>下一交易日</b> ${html(report.stance)} <span class="number">${html(report.next_session)}</span></p><p class="footnote">${html(report.limitation)}</p>${watch ? `<details><summary>均线跟踪清单 · ${data.watch.length} 项</summary><ul>${watch}</ul></details>` : ''}`);
}

function render() {
  const x = data.coverage;
  const ranked = [...data.clusters].sort((a,b)=>(a.rank||99)-(b.rank||99));
  set('stamp',`${html(data.asof)}　收盘档案 / 北京时间`);
  set('lead',`${x.up} 项上涨、${x.down} 项下跌、${x.flat} 项持平。${ranked.filter(c=>c.status==='强势').length} 簇强势，${ranked.filter(c=>c.status==='弱势').length} 簇弱势。`);
  set('status',`${chip(data.mode,'yellow')}<br>${html(data.subtitle)}${data.attempted_at ? `<br>采集 ${html(data.attempted_at.slice(0,16).replace('T',' '))}` : ''}`);
  set('metrics',[['收盘覆盖',`${x.close} / ${x.n}`,'同日有可用收盘的核心指数'],['上涨 / 下跌',`${x.up} / ${x.down}`,`有单日变动 ${x.up+x.down+x.flat} 项`],['开盘 / 量比',`${x.open} / ${x.volume}`,'分别按本日字段可用数统计'],['活动信号', data.signals.length,data.mode==='数据简报'?'覆盖不足，已暂缓发布':'含观察、待确认与风险复核']].map(([label,v,note])=>`<div class="metric"><div>${html(label)}</div><strong>${html(v)}</strong><small>${html(note)}</small></div>`).join(''));
  table('clusters',['投资簇','1 日','5 日','20 日','代表数','联动'],ranked.map(c=>[`<span class="rank">${html(c.rank)}</span><b>${html(c.name)}</b><small>${html([c.status,...c.risks,c.note].filter(Boolean).join(' · '))}</small>`,colored(c.ret),colored(c.r5),colored(c.r20),`<span class="number">${c.N}/${c.M}</span><small>门槛 ${c.min}</small>`,`<span class="number">${number(c.corr20)}</span><small>${c.corr20==null?'待评估':c.corr20>.8?'高联动':c.corr20>=.5?'中等':'分化'}</small>`]));
  const same=data.same_day;
  set('sameDay',same && same.up!==null ? `六簇起止日一致，${same.up} 簇上涨、${same.down} 簇下跌。近 65 个自然日有 ${same.days} 个六簇共同区间。` : '今日缺少六簇共同起止区间。下表按相同起止区间列示最多 20 个有效配对。');
  table('pairs',['投资簇配对','有效区间 / 20','相关系数'],(data.pairs||[]).map(p=>[html(p.label),String(p.days),number(p.correlation)]));
  set('gate',chip(data.gate,gateColor(data.gate)));
  set('gates',data.gates.map(g=>`<div class="gate-row"><div><b>${html(g.label)}</b><small>${html(g.detail)}</small></div>${chip(g.state,gateColor(g.state))}</div>`).join(''));
  table('temperatures',['观察项','来源口径','观测日期','1 日','20 期','可用状态'],data.temperatures.map(r=>[`${html(r.name)}<small>${html(r.id)} · ${html(r.alias)}</small>`,html(r.source),html(r.date),colored(r.r1),colored(r.r20),html(r.state)]));
  set('evidence',`<ul>${data.gaps.map(g=>`<li>${html(g)}</li>`).join('')}</ul><p class="footnote">V3.3 量能、簇共振与环境阈值按现有审计用作说明标签。正式主截面时间为 16:15。</p>`);
  set('footerDate',`${html(data.rule)} · 数据 ${html(data.asof)}`);
  charts(); signals(); indexRows(); period(); decision();
}

async function refresh(manual=false) {
  if (inFlight) return;
  inFlight = true; element('refresh').disabled=true;
  try {
    const embedded = document.querySelector('#embedded-data');
    if (location.protocol==='file:' && embedded) {
      data=JSON.parse(embedded.textContent); render();
      if(manual) { element('alert').hidden=false; element('alert').textContent=`本地预览已重新载入 ${data.asof} 的内置复盘档案。`; }
      return;
    }
    const encrypted = document.documentElement.dataset.hosted === 'true';
    const token = location.hash.slice(1);
    if (encrypted && !/^[0-9a-f]{64}$/.test(token)) throw new Error('请通过个人仪表盘入口打开。');
    const res=await fetch(encrypted ? 'snapshot.enc.json' : 'latest.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let next = await res.json();
    if (encrypted) {
      const bytes = str => Uint8Array.from(atob(str), c=>c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw',Uint8Array.from(token.match(/../g), x=>parseInt(x,16)),{name:'AES-GCM'},false,['decrypt']);
      const decoded = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(next.iv)},key,bytes(next.data));
      next = JSON.parse(new TextDecoder().decode(decoded));
    }
    if (next.rule!=='V3.3' || next.indexes?.length!==61 || next.clusters?.length!==6 || !next.asof) throw new Error('快照结构异常');
    if (latest && next.asof<latest.asof) throw new Error('读到较早版本');
    baseline=next.baseline || null;
    latest=next;
    element('archiveChoice').hidden=!baseline;
    data=element('snapshot').value==='baseline' && baseline ? baseline : latest;
    render();
    element('alert').hidden=!manual;
    if(manual) element('alert').textContent=`已读取服务器档案，最新交易日为 ${latest.asof}。`;
  } catch (err) {
    element('alert').hidden=false;
    element('alert').textContent=data ? `刷新失败，当前保留 ${data.asof} 的数据。` : `数据读取失败，请重试刷新。${err.message}`;
  } finally { inFlight=false; element('refresh').disabled=false; }
}

element('snapshot').addEventListener('change',()=>{data=element('snapshot').value==='baseline' && baseline ? baseline : latest;showingAll=false;if(data)render();});
element('refresh').addEventListener('click',()=>refresh(true));
element('signalFilter').addEventListener('change',()=>{showingAll=false;if(data)signals();});
element('search').addEventListener('input',()=>{if(data)indexRows();});
element('more').addEventListener('click',()=>{showingAll=!showingAll;signals();});
element('reportTabs').addEventListener('click',e=>{if(!data||!e.target.dataset.kind)return;kind=e.target.dataset.kind;e.currentTarget.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===e.target)));period();});
window.addEventListener('resize',()=>{if(data)charts();});
refresh();
if(location.protocol!=='file:') setInterval(()=>{if(!document.hidden)refresh();},180000);
