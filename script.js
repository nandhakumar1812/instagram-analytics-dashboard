'use strict';
/* =================================================================
   CFG — all weights/benchmarks here
================================================================= */
const CFG = {
    APIFY_ACTOR: 'apify~instagram-profile-scraper',
    CACHE_PFX: 'ia_v1_', CACHE_TTL: 30 * 60 * 1000, MAX_HIST: 10,
    W: { engQ: .30, cons: .20, conv: .15, rhy: .15, fmix: .10, disc: .10 },
    BENCH: {
        nano: { max: 1e4, good: 5.0, avg: 3.0 },
        micro: { max: 1e5, good: 3.5, avg: 2.0 },
        mid: { max: 1e6, good: 2.0, avg: 1.2 },
        macro: { max: 1e7, good: 1.2, avg: 0.7 },
        mega: { max: Infinity, good: 0.8, avg: 0.4 }
    },
    CV_EX: .5, CV_PO: 1.5,
    CPL_ST: 3, CPL_GO: 1.5, CPL_WK: .5,
    PPW_LO: 3, PPW_HI: 7, PPW_MIN: 1,
    HT_ID: 8, CAP_MIN: 80,
    GRADES: [
        { min: 90, g: 'A+', t: 'Excellent', c: '#22c55e' }, { min: 80, g: 'A', t: 'Excellent', c: '#22c55e' },
        { min: 70, g: 'B+', t: 'Strong', c: '#3b82f6' }, { min: 60, g: 'B', t: 'Strong', c: '#3b82f6' },
        { min: 50, g: 'C+', t: 'Average', c: '#f59e0b' }, { min: 40, g: 'C', t: 'Average', c: '#f59e0b' },
        { min: 30, g: 'D+', t: 'Needs Work', c: '#ef4444' }, { min: 0, g: 'D', t: 'Needs Work', c: '#ef4444' }
    ],
    STARS: [80, 65, 50, 35, 0]
};
/* =================================================================
   STORAGE
================================================================= */
const ST = {
    _g(k) { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
    _s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } },
    _d(k) { try { localStorage.removeItem(k) } catch { } },
    gc(u) { const i = this._g(CFG.CACHE_PFX + u.toLowerCase()); if (!i) return null; if (Date.now() - i.ts > CFG.CACHE_TTL) { this._d(CFG.CACHE_PFX + u.toLowerCase()); return null } return i.data },
    sc(u, d) { this._s(CFG.CACHE_PFX + u.toLowerCase(), { ts: Date.now(), data: d }) },
    getHist() { return this._g('ia_hist') || [] },
    addHist(u) { let h = this.getHist().filter(x => x !== u); h.unshift(u); if (h.length > CFG.MAX_HIST) h = h.slice(0, CFG.MAX_HIST); this._s('ia_hist', h) },
    clearHist() { this._d('ia_hist') },
    pref(k, d) { const v = this._g('ia_p_' + k); return v !== null ? v : d },
    setPref(k, v) { this._s('ia_p_' + k, v) }
};
/* =================================================================
   API
================================================================= */
const API = {
    getBaseUrl() {
        if (window.BACKEND_API_URL) return window.BACKEND_API_URL;
        if (window.location.protocol === 'file:' || (window.location.port !== '5000' && window.location.hostname === 'localhost')) {
            return 'http://localhost:5000';
        }
        return '';
    },
    fetch(uns, lim, frc) {
        const fc = {}, nf = [];
        uns.forEach(u => { const c = !frc && ST.gc(u); if (c) fc[u] = c; else nf.push(u) });
        if (!nf.length) return Promise.resolve(fc);
        const url = this.getBaseUrl() + '/api/instagram/analyze';
        return $.ajax({
            url, method: 'POST', contentType: 'application/json',
            data: JSON.stringify({ usernames: nf, resultsLimit: lim }), timeout: 120000
        })
            .then(ds => {
                const r = { ...fc };
                nf.forEach(u => {
                    const m = (ds || []).find(d => (d.username || '').toLowerCase() === u.toLowerCase());
                    if (m) { ST.sc(u, m); r[u] = m }
                });
                return r;
            });
    }
};
/* =================================================================
   METRICS  (pure functions)
================================================================= */
const MX = {
    _med(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = ~~(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 },
    _avg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0 },
    _std(a, mu) { if (a.length < 2) return 0; const m = mu !== undefined ? mu : this._avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) },
    compute(data) {
        const fol = data.followersCount || 0, all = data.latestPosts || [];
        const posts = all.filter(p => p.likesCount != null && p.likesCount >= 0);
        const hid = all.length - posts.length, sz = posts.length;
        if (!sz) return { sz: 0, hid, fol, all, era: [] };
        const lk = posts.map(p => p.likesCount || 0), cm = posts.map(p => p.commentsCount || 0);
        const eng = posts.map(p => (p.likesCount || 0) + (p.commentsCount || 0));
        const era = fol > 0 ? eng.map(e => (e / fol) * 100) : [];
        const aL = this._avg(lk), mL = this._med(lk), aC = this._avg(cm);
        const tL = lk.reduce((s, v) => s + v, 0);
        const er = fol > 0 ? ((aL + aC) / fol) * 100 : 0;
        const cpl = aL > 0 ? (aC / aL) * 100 : 0;
        const em = this._avg(eng), cv = em > 0 ? this._std(eng, em) / em : 0;
        const tpSh = tL > 0 ? (Math.max(...lk, 0) / tL) * 100 : 0;
        const half = ~~(sz / 2); let trend = 'flat', tpct = 0;
        if (half >= 2) {
            const na = this._avg(era.slice(0, half)), oa = this._avg(era.slice(half));
            if (oa > 0) { tpct = ((na - oa) / oa) * 100; trend = tpct > 10 ? 'rising' : tpct < -10 ? 'falling' : 'flat' }
        }
        let ppw = null;
        const ts = posts.map(p => p.timestamp || p.takenAt).filter(Boolean);
        if (ts.length >= 2) {
            const sd = ts.map(t => new Date(t)).filter(d => !isNaN(d)).sort((a, b) => b - a);
            if (sd.length >= 2) { const sp = (sd[0] - sd[sd.length - 1]) / 864e5; if (sp > 0) ppw = (sd.length / sp) * 7 }
        }
        const fmMap = {}, feMap = {};
        posts.forEach(p => { const f = (p.type || 'Image').toLowerCase(); fmMap[f] = (fmMap[f] || 0) + 1; (feMap[f] = feMap[f] || []).push((p.likesCount || 0) + (p.commentsCount || 0)) });
        const fm = Object.entries(fmMap).map(([f, c]) => ({ f, c, sh: (c / sz) * 100, ae: this._avg(feMap[f]), aer: fol > 0 ? (this._avg(feMap[f]) / fol) * 100 : 0 })).sort((a, b) => b.aer - a.aer);
        const vs = fmMap.video ? (fmMap.video / sz) * 100 : 0;
        const htp = this._avg(posts.map(p => (p.hashtags || []).length)), cl = this._avg(posts.map(p => (p.caption || '').length));
        const sp = [...posts].sort((a, b) => ((b.likesCount || 0) + (b.commentsCount || 0)) - ((a.likesCount || 0) + (a.commentsCount || 0)));
        return { fol, sz, hid, all, aL, mL, aC, er, cpl, cv, tL, ppw, haTs: ts.length >= 2, fm, vs, htp, cl, tpSh, trend, tpct, bp: sp[0] || null, era };
    }
};
/* =================================================================
   SCORING
================================================================= */
const SC = {
    _sc(v, lo, hi) { if (hi === lo) return v >= hi ? 100 : 0; return Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) },
    bench(fol) { for (const t of Object.values(CFG.BENCH)) { if (fol <= t.max) return t } return CFG.BENCH.mega },
    compute(m) {
        if (!m.sz) return null;
        const C = {}, W = { ...CFG.W };
        const b = this.bench(m.fol);
        C.engQ = { s: this._sc(m.er, b.avg / 2, b.good), l: 'Engagement Quality', v: m.er.toFixed(2) + '%', w: W.engQ };
        C.cons = { s: Math.max(0, 100 - this._sc(m.cv, CFG.CV_EX, CFG.CV_PO)), l: 'Consistency', v: 'CV ' + m.cv.toFixed(2), w: W.cons };
        C.conv = { s: this._sc(m.cpl, CFG.CPL_WK, CFG.CPL_ST), l: 'Conversation', v: m.cpl.toFixed(1) + ' c/100lk', w: W.conv };
        if (m.haTs && m.ppw !== null) {
            let rs; if (m.ppw < CFG.PPW_MIN) rs = this._sc(m.ppw, 0, CFG.PPW_MIN) * .5;
            else if (m.ppw <= CFG.PPW_HI) rs = this._sc(m.ppw, CFG.PPW_MIN, CFG.PPW_LO) * .5 + 50;
            else rs = 100 - this._sc(m.ppw, CFG.PPW_HI, CFG.PPW_HI * 3) * .5;
            C.rhy = { s: Math.max(0, Math.min(100, rs)), l: 'Posting Rhythm', v: m.ppw.toFixed(1) + ' pw', w: W.rhy };
        } else delete W.rhy;
        const fd = Math.min(100, (m.fm.length / 3) * 100), bf = m.fm.length ? Math.min(100, m.fm[0].sh * 1.5) : 50;
        C.fmix = { s: (fd * .5 + bf * .5), l: 'Content Mix', v: m.fm.length + ' fmt(s)', w: W.fmix };
        C.disc = { s: (this._sc(m.htp, 0, CFG.HT_ID) * .5 + this._sc(m.cl, 0, CFG.CAP_MIN) * .5), l: 'Discoverability', v: m.htp.toFixed(1) + ' tags', w: W.disc };
        const tw = Object.keys(C).reduce((s, k) => s + W[k], 0);
        let ov = 0; Object.entries(C).forEach(([k, c]) => { const nw = W[k] / tw; ov += c.s * nw; c.nw = nw });
        ov = Math.round(ov);
        const gm = CFG.GRADES.find(g => ov >= g.min) || CFG.GRADES[CFG.GRADES.length - 1];
        const conf = m.sz < 8 ? ['Low', 'cfl'] : m.sz <= 20 ? ['Medium', 'cfm'] : ['High', 'cfh'];
        let stars = 0; CFG.STARS.forEach((t, i) => { if (ov >= t && !stars) stars = 5 - i });
        return { ov, g: gm.g, t: gm.t, c: gm.c, C, conf, stars };
    }
};
/* =================================================================
   INSIGHTS  (rule-based)
================================================================= */
const IN = {
    R: [
        { sv: 'str', c: (m, s) => s && s.C.engQ && s.C.engQ.s >= 70, g: (m) => 'Engagement rate of <strong>' + m.er.toFixed(2) + '%</strong> outperforms the approx. industry benchmark for this tier (approx. avg: <strong>' + SC.bench(m.fol).avg + '%</strong>).' },
        { sv: 'wk', c: (m, s) => s && s.C.engQ && s.C.engQ.s < 40, g: (m) => 'Engagement rate of <strong>' + m.er.toFixed(2) + '%</strong> is below the approx. industry avg of <strong>' + SC.bench(m.fol).avg + '%</strong> for this follower tier.' },
        { sv: 'str', c: (m) => m.cv < CFG.CV_EX, g: (m) => 'Very consistent posting &mdash; CV <strong>' + m.cv.toFixed(2) + '</strong> (threshold &le;' + CFG.CV_EX + ') shows steady audience response.' },
        { sv: 'wk', c: (m) => m.cv > CFG.CV_PO, g: (m) => 'High engagement volatility (CV=<strong>' + m.cv.toFixed(2) + '</strong>) &mdash; results depend on a few outlier posts.' },
        { sv: 'str', c: (m) => m.cpl >= CFG.CPL_ST, g: (m) => 'Strong conversation: <strong>' + m.cpl.toFixed(1) + ' comments per 100 likes</strong> signals a highly engaged community.' },
        { sv: 'wk', c: (m) => m.cpl < CFG.CPL_WK, g: (m) => 'Low comment ratio: only <strong>' + m.cpl.toFixed(1) + ' cmts/100 likes</strong>. Captions with CTAs can help.' },
        { sv: 'cnt', c: (m) => m.fm.length >= 2 && m.fm[0].f === 'video' && m.fm[0].aer > (m.fm[1]?.aer || 0) * 1.3, g: (m) => 'Videos earn <strong>' + ((m.fm[0].aer / (m.fm[1]?.aer || 1)).toFixed(1)) + 'x</strong> the engagement of ' + (m.fm[1]?.f || 'images') + '.' },
        { sv: 'cnt', c: (m) => m.fm.length >= 2 && m.fm[0].f === 'sidecar' && m.fm[0].aer > (m.fm[1]?.aer || 0) * 1.2, g: (m) => 'Carousels outperform: <strong>' + m.fm[0].aer.toFixed(2) + '%</strong> vs <strong>' + (m.fm[1]?.aer || 0).toFixed(2) + '%</strong> for ' + (m.fm[1]?.f || 'images') + '.' },
        { sv: 'cnt', c: (m) => m.tpSh > 40 && m.sz >= 5, g: (m) => 'Outlier dependence: top post drives <strong>' + m.tpSh.toFixed(0) + '%</strong> of all sampled likes.' },
        { sv: 'cnt', c: (m) => m.trend === 'rising', g: (m) => 'Trend <strong class="tu">&#x2191; rising</strong>: newer posts are <strong>' + Math.abs(m.tpct).toFixed(0) + '%</strong> higher than older ones.' },
        { sv: 'cnt', c: (m) => m.trend === 'falling', g: (m) => 'Trend <strong class="td2">&#x2193; falling</strong>: engagement dropped <strong>' + Math.abs(m.tpct).toFixed(0) + '%</strong> in recent posts.' },
        { sv: 'act', prio: 'High', act: 'Add 5-10 targeted hashtags per post to maximise discoverability.', c: (m) => m.htp < 2, g: () => 'Very few hashtags (avg &lt;2/post).' },
        { sv: 'act', prio: 'Medium', act: 'Write captions of 100-200 chars with a hook and a CTA.', c: (m) => m.cl < CFG.CAP_MIN, g: (m) => 'Short captions (avg ' + Math.round(m.cl) + ' chars) — longer captions drive more comments.' },
        { sv: 'act', prio: 'High', act: 'Increase Reels/video output — they outperform in this account.', c: (m) => m.vs < 20 && m.fm.some(f => f.f === 'video' && f.aer > m.er * 1.2), g: (m) => 'Videos earn ' + (m.fm.find(f => f.f === 'video')?.aer || 0).toFixed(2) + '% eng but are only ' + m.vs.toFixed(0) + '% of posts.' },
        { sv: 'act', prio: 'Medium', act: 'End every caption with an open-ended question to invite comments.', c: (m) => m.cpl < CFG.CPL_GO, g: () => 'Low comment-to-like ratio.' },
        { sv: 'act', prio: 'High', act: 'Increase posting cadence to at least ' + CFG.PPW_MIN + ' post/week.', c: (m) => m.haTs && m.ppw !== null && m.ppw < CFG.PPW_MIN, g: (m) => 'Posting ' + (m.ppw || 0).toFixed(1) + '/wk is below recommended minimum of ' + CFG.PPW_MIN + '/wk.' }
    ],
    run(m, s) {
        if (!m.sz) return null;
        const fired = this.R.filter(r => { try { return r.c(m, s) } catch { return false } });
        const topC = s ? Object.entries(s.C).sort((a, b) => b[1].s - a[1].s)[0][1] : null;
        const hl = s ? '<i class="bi bi-award me-1"></i>Grade <strong>' + s.g + '</strong> &middot; <strong>' + s.t + '</strong> account &mdash; main driver: <strong>' + (topC?.l || 'N/A') + '</strong>.' : 'Score unavailable.';
        return { hl, str: fired.filter(r => r.sv === 'str'), wk: fired.filter(r => r.sv === 'wk'), cnt: fired.filter(r => r.sv === 'cnt'), act: fired.filter(r => r.sv === 'act') };
    },
    qa(q, m, s) {
        if (!m.sz) return 'No data yet.';
        const topC = s ? Object.entries(s.C).sort((a, b) => b[1].s - a[1].s)[0][1] : null;
        if (q === 'score') return s ? '<strong>Score: ' + s.ov + '/100 (' + s.g + ')</strong>. Top: <em>' + (topC?.l) + '</em> (' + Math.round(topC?.s) + '/100). All: ' + Object.values(s.C).map(c => c.l + ' ' + Math.round(c.s)).join(', ') + '.' : 'No score.';
        if (q === 'format') { const b = m.fm[0]; return b ? 'Best: <strong>' + b.f + '</strong> at <strong>' + b.aer.toFixed(2) + '%</strong> avg eng rate (' + b.c + ' posts).' : 'Not enough data.'; }
        if (q === 'comments') return 'Current: <strong>' + m.cpl.toFixed(1) + ' cmts/100 likes</strong>. Improve: add questions to captions, reply fast in first hour.';
        if (q === 'trend') return 'Trend: <strong>' + m.trend + '</strong>' + (m.trend !== 'flat' ? ' (' + Math.abs(m.tpct).toFixed(0) + '% ' + (m.trend === 'rising' ? '&#x2191; rise' : '&#x2193; drop') + ' in recent posts)' : '(within &plusmn;10%)') + '.';
        if (q === 'bestpost') { const bp = m.bp; if (!bp) return 'No data.'; const cap = esc((bp.caption || '').substring(0, 80)) + (bp.caption?.length > 80 ? '&hellip;' : ''); return '<strong>' + (bp.likesCount || 0).toLocaleString() + ' likes + ' + (bp.commentsCount || 0).toLocaleString() + ' comments</strong><br>"' + cap + '"'; }
        return '';
    }
};
/* =================================================================
   CHARTS
================================================================= */
const CH = {
    _c: {}, dk() { return document.documentElement.getAttribute('data-theme') === 'dark' },
    gc() { return this.dk() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)' }, lc() { return this.dk() ? '#94a3b8' : '#6c757d' },
    del(id) { if (this._c[id]) { this._c[id].destroy(); delete this._c[id] } },
    bar(id, lbs, ds) {
        this.del(id); const ctx = document.getElementById(id); if (!ctx) return;
        this._c[id] = new Chart(ctx, {
            type: 'bar', data: { labels: lbs, datasets: ds }, options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: this.lc(), font: { size: 11 } } } },
                scales: { x: { grid: { color: this.gc() }, ticks: { color: this.lc() } }, y: { beginAtZero: true, grid: { color: this.gc() }, ticks: { color: this.lc() } } }
            }
        });
    },
    dnt(id, lbs, data, cols) {
        this.del(id); const ctx = document.getElementById(id); if (!ctx) return;
        this._c[id] = new Chart(ctx, {
            type: 'doughnut', data: { labels: lbs, datasets: [{ data, backgroundColor: cols, borderWidth: 2, borderColor: this.dk() ? '#1e2029' : '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: this.lc(), font: { size: 11 } } } } }
        });
    },
    rdr(id, lbs, ds) {
        this.del(id); const ctx = document.getElementById(id); if (!ctx) return;
        this._c[id] = new Chart(ctx, {
            type: 'radar', data: { labels: lbs, datasets: ds }, options: {
                responsive: true, maintainAspectRatio: false,
                scales: { r: { min: 0, max: 100, beginAtZero: true, grid: { color: this.gc() }, ticks: { display: false }, pointLabels: { color: this.lc(), font: { size: 10 } } } },
                plugins: { legend: { display: ds.length > 1, position: 'bottom', labels: { color: this.lc(), font: { size: 11 } } } }
            }
        });
    },
    line(id, lbs, ds) {
        this.del(id); const ctx = document.getElementById(id); if (!ctx) return;
        this._c[id] = new Chart(ctx, {
            type: 'line', data: { labels: lbs, datasets: ds }, options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: this.lc(), font: { size: 11 } } } },
                scales: { x: { grid: { color: this.gc() }, ticks: { color: this.lc() } }, y: { beginAtZero: true, grid: { color: this.gc() }, ticks: { color: this.lc() } } }
            }
        });
    }
};
/* =================================================================
   HELPERS
================================================================= */
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function fn(n) { return n == null ? '--' : Number(n).toLocaleString() }
function fp(n, d = 2) { return n == null ? '--' : Number(n).toFixed(d) + '%' }
function proxy(u, name) {
    if (!u) return ''; if (u.startsWith('data:')) return u;
    const c = u.replace(/^https?:\/\//, '');
    const fb = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'User') + '&background=e1306c&color=fff';
    return 'https://wsrv.nl/?url=' + encodeURIComponent(c) + '&default=' + encodeURIComponent(fb);
}
function letterAv(name, sz) {
    sz = sz || 160;
    const cn = (name || '').replace(/[^a-zA-Z0-9\s]/g, '').trim(), w = cn.split(/\s+/).filter(Boolean);
    let ini = 'IG'; if (w.length >= 2) ini = (w[0][0] + w[1][0]).toUpperCase();
    else if (w.length && w[0].length >= 2) ini = w[0].substring(0, 2).toUpperCase();
    else if (w.length) ini = w[0][0].toUpperCase();
    return 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'' + sz + '\' height=\'' + sz + '\' viewBox=\'0 0 ' + sz + ' ' + sz + '\'>' +
        '<defs><linearGradient id=\'g\' x1=\'0%\' y1=\'0%\' x2=\'100%\' y2=\'100%\'><stop offset=\'0%\' stop-color=\'%23f09433\'/>' +
        '<stop offset=\'50%\' stop-color=\'%23dc2743\'/><stop offset=\'100%\' stop-color=\'%23bc1888\'/></linearGradient></defs>' +
        '<rect width=\'100%\' height=\'100%\' fill=\'url(%23g)\'/>' +
        '<text x=\'50%\' y=\'54%\' font-family=\'system-ui\' font-weight=\'700\' font-size=\'' + Math.round(sz * .42) + 'px\' fill=\'%23ffffff\' dominant-baseline=\'middle\' text-anchor=\'middle\'>' + esc(ini) + '</text></svg>';
}
function cleanU(r) { let u = (r || '').trim().replace(/^@/, ''); u = u.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, ''); return u.split('/')[0].split('?')[0].toLowerCase().trim() }
function setBtn(sel, on, txt) { $(sel).prop('disabled', on).html(on ? '<span class="spinner-border spinner-border-sm me-1"></span>' + txt : txt) }
/* =================================================================
   MODULE 9 — RENDER SINGLE
================================================================= */
let cM = null, cS = null, cD = null;
function render(data) {
    cD = data;
    const dn = data.fullName || data.name || data.username || 'User';
    const ra = data.profilePicUrlHD || data.profilePicUrl;
    const fb = letterAv(dn, 160), sa = ra ? proxy(ra, dn) : fb;
    $('#uName').text(dn); $('#uHdl').text('@' + (data.username || ''));
    $('#uBio').text(data.biography || ''); $('#uCat').text(data.businessCategoryName || 'Public Profile');
    data.verified ? $('#verBadge').removeClass('d-none') : $('#verBadge').addClass('d-none');
    $('#uAv').off('error').on('error', function () { $(this).off('error').attr('src', fb) }).attr('src', sa);
    $('#extLink').attr('href', 'https://www.instagram.com/' + encodeURIComponent(data.username || '') + '/').removeClass('d-none');
    const m = MX.compute(data), s = SC.compute(m); cM = m; cS = s;
    renderKPI(m, s, data); renderRing(s, m); renderBars(s);
    if (s) { const cv = Object.values(s.C); CH.rdr('rdrChart', cv.map(c => c.l), [{ label: dn, data: cv.map(c => Math.round(c.s)), backgroundColor: 'rgba(220,39,67,.15)', borderColor: '#dc2743', pointBackgroundColor: '#dc2743' }]) }
    renderIns(m, s); renderBarChart(m); renderFmtChart(m); renderTable(m, data); renderFormulas(m, s);
    $('#emptyState,#cmpWrap').addClass('d-none'); $('#resWrap').removeClass('d-none');
    setTimeout(() => { if (s) { const el = document.getElementById('rFill'); if (el) { el.style.strokeDashoffset = 376.99 - (s.ov / 100) * 376.99; el.style.stroke = s.c } } }, 50);
}
function renderKPI(m, s, d) {
    const trend = m.sz ? m.trend === 'rising' ? '&#x2191; Rising' : m.trend === 'falling' ? '&#x2193; Falling' : '&#x2192; Flat' : '--';
    const items = [
        { i: 'bi-people-fill', bg: 'rgba(59,130,246,.12)', c: '#3b82f6', l: 'Followers', v: fn(m.fol), s: 'Total audience' },
        { i: 'bi-grid-3x3-gap-fill', bg: 'rgba(34,197,94,.12)', c: '#22c55e', l: 'Total Posts', v: fn(d.postsCount), s: 'Published media' },
        { i: 'bi-heart-fill', bg: 'rgba(239,68,68,.12)', c: '#ef4444', l: 'Avg Likes', v: m.sz ? fn(Math.round(m.aL)) : '--', s: 'Median: ' + (m.sz ? fn(Math.round(m.mL)) : '--') },
        { i: 'bi-chat-fill', bg: 'rgba(168,85,247,.12)', c: '#a855f7', l: 'Avg Comments', v: m.sz ? fn(Math.round(m.aC)) : '--', s: 'Per post' },
        { i: 'bi-activity', bg: 'rgba(220,39,67,.12)', c: '#dc2743', l: 'Eng. Rate', v: m.sz ? fp(m.er) : '--', s: '(likes+comments)/followers' },
        { i: 'bi-chat-quote-fill', bg: 'rgba(245,158,11,.12)', c: '#f59e0b', l: 'Cmts/100 Likes', v: m.sz ? m.cpl.toFixed(1) : '--', s: 'Conversation depth' },
        { i: 'bi-graph-up-arrow', bg: 'rgba(16,185,129,.12)', c: '#10b981', l: 'Trend', v: trend, s: m.sz && m.trend !== 'flat' ? Math.abs(m.tpct).toFixed(0) + '% shift' : 'Sample-based' },
        { i: 'bi-speedometer2', bg: 'rgba(99,102,241,.12)', c: '#6366f1', l: 'Account Score', v: s ? s.ov + '/100' : '--', s: s ? s.g + ' · ' + s.t : 'Needs data' },
    ];
    $('#kpiRow').html(items.map(k => '<div class="col-lg-3 col-md-4 col-sm-6"><div class="kpi ca-hv"><div class="d-flex align-items-center gap-2 mb-2"><div class="kpi-ico" style="background:' + k.bg + '"><i class="bi ' + k.i + '" style="color:' + k.c + '"></i></div><span class="kpi-l">' + esc(k.l) + '</span></div><div class="kpi-v">' + k.v + '</div><div class="kpi-s">' + esc(k.s) + '</div></div></div>').join(''));
}
function renderRing(s, m) {
    if (!s) { $('#sVal').text('N/A'); $('#sGrd,#sConf,#sBase').html(''); $('#sTier').text('Insufficient data').attr('class', 'badge bg-secondary rounded-pill'); return }
    $('#sVal').text(s.ov); $('#sGrd').text(s.g + ' · ' + '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars));
    $('#sTier').text(s.t).css({ background: s.c + '20', color: s.c, border: '1px solid ' + s.c + '40' }).attr('class', 'badge rounded-pill');
    $('#sConf').html('<span class="conf ' + s.conf[1] + '"><i class="bi bi-shield-check"></i> ' + s.conf[0] + ' Confidence</span>');
    $('#sBase').text('based on the last ' + m.sz + ' posts');
}
function renderBars(s) {
    if (!s) { $('#cBars').html('<div style="font-size:12px;color:var(--tm)">No scoring data.</div>'); return }
    $('#cBars').html(Object.values(s.C).map(c => '<div class="cb-w"><div class="d-flex justify-content-between mb-1"><span style="font-size:11px;font-weight:600">' + esc(c.l) + '</span><span style="font-size:11px;color:var(--tm)">' + Math.round(c.s) + '/100 <span style="opacity:.6">(' + Math.round(c.nw * 100) + '%)</span></span></div><div class="cb-t"><div class="cb-f" style="width:' + Math.round(c.s) + '%"></div></div></div>').join(''));
}
function renderIns(m, s) {
    const ins = IN.run(m, s); if (!ins) return;
    $('#insHL').html(ins.hl);
    const ic = (r, cls, bg, icn, col) => '<div class="ic ' + cls + ' d-flex gap-3"><div class="ic-i" style="background:' + bg + '"><i class="bi ' + icn + '" style="color:' + col + '"></i></div><div style="font-size:12px;line-height:1.6">' + r.g(m, s) + '</div></div>';
    $('#strList').html(ins.str.length ? ins.str.map(r => ic(r, 'str', 'rgba(34,197,94,.12)', 'bi-check-lg', 'var(--gn)')).join('') : '<div style="font-size:12px;color:var(--tm)">No standout strengths.</div>');
    $('#wkList').html(ins.wk.length ? ins.wk.map(r => ic(r, 'wk', 'rgba(239,68,68,.12)', 'bi-exclamation-lg', 'var(--rd)')).join('') : '<div style="font-size:12px;color:var(--tm)">No major weaknesses.</div>');
    $('#cIns').html(ins.cnt.length ? ins.cnt.map(r => ic(r, 'inf', 'rgba(245,158,11,.12)', 'bi-info-lg', 'var(--ye)')).join('') : '<div style="font-size:12px;color:var(--tm)">No content insights generated.</div>');
    const PC = { High: 'ph', Medium: 'pm', Low: 'pl' };
    $('#actList').html(ins.act.length ? ins.act.slice(0, 5).map(r => '<div class="ic act d-flex gap-3"><div class="ic-i" style="background:rgba(59,130,246,.12)"><i class="bi bi-arrow-right" style="color:var(--bl)"></i></div><div style="font-size:12px;line-height:1.6"><span class="badge rounded-pill ' + (PC[r.prio] || 'pl') + ' me-1" style="font-size:10px">' + esc(r.prio || 'Low') + '</span>' + esc(r.act || '') + '</div></div>').join('') : '<div style="font-size:12px;color:var(--tm)">No actions needed.</div>');
    const cavs = [];
    if (m.hid > 0) cavs.push('<i class="bi bi-eye-slash me-1"></i>' + m.hid + ' post(s) excluded (hidden likes).');
    if (m.sz < 8) cavs.push('<i class="bi bi-exclamation-triangle me-1"></i>Small sample (' + m.sz + ' posts) &mdash; treat with caution.');
    if (!m.haTs) cavs.push('<i class="bi bi-clock me-1"></i>No timestamps &mdash; posting rhythm not calculated.');
    $('#cavList').html(cavs.length ? '<div class="d-flex flex-column gap-2">' + cavs.map(c => '<div style="font-size:11px;color:var(--tm)">' + c + '</div>').join('') + '</div>' : '');
}
function renderBarChart(m) {
    const ps = m.all || []; if (!ps.length) return;
    CH.bar('barChart', ps.map((_, i) => 'P' + (i + 1)), [
        { label: 'Likes', data: ps.map(p => p.likesCount || 0), backgroundColor: 'rgba(220,39,67,.75)', borderRadius: 5 },
        { label: 'Comments', data: ps.map(p => p.commentsCount || 0), backgroundColor: 'rgba(59,130,246,.75)', borderRadius: 5 }]);
}
function renderFmtChart(m) {
    if (!m.fm || !m.fm.length) return;
    const CLR = ['#dc2743', '#bc1888', '#f09433', '#3b82f6', '#22c55e', '#a855f7'];
    CH.dnt('fmtChart', m.fm.map(f => f.f.charAt(0).toUpperCase() + f.f.slice(1)), m.fm.map(f => f.c), CLR.slice(0, m.fm.length));
}
function renderTable(m, data) {
    const ps = m.all || [], ra = data.profilePicUrlHD || data.profilePicUrl;
    const fb = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop';
    m.hid > 0 ? $('#hdnNote').text(m.hid + ' post(s) excluded (hidden likes).').removeClass('d-none') : $('#hdnNote').addClass('d-none');
    if (!ps.length) { $('#pTable').html('<tr><td colspan="7" class="text-center py-5" style="color:var(--tm)">No posts available.</td></tr>'); return }
    $('#pTable').html(ps.map((p, i) => {
        const lk = p.likesCount || 0, cm = p.commentsCount || 0, rc = p.caption || '';
        const isH = p.likesCount == null || p.likesCount < 0;
        const cap = esc(rc.substring(0, 60)) + (rc.length > 60 ? '&hellip;' : '');
        const url = esc(p.url || ('https://www.instagram.com/p/' + encodeURIComponent(p.shortCode || '') + '/'));
        const rt = p.displayUrl || ra, st = rt ? proxy(rt, 'Post') : fb;
        const tags = (p.hashtags || []).slice(0, 3).map(t => '<span class="badge bg-light text-primary border me-1" style="font-size:10px">#' + esc(t) + '</span>').join('');
        const per = m.fol > 0 ? ((lk + cm) / m.fol * 100).toFixed(2) : '--';
        const f = esc(p.type || 'Image'), fc = f.toLowerCase() === 'video' ? '#ef4444' : f.toLowerCase() === 'sidecar' ? '#a855f7' : '#3b82f6';
        return '<tr' + (isH ? ' style="opacity:.6"' : '') + '>' +
            '<td><img src="' + st + '" class="pt" alt="P' + (i + 1) + '" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + fb + '\'"></td>' +
            '<td><div class="fw7" style="font-size:12px">' + cap + '</div><div class="mt-1">' + tags + '</div></td>' +
            '<td><span class="badge rounded-pill" style="background:' + fc + '20;color:' + fc + ';border:1px solid ' + fc + '40;font-size:10px">' + f + '</span></td>' +
            '<td class="fw7" style="color:var(--rd)">' + (isH ? '<span style="color:var(--tm)">Hidden</span>' : lk.toLocaleString()) + '</td>' +
            '<td class="fw7" style="color:var(--bl)">' + cm.toLocaleString() + '</td>' +
            '<td style="font-size:12px">' + (isH ? '--' : per + '%') + '</td>' +
            '<td><a href="' + url + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-secondary" style="font-size:11px;border-radius:8px;padding:4px 8px"><i class="bi bi-box-arrow-up-right"></i></a></td>' +
            '</tr>';
    }).join(''));
}
function renderFormulas(m, s) {
    const b = m.fol ? SC.bench(m.fol) : null;
    const tier = m.fol < 1e4 ? 'Nano' : m.fol < 1e5 ? 'Micro' : m.fol < 1e6 ? 'Mid' : m.fol < 1e7 ? 'Macro' : 'Mega';
    $('#scForm').html('<div class="row g-3"><div class="col-md-6"><strong>Formulas used:</strong><ul class="mt-2" style="line-height:2">' +
        '<li><strong>Eng Rate</strong> = (avgLikes + avgComments) / followers &times; 100</li>' +
        '<li><strong>Consistency (CV)</strong> = stddev(eng) / mean(eng)</li>' +
        '<li><strong>Cmts/100 Likes</strong> = avgComments / avgLikes &times; 100</li>' +
        '<li><strong>Trend</strong> = newer half vs older half of per-post eng rates</li>' +
        '<li><strong>postsPerWeek</strong> = count / spanDays &times; 7</li>' +
        '</ul></div><div class="col-md-6"><strong>Scoring components:</strong><ul class="mt-2" style="line-height:2">' +
        (s ? Object.values(s.C).map(c => '<li>' + esc(c.l) + ': <strong>' + Math.round(c.nw * 100) + '% wt</strong> &rarr; ' + Math.round(c.s) + '/100 (' + esc(c.v) + ')</li>').join('') : '<li>No data.</li>') +
        '</ul>' + (b ? '<p class="mt-2"><em>Approx. benchmarks for ' + tier + ':</em><br>Good: &ge;' + b.good + '% &middot; Avg: ~' + b.avg + '%<br><small style="color:var(--tm)">Approximate benchmarks, not facts from data.</small></p>' : '') +
        '</div></div>');
}
/* =================================================================
   MODULE 10 — COMPARE
================================================================= */
function renderCmp(dA, dB) {
    const mA = MX.compute(dA), mB = MX.compute(dB), sA = SC.compute(mA), sB = SC.compute(mB);
    profMini(dA, 'profA'); profMini(dB, 'profB');
    const ringCard = (sfx, s, name) => '<div class="col-md-6"><div class="ca p-4 text-center"><div class="fw7 mb-3">' + esc(name) + '</div>' +
        '<div style="position:relative;width:120px;height:120px;display:inline-flex;align-items:center;justify-content:center">' +
        '<svg viewBox="0 0 140 140" style="position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)">' +
        '<circle class="ring-t" cx="70" cy="70" r="60"/><circle class="ring-f" id="rF' + sfx + '" cx="70" cy="70" r="60" stroke-dasharray="376.99" stroke-dashoffset="376.99" stroke="' + (s ? s.c : '#ccc') + '"/></svg>' +
        '<div><div class="ring-n" style="font-size:1.5rem">' + (s ? s.ov : 'N/A') + '</div><div class="ring-g">' + (s ? s.g : '--') + '</div></div></div>' +
        '<div class="mt-2"><span class="badge rounded-pill" style="font-size:11px;background:' + (s ? s.c + '20' : '#ccc') + ';color:' + (s ? s.c : '#666') + ';border:1px solid ' + (s ? s.c + '40' : '#ddd') + '">' + (s ? s.t : '--') + '</span></div>' +
        '<hr class="dvd">' + (s ? Object.values(s.C).map(c => '<div class="cb-w text-start"><div class="d-flex justify-content-between mb-1"><span style="font-size:10px;font-weight:600">' + esc(c.l) + '</span><span style="font-size:10px;color:var(--tm)">' + Math.round(c.s) + '</span></div><div class="cb-t"><div class="cb-f" style="width:' + Math.round(c.s) + '%"></div></div></div>').join('') : '<div style="font-size:12px;color:var(--tm)">No data.</div>') +
        '</div></div>';
    $('#cmpSR').html(ringCard('A', sA, dA.fullName || dA.username) + ringCard('B', sB, dB.fullName || dB.username));
    setTimeout(() => {
        if (sA) { const el = document.getElementById('rFA'); if (el) { el.style.strokeDashoffset = 376.99 - (sA.ov / 100) * 376.99; el.style.stroke = sA.c } }
        if (sB) { const el = document.getElementById('rFB'); if (el) { el.style.strokeDashoffset = 376.99 - (sB.ov / 100) * 376.99; el.style.stroke = sB.c } }
    }, 100);
    const cL = sA ? Object.values(sA.C).map(c => c.l) : sB ? Object.values(sB.C).map(c => c.l) : [];
    const rds = [];
    if (sA) rds.push({ label: esc(dA.username), data: Object.values(sA.C).map(c => Math.round(c.s)), backgroundColor: 'rgba(220,39,67,.15)', borderColor: '#dc2743', pointBackgroundColor: '#dc2743' });
    if (sB) rds.push({ label: esc(dB.username), data: Object.values(sB.C).map(c => Math.round(c.s)), backgroundColor: 'rgba(59,130,246,.15)', borderColor: '#3b82f6', pointBackgroundColor: '#3b82f6' });
    if (rds.length) CH.rdr('cmpRdr', cL, rds);
    const ml = Math.max(mA.era.length, mB.era.length), ll = Array.from({ length: ml }, (_, i) => 'P' + (i + 1));
    CH.line('cmpLine', ll, [
        { label: esc(dA.username), data: mA.era, borderColor: '#dc2743', backgroundColor: 'rgba(220,39,67,.1)', fill: true, tension: .3 },
        { label: esc(dB.username), data: mB.era, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)', fill: true, tension: .3 }]);
    const rows = [
        { l: 'Followers', a: fn(mA.fol), b: fn(mB.fol), ar: mA.fol, br: mB.fol },
        { l: 'Avg Likes', a: fn(Math.round(mA.aL)), b: fn(Math.round(mB.aL)), ar: mA.aL, br: mB.aL },
        { l: 'Avg Comments', a: fn(Math.round(mA.aC)), b: fn(Math.round(mB.aC)), ar: mA.aC, br: mB.aC },
        { l: 'Eng. Rate', a: fp(mA.er), b: fp(mB.er), ar: mA.er, br: mB.er },
        { l: 'Cmts/100 Likes', a: mA.cpl.toFixed(1), b: mB.cpl.toFixed(1), ar: mA.cpl, br: mB.cpl },
        { l: 'Consistency (CV)', a: mA.cv.toFixed(2), b: mB.cv.toFixed(2), ar: -mA.cv, br: -mB.cv },
        { l: 'Account Score', a: sA ? sA.ov : '--', b: sB ? sB.ov : '--', ar: sA ? sA.ov : -1, br: sB ? sB.ov : -1 },
        { l: 'Trend', a: mA.trend, b: mB.trend, ar: null, br: null },
    ];
    $('#cmpTbl').html('<thead><tr><th>Metric</th><th style="color:#dc2743">' + esc(dA.username) + ' (A)</th><th style="color:#3b82f6">' + esc(dB.username) + ' (B)</th><th>Winner</th><th>Diff A vs B</th></tr></thead><tbody>' +
        rows.map(r => {
            let win = '&mdash;', dif = '&mdash;', wc = '';
            if (r.ar !== null && r.br !== null && r.ar !== -1 && r.br !== -1) {
                if (r.ar > r.br) { win = 'A'; wc = '#dc2743' } else if (r.br > r.ar) { win = 'B'; wc = '#3b82f6' } else win = 'Tie';
                if (typeof r.ar === 'number' && typeof r.br === 'number') { const p = r.br !== 0 ? (((r.ar - r.br) / Math.abs(r.br)) * 100).toFixed(1) : '--'; dif = p + '%' }
            }
            return '<tr><td class="fw7" style="font-size:12px">' + esc(r.l) + '</td><td style="font-size:12px">' + r.a + '</td><td style="font-size:12px">' + r.b + '</td>' +
                '<td>' + (win !== '&mdash;' && win !== 'Tie' ? '<span class="wb" style="background:' + wc + '20;color:' + wc + ';border:1px solid ' + wc + '40">' + win + '</span>' : win) + '</td>' +
                '<td style="font-size:11px;color:var(--tm)">' + dif + '</td></tr>';
        }).join('') + '</tbody>');
    renderVerdict(mA, mB, sA, sB, dA, dB);
    $('#emptyState,#resWrap').addClass('d-none'); $('#cmpWrap').removeClass('d-none');
}
function profMini(data, id) {
    const dn = esc(data.fullName || data.name || data.username || '--');
    const fb = letterAv(dn), ra = data.profilePicUrlHD || data.profilePicUrl, av = ra ? proxy(ra, dn) : fb;
    $('#' + id).html('<div class="d-flex align-items-center gap-3"><img src="' + av + '" class="av av-sm" alt="Av" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + fb + '\'"><div>' +
        '<div class="fw7">' + dn + (data.verified ? ' <i class="bi bi-patch-check-fill text-primary"></i>' : '') + '</div>' +
        '<div style="font-size:12px;color:var(--tm)">@' + esc(data.username || '--') + '</div>' +
        '<div style="font-size:11px;color:var(--tm)">' + fn(data.followersCount) + ' followers</div></div></div>');
}
function renderVerdict(mA, mB, sA, sB, dA, dB) {
    const nA = esc(dA.fullName || dA.username), nB = esc(dB.fullName || dB.username);
    const scA = sA ? sA.ov : 0, scB = sB ? sB.ov : 0, win = scA > scB ? nA : scB > scA ? nB : 'Tied', mg = Math.abs(scA - scB);
    const fgap = mA.fol && mB.fol ? Math.abs(mA.fol - mB.fol) / Math.max(mA.fol, mB.fol) : 0;
    const gnote = fgap > .5 ? '<div style="font-size:11px;color:var(--tm);margin-top:8px"><i class="bi bi-info-circle me-1"></i>Note: ' + nA + ' has ' + fn(mA.fol) + ' vs ' + nB + '\'s ' + fn(mB.fol) + ' followers. Engagement <strong>rate</strong> (not raw likes) is compared for fairness.</div>' : '';
    const lB = [], lA = [];
    if (mB.er > mA.er * 1.2) lB.push(nA + ' could study ' + nB + '\'s posting style &mdash; higher eng rate (' + fp(mB.er) + ' vs ' + fp(mA.er) + ').');
    if (mA.er > mB.er * 1.2) lA.push(nB + ' could study ' + nA + '\'s posting style &mdash; higher eng rate (' + fp(mA.er) + ' vs ' + fp(mB.er) + ').');
    if (mB.cpl > mA.cpl * 1.3) lB.push(nA + ' should adopt ' + nB + '\'s caption approach &mdash; ' + mB.cpl.toFixed(1) + ' vs ' + mA.cpl.toFixed(1) + ' cmts / 100 likes.');
    if (mA.cpl > mB.cpl * 1.3) lA.push(nB + ' should adopt ' + nA + '\'s caption approach &mdash; ' + mA.cpl.toFixed(1) + ' vs ' + mB.cpl.toFixed(1) + ' cmts / 100 likes.');
    if (mB.fm.length && mA.fm.length && mB.fm[0].f !== mA.fm[0].f) lB.push(nA + ' may benefit from testing more <strong>' + mB.fm[0].f + '</strong> &mdash; ' + nB + '\'s top format at ' + fp(mB.fm[0].aer, 2) + ' eng.');
    $('#cmpVerdict').html('<div class="ic ' + (scA !== scB ? 'str' : 'inf') + ' mb-3"><strong>Winner: ' + win + '</strong>' + (mg ? ' by <strong>' + mg + '</strong> points' : '') + '. ' + nA + ' = <strong>' + scA + '/100 (' + (sA ? sA.g : '--') + ')</strong>, ' + nB + ' = <strong>' + scB + '/100 (' + (sB ? sB.g : '--') + ')</strong>.' + gnote + '</div>' +
        (lB.length ? '<div class="st">What ' + nA + ' can learn from ' + nB + ':</div>' + lB.map(l => '<div class="ic inf mb-2" style="font-size:12px">' + l + '</div>').join('') : '') +
        (lA.length ? '<div class="st mt-2">What ' + nB + ' can learn from ' + nA + ':</div>' + lA.map(l => '<div class="ic inf mb-2" style="font-size:12px">' + l + '</div>').join('') : ''));
}
/* =================================================================
   MODULE 11 — REPORT
================================================================= */
function buildReport() {
    if (!cD || !cM) return '';
    const m = cM, s = cS, d = cD;
    return ['InstaAnalytics AI - Report for @' + d.username, 'Generated: ' + new Date().toLocaleString(), '='.repeat(50), '',
    'Profile: ' + (d.fullName || d.username), 'Followers: ' + fn(m.fol) + ' | Posts: ' + fn(d.postsCount), 'Bio: ' + (d.biography || ''), '',
        '--- METRICS ---', 'Avg Likes:    ' + Math.round(m.aL).toLocaleString(), 'Median Likes: ' + Math.round(m.mL).toLocaleString(),
    'Avg Comments: ' + Math.round(m.aC).toLocaleString(), 'Eng Rate:     ' + m.er.toFixed(2) + '%',
    'Cmts/100 Lk:  ' + m.cpl.toFixed(1), 'Consistency:  CV ' + m.cv.toFixed(2) + ' (lower=steadier)',
    'Trend:        ' + m.trend + ' (' + m.tpct.toFixed(0) + '%)', 'Sample:       ' + m.sz + ' posts', '',
    (s ? ['--- ACCOUNT SCORE ---', 'Overall: ' + s.ov + ' / 100 (' + s.g + ' · ' + s.t + ')', 'Stars: ' + '★'.repeat(s.stars), 'Confidence: ' + s.conf[0], 'Components:', ...Object.values(s.C).map(c => '  ' + c.l + ': ' + Math.round(c.s) + ' / 100 - ' + c.v)].join('\n') : ''),
        '', '--- FORMAT MIX ---', ...m.fm.map(f => '  ' + f.f + ': ' + f.c + ' posts (' + f.sh.toFixed(0) + '%) · Avg Eng Rate: ' + f.aer.toFixed(2) + '%')
    ].join('\n');
}
/* =================================================================
   MODULE 12 — HISTORY
================================================================= */
function drawHist() {
    const h = ST.getHist();
    if (!h.length) { $('#histWrap').addClass('d-none'); return }
    $('#histWrap').removeClass('d-none');
    $('#histChips').html(h.map(u => '<span class="hc" data-u="' + esc(u) + '"><i class="bi bi-clock-history" style="font-size:10px"></i>' + esc(u) + '</span>').join(''));
}
function alert2(msg) { $('#alertBox').html(esc(msg)).removeClass('d-none'); setTimeout(() => $('#alertBox').addClass('d-none'), 8000) }
function hideAlert() { $('#alertBox').addClass('d-none') }
/* =================================================================
   MODULE 13 — INIT
================================================================= */
let cmpM = false, frc = false;
$(() => {
    cmpM = ST.pref('cmpMode', false); if (cmpM) togCmp(true, false);
    const li = ST.pref('lastIn', ''); if (li) $('#acIn').val(li);
    const th = ST.pref('theme', 'light'); document.documentElement.setAttribute('data-theme', th);
    $('#themeIco').attr('class', th === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill');
    drawHist();

    $('#cmpToggle').on('click', () => togCmp(!cmpM, true));
    $('#forceBtn').on('click', () => { frc = true; if (cmpM) runCmp(); else runSin() });
    $('#srchBtn').on('click', runSin);
    $('#acIn').on('keypress', e => { if (e.which === 13) runSin() }).on('input', function () { ST.setPref('lastIn', $(this).val()) });
    $('#cmpBtn').on('click', runCmp);
    $('#acInA,#acInB').on('keypress', e => { if (e.which === 13) runCmp() });

    $(document).on('click', '.qc[data-u]', function () {
        const u = $(this).data('u');
        if (cmpM) { if (!$('#acInA').val()) $('#acInA').val(u); else $('#acInB').val(u); }
        else { $('#acIn').val(u); runSin(); }
    });
    $('#histChips').on('click', '.hc', function () {
        const u = $(this).data('u');
        if (cmpM) { if (!$('#acInA').val()) $('#acInA').val(u); else $('#acInB').val(u); }
        else { $('#acIn').val(u); runSin(); }
    });
    $('#clrBtn').on('click', () => { $('#acIn').val('').focus(); hideAlert() });
    $('#clrHistBtn').on('click', () => { ST.clearHist(); drawHist() });
    $('#themeBtn').on('click', function () {
        const c = document.documentElement.getAttribute('data-theme'), n = c === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', n); ST.setPref('theme', n);
        $('#themeIco').attr('class', n === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill');
    });
    $('#qChips').on('click', '.qc', function () {
        if (!cM) return; const q = $(this).data('q');
        $('#qaBox').html(IN.qa(q, cM, cS)).removeClass('d-none');
        $('#qChips .qc').removeClass('aqc'); $(this).addClass('aqc');
    });
    $('#cpyBtn').on('click', function () {
        navigator.clipboard.writeText(buildReport()).then(() => { $(this).html('<i class="bi bi-check"></i> Copied!'); setTimeout(() => $(this).html('<i class="bi bi-clipboard"></i> Copy'), 2000) });
    });
    $('#dlBtn').on('click', function () {
        const b = new Blob([buildReport()], { type: 'text/plain' }), a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'instaanalytics_' + (cD?.username || 'report') + '_' + Date.now() + '.txt'; a.click();
    });
    $('#prtBtn').on('click', () => window.print());
    $('#scAccH').on('click', function () { $('#scAccB').toggleClass('open'); $('#scChev').toggleClass('bi-chevron-down bi-chevron-up') });
});

function togCmp(on, persist) {
    cmpM = on; if (persist) ST.setPref('cmpMode', on);
    on ? $('#cmpToggle').addClass('on') : $('#cmpToggle').removeClass('on');
    if (on) { $('#sinRow').addClass('d-none'); $('#cmpRow').removeClass('d-none') }
    else { $('#sinRow').removeClass('d-none'); $('#cmpRow').addClass('d-none') }
}
async function runSin() {
    const u = cleanU($('#acIn').val()); if (!u) { alert2('Please enter a username or URL.'); return }
    hideAlert(); setBtn('#srchBtn', true, 'Extracting... (~10s)');
    try {
        const lim = parseInt($('#limSel').val(), 10) || 12;
        const dm = await API.fetch([u], lim, frc); frc = false;
        const d = dm[u]; if (!d) { alert2('Could not find @' + u + '. Check the username.'); return }
        ST.addHist(u); drawHist(); render(d);
    } catch (e) { alert2('Error: ' + (e.responseJSON?.error?.message || e.statusText || 'Network error.')) }
    finally { setBtn('#srchBtn', false, '<i class="bi bi-graph-up-arrow me-1"></i> Analyze Live') }
}
async function runCmp() {
    const uA = cleanU($('#acInA').val()), uB = cleanU($('#acInB').val());
    if (!uA || !uB) { alert2('Enter usernames for both A and B.'); return }
    if (uA === uB) { alert2('Please enter two different accounts.'); return }
    hideAlert(); setBtn('#cmpBtn', true, 'Fetching... (~15s)');
    try {
        const lim = parseInt($('#limSel').val(), 10) || 12;
        const dm = await API.fetch([uA, uB], lim, frc); frc = false;
        const dA = dm[uA], dB = dm[uB];
        if (!dA && !dB) { alert2('Could not find either account.'); return }
        if (!dA) { alert2('Could not find @' + uA + '. Showing @' + uB + ' only.'); render(dB); return }
        if (!dB) { alert2('Could not find @' + uB + '. Showing @' + uA + ' only.'); render(dA); return }
        ST.addHist(uA); ST.addHist(uB); drawHist(); renderCmp(dA, dB);
    } catch (e) { alert2('Error: ' + (e.responseJSON?.error?.message || e.statusText || 'Network error.')) }
    finally { setBtn('#cmpBtn', false, '<i class="bi bi-intersect me-1"></i> Compare') }
}