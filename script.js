'use strict';

/* =================================================================
   INSTAANALYTICS AI 2.0 — ENTERPRISE CLIENT ENGINE
   Deterministic Rule-Based Intelligence & LocalStorage Data Engine
================================================================= */

const CFG = {
    CACHE_PFX: 'ia_v2_',
    CACHE_TTL: 30 * 60 * 1000, // 30-minute cache TTL
    MAX_HIST: 10,
    MAX_WATCHLIST: 20,
    W: { engQ: .30, cons: .20, conv: .15, rhy: .15, fmix: .10, disc: .10 },
    BENCH: {
        nano:  { max: 1e4, good: 5.0, avg: 3.0, label: 'Nano (<10k)' },
        micro: { max: 1e5, good: 3.5, avg: 2.0, label: 'Micro (10k-100k)' },
        mid:   { max: 1e6, good: 2.0, avg: 1.2, label: 'Mid-Tier (100k-1M)' },
        macro: { max: 1e7, good: 1.2, avg: 0.7, label: 'Macro (1M-10M)' },
        mega:  { max: Infinity, good: 0.8, avg: 0.4, label: 'Mega (10M+)' }
    },
    CV_EX: 0.45, CV_PO: 1.35,
    CPL_ST: 3.0, CPL_GO: 1.5, CPL_WK: 0.6,
    PPW_LO: 3.0, PPW_HI: 7.0, PPW_MIN: 1.0,
    HT_ID: 8, CAP_MIN: 80,
    GRADES: [
        { min: 90, g: 'A+', t: 'Exceptional', c: '#10b981' },
        { min: 80, g: 'A',  t: 'Excellent',   c: '#10b981' },
        { min: 70, g: 'B+', t: 'Strong',      c: '#3b82f6' },
        { min: 60, g: 'B',  t: 'Good',        c: '#3b82f6' },
        { min: 50, g: 'C+', t: 'Average',     c: '#f59e0b' },
        { min: 40, g: 'C',  t: 'Fair',        c: '#f59e0b' },
        { min: 30, g: 'D+', t: 'Needs Work',  c: '#ef4444' },
        { min: 0,  g: 'D',  t: 'Critical Attention', c: '#ef4444' }
    ],
    STARS: [85, 70, 55, 40, 0]
};

/* =================================================================
   STORAGE ENGINE (Cache, History, Watchlist & Settings)
================================================================= */
const ST = {
    _g(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    _s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
    _d(k) { try { localStorage.removeItem(k); } catch { } },
    
    // Scraper API Cache
    gc(u) {
        const item = this._g(CFG.CACHE_PFX + u.toLowerCase());
        if (!item) return null;
        if (Date.now() - item.ts > CFG.CACHE_TTL) {
            this._d(CFG.CACHE_PFX + u.toLowerCase());
            return null;
        }
        return item.data;
    },
    sc(u, d) {
        this._s(CFG.CACHE_PFX + u.toLowerCase(), { ts: Date.now(), data: d });
    },
    getCacheKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CFG.CACHE_PFX)) {
                const item = this._g(k);
                keys.push({
                    key: k,
                    user: k.replace(CFG.CACHE_PFX, ''),
                    ageMin: item ? Math.round((Date.now() - item.ts) / 60000) : 0,
                    remainingMin: item ? Math.max(0, Math.round((CFG.CACHE_TTL - (Date.now() - item.ts)) / 60000)) : 0
                });
            }
        }
        return keys;
    },
    clearAllCache() {
        const toDel = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CFG.CACHE_PFX)) toDel.push(k);
        }
        toDel.forEach(k => this._d(k));
    },

    // Search History
    getHist() { return this._g('ia_hist') || []; },
    addHist(u) {
        let h = this.getHist().filter(x => x.toLowerCase() !== u.toLowerCase());
        h.unshift(u);
        if (h.length > CFG.MAX_HIST) h = h.slice(0, CFG.MAX_HIST);
        this._s('ia_hist', h);
    },
    clearHist() { this._d('ia_hist'); },

    // Portfolio Watchlist
    getWatchlist() { return this._g('ia_watchlist') || []; },
    isWatchlisted(u) {
        return this.getWatchlist().some(item => (item.username || '').toLowerCase() === (u || '').toLowerCase());
    },
    toggleWatchlist(data, score) {
        const u = data.username;
        if (!u) return false;
        let wl = this.getWatchlist();
        const exists = wl.some(i => i.username.toLowerCase() === u.toLowerCase());
        if (exists) {
            wl = wl.filter(i => i.username.toLowerCase() !== u.toLowerCase());
            this._s('ia_watchlist', wl);
            return false;
        } else {
            const entry = {
                username: u,
                fullName: data.fullName || data.name || u,
                followers: data.followersCount || 0,
                score: score ? score.ov : '--',
                grade: score ? score.g : '--',
                avatar: data.profilePicUrlHD || data.profilePicUrl || '',
                savedAt: new Date().toLocaleDateString()
            };
            wl.unshift(entry);
            if (wl.length > CFG.MAX_WATCHLIST) wl = wl.slice(0, CFG.MAX_WATCHLIST);
            this._s('ia_watchlist', wl);
            return true;
        }
    },
    removeWatchlist(u) {
        let wl = this.getWatchlist().filter(i => i.username.toLowerCase() !== u.toLowerCase());
        this._s('ia_watchlist', wl);
    },
    clearWatchlist() { this._d('ia_watchlist'); },

    // Preferences
    pref(k, def) { const v = this._g('ia_p_' + k); return v !== null ? v : def; },
    setPref(k, v) { this._s('ia_p_' + k, v); }
};

/* =================================================================
   API PROXY CLIENT
================================================================= */
const API = {
    getBaseUrl() {
        if (window.BACKEND_API_URL) return window.BACKEND_API_URL;
        if (window.location.protocol === 'file:' || (window.location.port !== '5000' && window.location.hostname === 'localhost')) {
            return 'http://localhost:5000';
        }
        return '';
    },
    fetch(usernames, resultsLimit, forceRefresh) {
        const cached = {};
        const needed = [];

        usernames.forEach(u => {
            const c = !forceRefresh && ST.gc(u);
            if (c) cached[u] = c;
            else needed.push(u);
        });

        if (!needed.length) return Promise.resolve(cached);

        const url = this.getBaseUrl() + '/api/instagram/analyze';
        return $.ajax({
            url,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ usernames: needed, resultsLimit }),
            timeout: 120000
        }).then(datasetItems => {
            const res = { ...cached };
            needed.forEach(u => {
                const found = (datasetItems || []).find(d => (d.username || '').toLowerCase() === u.toLowerCase());
                if (found) {
                    ST.sc(u, found);
                    res[u] = found;
                }
            });
            return res;
        });
    }
};

/* =================================================================
   METRICS COMPUTATION ENGINE (Deterministic Math & Analytics)
================================================================= */
const MX = {
    _med(arr) {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b), m = ~~(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },
    _avg(arr) {
        return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    },
    _std(arr, mean) {
        if (arr.length < 2) return 0;
        const mu = mean !== undefined ? mean : this._avg(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length);
    },

    compute(data) {
        const fol = data.followersCount || 0;
        const follows = data.followsCount || 0;
        const allPosts = data.latestPosts || [];
        
        // Filter out posts with hidden/negative likes
        const validPosts = allPosts.filter(p => p.likesCount != null && p.likesCount >= 0);
        const hidCount = allPosts.length - validPosts.length;
        const sz = validPosts.length;

        if (!sz) {
            return {
                sz: 0, hid: hidCount, fol, follows, all: allPosts, valid: [],
                era: [], hashtags: [], timing: {}, formatStats: []
            };
        }

        const lk = validPosts.map(p => p.likesCount || 0);
        const cm = validPosts.map(p => p.commentsCount || 0);
        const eng = validPosts.map(p => (p.likesCount || 0) + (p.commentsCount || 0));
        
        // Per-post engagement rate
        const era = fol > 0 ? eng.map(e => (e / fol) * 100) : [];
        const aL = this._avg(lk);
        const mL = this._med(lk);
        const maxL = Math.max(...lk, 0);
        const minL = Math.min(...lk, 0);
        
        const aC = this._avg(cm);
        const mC = this._med(cm);
        const tL = lk.reduce((s, v) => s + v, 0);
        const tC = cm.reduce((s, v) => s + v, 0);

        const er = fol > 0 ? ((aL + aC) / fol) * 100 : 0;
        const cpl = aL > 0 ? (aC / aL) * 100 : 0; // Comments per 100 likes
        const em = this._avg(eng);
        const cv = em > 0 ? this._std(eng, em) / em : 0; // Volatility
        const topOutlierShare = tL > 0 ? (maxL / tL) * 100 : 0;

        // Engagement Trajectory & Trend (Half vs Half)
        const half = ~~(sz / 2);
        let trend = 'flat', tpct = 0;
        if (half >= 2) {
            const na = this._avg(era.slice(0, half));
            const oa = this._avg(era.slice(half));
            if (oa > 0) {
                tpct = ((na - oa) / oa) * 100;
                trend = tpct > 10 ? 'rising' : tpct < -10 ? 'falling' : 'flat';
            }
        }

        // Timestamp & Cadence Analytics
        const tsList = validPosts.map(p => p.timestamp || p.takenAt).filter(Boolean);
        let ppw = null, intervalDays = null;
        if (tsList.length >= 2) {
            const dateObjects = tsList.map(t => new Date(t)).filter(d => !isNaN(d)).sort((a, b) => b - a);
            if (dateObjects.length >= 2) {
                const spanDays = (dateObjects[0] - dateObjects[dateObjects.length - 1]) / 864e5;
                if (spanDays > 0) {
                    ppw = (dateObjects.length / spanDays) * 7;
                    intervalDays = spanDays / (dateObjects.length - 1);
                }
            }
        }

        // Timing Matrix: Day of Week & Time Slot Breakdown
        const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dowStats = dowNames.map(name => ({ day: name, count: 0, likesSum: 0, cmtsSum: 0, erSum: 0, avgER: 0 }));
        
        const slotStats = {
            morning:   { label: 'Morning (6am-12pm)', count: 0, engSum: 0, avgER: 0, icon: 'bi-sunrise' },
            afternoon: { label: 'Afternoon (12pm-5pm)', count: 0, engSum: 0, avgER: 0, icon: 'bi-sun' },
            evening:   { label: 'Evening (5pm-9pm)', count: 0, engSum: 0, avgER: 0, icon: 'bi-sunset' },
            night:     { label: 'Night (9pm-6am)', count: 0, engSum: 0, avgER: 0, icon: 'bi-moon' }
        };

        validPosts.forEach((p, idx) => {
            const t = p.timestamp || p.takenAt;
            if (!t) return;
            const d = new Date(t);
            if (isNaN(d)) return;
            
            const dow = d.getDay();
            const postER = era[idx] || 0;
            const postLk = p.likesCount || 0;
            const postCm = p.commentsCount || 0;

            dowStats[dow].count++;
            dowStats[dow].likesSum += postLk;
            dowStats[dow].cmtsSum += postCm;
            dowStats[dow].erSum += postER;

            const hour = d.getHours();
            let slotKey = 'night';
            if (hour >= 6 && hour < 12) slotKey = 'morning';
            else if (hour >= 12 && hour < 17) slotKey = 'afternoon';
            else if (hour >= 17 && hour < 21) slotKey = 'evening';

            slotStats[slotKey].count++;
            slotStats[slotKey].engSum += postLk + postCm;
        });

        dowStats.forEach(d => {
            d.avgER = d.count > 0 ? d.erSum / d.count : 0;
            d.avgLikes = d.count > 0 ? Math.round(d.likesSum / d.count) : 0;
        });

        Object.keys(slotStats).forEach(k => {
            const s = slotStats[k];
            s.avgER = (s.count > 0 && fol > 0) ? (s.engSum / s.count / fol) * 100 : 0;
        });

        const activeDays = dowStats.filter(d => d.count > 0);
        const bestDayObj = activeDays.length ? [...activeDays].sort((a, b) => b.avgER - a.avgER)[0] : null;
        const activeSlots = Object.values(slotStats).filter(s => s.count > 0);
        const bestSlotObj = activeSlots.length ? [...activeSlots].sort((a, b) => b.avgER - a.avgER)[0] : null;

        // Content Format Mix
        const fmMap = {}, feMap = {};
        validPosts.forEach(p => {
            let f = (p.type || 'Image').toLowerCase();
            if (f === 'sidecar' || f === 'carousel') f = 'carousel';
            fmMap[f] = (fmMap[f] || 0) + 1;
            (feMap[f] = feMap[f] || []).push((p.likesCount || 0) + (p.commentsCount || 0));
        });

        const formatStats = Object.entries(fmMap).map(([f, c]) => ({
            format: f.charAt(0).toUpperCase() + f.slice(1),
            count: c,
            sharePct: (c / sz) * 100,
            avgEng: this._avg(feMap[f]),
            avgER: fol > 0 ? (this._avg(feMap[f]) / fol) * 100 : 0
        })).sort((a, b) => b.avgER - a.avgER);

        // Hashtag Performance Matrix
        const htMap = {};
        validPosts.forEach((p, idx) => {
            const tags = p.hashtags || [];
            const postER = era[idx] || 0;
            const postLk = p.likesCount || 0;
            tags.forEach(rawTag => {
                const tag = rawTag.toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (!tag) return;
                if (!htMap[tag]) htMap[tag] = { tag, count: 0, totalLikes: 0, totalER: 0 };
                htMap[tag].count++;
                htMap[tag].totalLikes += postLk;
                htMap[tag].totalER += postER;
            });
        });

        const hashtags = Object.values(htMap).map(h => ({
            tag: h.tag,
            count: h.count,
            avgLikes: Math.round(h.totalLikes / h.count),
            avgER: Number((h.totalER / h.count).toFixed(2))
        })).sort((a, b) => b.avgER - a.avgER || b.count - a.count);

        // Caption Length & CTA Analytics
        let withQuestions = 0, noQuestions = 0;
        let withQComments = 0, noQComments = 0;
        let shortCaptions = 0, medCaptions = 0, longCaptions = 0;
        let shortER = 0, medER = 0, longER = 0;

        validPosts.forEach((p, idx) => {
            const cap = p.caption || '';
            const postER = era[idx] || 0;
            const postCm = p.commentsCount || 0;

            if (cap.includes('?')) {
                withQuestions++;
                withQComments += postCm;
            } else {
                noQuestions++;
                noQComments += postCm;
            }

            if (cap.length < 80) {
                shortCaptions++;
                shortER += postER;
            } else if (cap.length <= 250) {
                medCaptions++;
                medER += postER;
            } else {
                longCaptions++;
                longER += postER;
            }
        });

        const captionStats = {
            avgLength: Math.round(this._avg(validPosts.map(p => (p.caption || '').length))),
            withQuestions,
            noQuestions,
            avgCmtsWithQ: withQuestions > 0 ? Math.round(withQComments / withQuestions) : 0,
            avgCmtsNoQ: noQuestions > 0 ? Math.round(noQComments / noQuestions) : 0,
            ctaUplift: noQComments > 0 && withQuestions > 0 ? (((withQComments / withQuestions) - (noQComments / noQuestions)) / (noQComments / noQuestions)) * 100 : 0,
            shortAvgER: shortCaptions > 0 ? (shortER / shortCaptions).toFixed(2) : 0,
            medAvgER: medCaptions > 0 ? (medER / medCaptions).toFixed(2) : 0,
            longAvgER: longCaptions > 0 ? (longER / longCaptions).toFixed(2) : 0
        };

        const sortedByEng = [...validPosts].sort((a, b) => ((b.likesCount || 0) + (b.commentsCount || 0)) - ((a.likesCount || 0) + (a.commentsCount || 0)));

        return {
            fol, follows, sz, hid: hidCount, all: allPosts, valid: validPosts,
            aL, mL, maxL, minL, aC, mC, tL, tC, er, cpl, cv, topOutlierShare,
            trend, tpct, ppw, intervalDays, hasTimestamps: tsList.length >= 2,
            formatStats, hashtags, captionStats,
            dowStats, slotStats, bestDayObj, bestSlotObj,
            topPost: sortedByEng[0] || null,
            era
        };
    }
};

/* =================================================================
   ACCOUNT SCORING ENGINE (6 Weighted Pillars)
================================================================= */
const SC = {
    _scale(val, min, max) {
        if (max === min) return val >= max ? 100 : 0;
        return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    },
    bench(fol) {
        for (const t of Object.values(CFG.BENCH)) {
            if (fol <= t.max) return t;
        }
        return CFG.BENCH.mega;
    },
    compute(m) {
        if (!m.sz) return null;
        const C = {}, W = { ...CFG.W };
        const b = this.bench(m.fol);

        // 1. Engagement Quality (ER vs Tier Benchmark)
        C.engQ = {
            s: this._scale(m.er, b.avg / 2, b.good),
            l: 'Engagement Quality',
            v: m.er.toFixed(2) + '%',
            desc: `Tier average is ~${b.avg}%`
        };

        // 2. Consistency & Audience Stability
        C.cons = {
            s: Math.max(0, 100 - this._scale(m.cv, CFG.CV_EX, CFG.CV_PO)),
            l: 'Audience Consistency',
            v: 'CV ' + m.cv.toFixed(2),
            desc: m.cv <= CFG.CV_EX ? 'High stability' : 'Moderate volatility'
        };

        // 3. Conversation Ratio (Comments per 100 Likes)
        C.conv = {
            s: this._scale(m.cpl, CFG.CPL_WK, CFG.CPL_ST),
            l: 'Conversation Depth',
            v: m.cpl.toFixed(1) + ' c/100lk',
            desc: m.cpl >= 2.0 ? 'Deep discussion' : 'Shallow interactions'
        };

        // 4. Cadence & Rhythm
        if (m.hasTimestamps && m.ppw !== null) {
            let rScore;
            if (m.ppw < CFG.PPW_MIN) rScore = this._scale(m.ppw, 0, CFG.PPW_MIN) * 0.5;
            else if (m.ppw <= CFG.PPW_HI) rScore = this._scale(m.ppw, CFG.PPW_MIN, CFG.PPW_LO) * 0.5 + 50;
            else rScore = 100 - this._scale(m.ppw, CFG.PPW_HI, CFG.PPW_HI * 3) * 0.5;
            
            C.rhy = {
                s: Math.max(0, Math.min(100, rScore)),
                l: 'Publishing Rhythm',
                v: m.ppw.toFixed(1) + ' posts/wk',
                desc: m.intervalDays ? `Every ~${m.intervalDays.toFixed(1)} days` : 'Optimal pace'
            };
        } else {
            delete W.rhy;
        }

        // 5. Content Format Mix
        const diversityScore = Math.min(100, (m.formatStats.length / 3) * 100);
        const topFormatShare = m.formatStats.length ? m.formatStats[0].sharePct : 50;
        const balanceScore = 100 - Math.abs(topFormatShare - 50);
        C.fmix = {
            s: diversityScore * 0.5 + balanceScore * 0.5,
            l: 'Format Diversity',
            v: m.formatStats.length + ' format(s)',
            desc: m.formatStats.length ? `Lead: ${m.formatStats[0].format}` : 'Multi-format'
        };

        // 6. Discoverability (Hashtags + Caption hook)
        const avgTags = m.valid.length ? MX._avg(m.valid.map(p => (p.hashtags || []).length)) : 0;
        const tagScore = this._scale(avgTags, 0, CFG.HT_ID);
        const capScore = this._scale(m.captionStats.avgLength, 0, CFG.CAP_MIN);
        C.disc = {
            s: tagScore * 0.6 + capScore * 0.4,
            l: 'Discoverability',
            v: avgTags.toFixed(1) + ' tags/post',
            desc: `Avg caption: ${m.captionStats.avgLength} chars`
        };

        // Weighted Overall Score
        const totalW = Object.keys(C).reduce((sum, k) => sum + (W[k] || 0), 0);
        let ov = 0;
        Object.entries(C).forEach(([k, c]) => {
            const weight = (W[k] || 0) / totalW;
            c.nw = weight;
            ov += c.s * weight;
        });
        ov = Math.round(ov);

        const grade = CFG.GRADES.find(g => ov >= g.min) || CFG.GRADES[CFG.GRADES.length - 1];
        const conf = m.sz < 8 ? ['Low', 'cfl'] : m.sz <= 20 ? ['Medium', 'cfm'] : ['High', 'cfh'];
        
        let stars = 0;
        CFG.STARS.forEach((thresh, idx) => {
            if (ov >= thresh && !stars) stars = 5 - idx;
        });

        return { ov, g: grade.g, t: grade.t, c: grade.c, C, conf, stars };
    }
};

/* =================================================================
   AI STRATEGY & SWOT MATRIX ENGINE
================================================================= */
const IN = {
    generateSWOT(m, s) {
        if (!m.sz) return null;
        const strengths = [];
        const weaknesses = [];
        const opportunities = [];
        const threats = [];
        const actions = [];

        const b = SC.bench(m.fol);

        // 1. Engagement evaluation
        if (m.er >= b.good) {
            strengths.push({
                title: 'High Engagement Rate',
                desc: `At <strong>${m.er.toFixed(2)}%</strong>, engagement significantly exceeds the ~${b.avg}% benchmark for ${b.label}.`
            });
        } else if (m.er < b.avg) {
            weaknesses.push({
                title: 'Sub-Benchmark Engagement',
                desc: `Engagement rate (<strong>${m.er.toFixed(2)}%</strong>) trails the tier average (~${b.avg}%). Content re-alignment needed.`
            });
            actions.push({ prio: 'High', text: 'Audit recent low-performing posts and test more authentic conversational hooks.' });
        }

        // 2. Audience stability (CV)
        if (m.cv <= CFG.CV_EX) {
            strengths.push({
                title: 'Consistent Audience Resonance',
                desc: `Low volatility index (CV = <strong>${m.cv.toFixed(2)}</strong>) indicates steady audience interest across all posts.`
            });
        } else if (m.cv > CFG.CV_PO) {
            weaknesses.push({
                title: 'High Performance Volatility',
                desc: `High variance (CV = <strong>${m.cv.toFixed(2)}</strong>) indicates the account relies heavily on sporadic outlier posts.`
            });
            threats.push({
                title: 'Outlier Vulnerability',
                desc: `Top post drives <strong>${m.topOutlierShare.toFixed(0)}%</strong> of total sampled likes. Baseline engagement is inconsistent.`
            });
            actions.push({ prio: 'High', text: 'Document traits of the top-performing post and replicate its hook & visual pacing.' });
        }

        // 3. Conversation Ratio
        if (m.cpl >= CFG.CPL_ST) {
            strengths.push({
                title: 'Active Community Dialogue',
                desc: `Generates <strong>${m.cpl.toFixed(1)} comments per 100 likes</strong>, signaling high follower commitment.`
            });
        } else if (m.cpl < CFG.CPL_WK) {
            weaknesses.push({
                title: 'Passive Interaction Bias',
                desc: `Low comment ratio (<strong>${m.cpl.toFixed(1)} comments per 100 likes</strong>). Audience double-taps but doesn't converse.`
            });
            opportunities.push({
                title: 'Inject Direct Call-To-Actions (CTAs)',
                desc: 'End every caption with an explicit question or debate topic to double conversation volume.'
            });
            actions.push({ prio: 'Medium', text: 'Test open-ended question prompts in the first 2 lines of captions.' });
        }

        // 4. Format Mix & Multi-Media Opportunities
        if (m.formatStats.length >= 2) {
            const topFmt = m.formatStats[0];
            const secondFmt = m.formatStats[1];
            if (topFmt.avgER > secondFmt.avgER * 1.25) {
                opportunities.push({
                    title: `Scale ${topFmt.format} Production`,
                    desc: `${topFmt.format}s deliver <strong>${topFmt.avgER.toFixed(2)}%</strong> ER vs <strong>${secondFmt.avgER.toFixed(2)}%</strong> for ${secondFmt.format}s.`
                });
                actions.push({ prio: 'High', text: `Increase ${topFmt.format} content frequency to capitalize on higher organic reach.` });
            }
        }

        // 5. Timing & Cadence
        if (m.bestDayObj && m.bestSlotObj) {
            opportunities.push({
                title: 'Prime Posting Window Advantage',
                desc: `Historically peaks on <strong>${m.bestDayObj.day} ${m.bestSlotObj.label}</strong> with ~${m.bestDayObj.avgER.toFixed(2)}% average engagement.`
            });
        }

        if (m.hasTimestamps && m.ppw !== null && m.ppw < CFG.PPW_MIN) {
            weaknesses.push({
                title: 'Infrequent Publishing Cadence',
                desc: `Current frequency of <strong>${m.ppw.toFixed(1)} posts/week</strong> falls below recommended consistency standards.`
            });
            actions.push({ prio: 'High', text: `Establish a consistent schedule of at least 3-4 posts/week to stay favored by algorithms.` });
        }

        // 6. Hashtags
        if (m.hashtags.length < 3) {
            opportunities.push({
                title: 'Optimize Hashtag Strategy',
                desc: 'Average hashtag usage is minimal. Incorporating 5–8 targeted niche tags can expand non-follower discoverability.'
            });
            actions.push({ prio: 'Medium', text: 'Research and curate 3 sets of 5-8 niche community hashtags for post rotation.' });
        }

        // 7. Trajectory
        if (m.trend === 'rising') {
            strengths.push({
                title: 'Positive Engagement Momentum',
                desc: `Recent posts show a <strong>+${Math.abs(m.tpct).toFixed(0)}%</strong> lift compared to earlier sampled posts.`
            });
        } else if (m.trend === 'falling') {
            threats.push({
                title: 'Engagement Decay Trend',
                desc: `Recent posts dipped <strong>-${Math.abs(m.tpct).toFixed(0)}%</strong>. Immediate audience fatigue mitigation required.`
            });
            actions.push({ prio: 'High', text: 'Pivot visual style or story format to interrupt audience feed fatigue.' });
        }

        const topPillar = s ? Object.values(s.C).sort((a, b) => b.s - a.s)[0] : null;
        const hl = s ? `Profile Health Grade: <strong>${s.g} (${s.ov}/100 · ${s.t})</strong>. Primary performance pillar: <strong>${topPillar?.l || 'N/A'}</strong> with <strong>${topPillar?.v || ''}</strong>.` : 'Health analysis ready.';

        return { hl, strengths, weaknesses, opportunities, threats, actions };
    },

    qa(query, m, s) {
        if (!m.sz) return 'No data available.';
        if (query === 'score') {
            return s ? `<strong>Score Breakdown (${s.ov}/100 - Grade ${s.g}):</strong><br>${Object.values(s.C).map(c => `&bull; <strong>${c.l}:</strong> ${Math.round(c.s)}/100 (${c.v})`).join('<br>')}` : 'Score unavailable.';
        }
        if (query === 'format') {
            const best = m.formatStats[0];
            return best ? `<strong>Top Format:</strong> <strong>${best.format}</strong> generates <strong>${best.avgER.toFixed(2)}%</strong> average engagement (${best.count} posts analyzed, ${best.sharePct.toFixed(0)}% share).` : 'Insufficient format data.';
        }
        if (query === 'comments') {
            return `<strong>Comment Conversation Depth:</strong> Current ratio is <strong>${m.cpl.toFixed(1)} comments per 100 likes</strong>. ${m.captionStats.ctaUplift > 0 ? `Posts asking questions receive <strong>+${m.captionStats.ctaUplift.toFixed(0)}%</strong> more comments!` : 'Incorporate questions in the first 2 lines of captions to boost discussion.'}`;
        }
        if (query === 'trend') {
            return `<strong>Trajectory Status:</strong> <span class="${m.trend === 'rising' ? 'text-success' : m.trend === 'falling' ? 'text-danger' : 'text-warning'} fw7">${m.trend.toUpperCase()}</span> (${m.trend !== 'flat' ? Math.abs(m.tpct).toFixed(0) + '% shift across recent posts' : 'stable within ±10%'}).`;
        }
        if (query === 'bestpost') {
            const p = m.topPost;
            if (!p) return 'No posts found.';
            const cap = (p.caption || '').substring(0, 100) + ((p.caption || '').length > 100 ? '...' : '');
            return `<strong>Top Performing Post:</strong><br>&bull; <strong>Likes:</strong> ${(p.likesCount || 0).toLocaleString()} | <strong>Comments:</strong> ${(p.commentsCount || 0).toLocaleString()}<br>&bull; <em>"${esc(cap)}"</em>`;
        }
        return '';
    }
};

/* =================================================================
   CHART.JS VISUAL ENGINE
================================================================= */
const CH = {
    _instances: {},
    isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    },
    gridColor() {
        return this.isDark() ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';
    },
    labelColor() {
        return this.isDark() ? '#94a3b8' : '#64748b';
    },
    destroy(id) {
        if (this._instances[id]) {
            this._instances[id].destroy();
            delete this._instances[id];
        }
    },

    // 1. Radar Chart (Health Pillars)
    radar(id, labels, datasets) {
        this.destroy(id);
        const ctx = document.getElementById(id);
        if (!ctx) return;
        this._instances[id] = new Chart(ctx, {
            type: 'radar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        beginAtZero: true,
                        grid: { color: this.gridColor() },
                        angleLines: { color: this.gridColor() },
                        ticks: { display: false },
                        pointLabels: { color: this.labelColor(), font: { size: 10, weight: 600 } }
                    }
                },
                plugins: {
                    legend: { display: datasets.length > 1, position: 'bottom', labels: { color: this.labelColor(), font: { size: 11 } } }
                }
            }
        });
    },

    // 2. Bar Chart (Post-Level Interactions)
    bar(id, labels, datasets) {
        this.destroy(id);
        const ctx = document.getElementById(id);
        if (!ctx) return;
        this._instances[id] = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: this.labelColor(), font: { size: 11, weight: 600 } } }
                },
                scales: {
                    x: { grid: { color: this.gridColor() }, ticks: { color: this.labelColor() } },
                    y: { beginAtZero: true, grid: { color: this.gridColor() }, ticks: { color: this.labelColor() } }
                }
            }
        });
    },

    // 3. Doughnut Chart (Format Mix)
    doughnut(id, labels, data, colors) {
        this.destroy(id);
        const ctx = document.getElementById(id);
        if (!ctx) return;
        this._instances[id] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: this.isDark() ? '#121622' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: this.labelColor(), font: { size: 11, weight: 600 } } }
                }
            }
        });
    },

    // 4. Line Chart (Compare Trajectory)
    line(id, labels, datasets) {
        this.destroy(id);
        const ctx = document.getElementById(id);
        if (!ctx) return;
        this._instances[id] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: this.labelColor(), font: { size: 11, weight: 600 } } }
                },
                scales: {
                    x: { grid: { color: this.gridColor() }, ticks: { color: this.labelColor() } },
                    y: { beginAtZero: true, grid: { color: this.gridColor() }, ticks: { color: this.labelColor() } }
                }
            }
        });
    }
};

/* =================================================================
   UTILITY & FORMATTING HELPERS
================================================================= */
function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fn(num) {
    return num == null ? '--' : Number(num).toLocaleString();
}
function fp(num, dec = 2) {
    return num == null ? '--' : Number(num).toFixed(dec) + '%';
}
function proxyImg(rawUrl, fallbackName) {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('data:')) return rawUrl;
    const cleanUrl = rawUrl.replace(/^https?:\/\//, '');
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || 'IG')}&background=dc2743&color=fff`;
    return `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&default=${encodeURIComponent(fallback)}`;
}
function letterAv(name, size = 160) {
    const clean = (name || '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    let initials = 'IG';
    if (parts.length >= 2) initials = (parts[0][0] + parts[1][0]).toUpperCase();
    else if (parts.length && parts[0].length >= 2) initials = parts[0].substring(0, 2).toUpperCase();
    else if (parts.length) initials = parts[0][0].toUpperCase();

    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>` +
        `<defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%23f09433'/><stop offset='50%' stop-color='%23dc2743'/><stop offset='100%' stop-color='%23bc1888'/></linearGradient></defs>` +
        `<rect width='100%' height='100%' fill='url(%23g)'/>` +
        `<text x='50%' y='54%' font-family='system-ui, -apple-system' font-weight='700' font-size='${Math.round(size * 0.42)}px' fill='%23ffffff' dominant-baseline='middle' text-anchor='middle'>${esc(initials)}</text></svg>`;
}
function cleanUser(raw) {
    let u = (raw || '').trim().replace(/^@/, '');
    u = u.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '');
    return u.split('/')[0].split('?')[0].toLowerCase().trim();
}
function setButtonLoading(selector, isLoading, text) {
    $(selector).prop('disabled', isLoading).html(isLoading ? `<span class="spinner-border spinner-border-sm me-2"></span>${text}` : text);
}
function showAlert(msg) {
    $('#alertBox').html(esc(msg)).removeClass('d-none');
    setTimeout(() => $('#alertBox').addClass('d-none'), 8000);
}
function hideAlert() {
    $('#alertBox').addClass('d-none');
}

/* =================================================================
   MAIN APP STATE
================================================================= */
let currentData = null;
let currentMetrics = null;
let currentScore = null;
let compareMode = false;
let forceRefreshActive = false;

/* =================================================================
   RENDER PIPELINE
================================================================= */
function renderProfile(data) {
    currentData = data;
    const name = data.fullName || data.name || data.username || 'User';
    const rawPic = data.profilePicUrlHD || data.profilePicUrl;
    const fallbackPic = letterAv(name, 160);
    const safeAvatar = rawPic ? proxyImg(rawPic, name) : fallbackPic;

    // 1. Executive Header
    $('#uName').text(name);
    $('#uHdl').text('@' + (data.username || ''));
    $('#uBio').text(data.biography || '');
    $('#uCat').text(data.businessCategoryName || 'Public Profile');
    data.verified ? $('#verBadge').removeClass('d-none') : $('#verBadge').addClass('d-none');
    $('#uAv').off('error').on('error', function () { $(this).off('error').attr('src', fallbackPic); }).attr('src', safeAvatar);
    $('#extLink').attr('href', 'https://www.instagram.com/' + encodeURIComponent(data.username || '') + '/');

    // Update Bookmark state
    updateBookmarkState();

    // 2. Compute Metrics & Score
    const m = MX.compute(data);
    const s = SC.compute(m);
    currentMetrics = m;
    currentScore = s;

    // 3. Render Sub-Modules
    renderOverviewTab(m, s, data);
    renderMediaStudioTab(m, data);
    renderTimingTab(m);
    renderHashtagsTab(m);
    renderSWOTTab(m, s);
    renderPortfolioTab();

    // 4. Switch from Empty State to Results
    $('#emptyState, #cmpWrap').addClass('d-none');
    $('#resWrap').removeClass('d-none');

    // Animate Circular Health Meter
    setTimeout(() => {
        if (s) {
            const el = document.getElementById('rFill');
            if (el) {
                el.style.strokeDashoffset = 376.99 - (s.ov / 100) * 376.99;
                el.style.stroke = s.c;
            }
        }
    }, 80);
}

/* =================================================================
   TAB 1 — EXECUTIVE OVERVIEW
================================================================= */
function renderOverviewTab(m, s, d) {
    const trendText = m.sz ? (m.trend === 'rising' ? '&#x2191; Rising' : m.trend === 'falling' ? '&#x2193; Falling' : '&#x2192; Flat') : '--';
    const trendClass = m.trend === 'rising' ? 'text-success' : m.trend === 'falling' ? 'text-danger' : 'text-warning';

    // 8 Core Bento KPI Cards
    const kpis = [
        { icon: 'bi-people-fill', bg: 'rgba(59, 130, 246, 0.15)', col: '#3b82f6', label: 'Followers', val: fn(m.fol), sub: `Following: ${fn(m.follows)}` },
        { icon: 'bi-grid-3x3-gap-fill', bg: 'rgba(16, 185, 129, 0.15)', col: '#10b981', label: 'Total Posts', val: fn(d.postsCount), sub: `Sampled: ${m.sz} posts` },
        { icon: 'bi-activity', bg: 'rgba(220, 39, 67, 0.15)', col: '#dc2743', label: 'Eng. Rate', val: m.sz ? fp(m.er) : '--', sub: '(Likes + Comments) / Followers' },
        { icon: 'bi-heart-fill', bg: 'rgba(239, 68, 68, 0.15)', col: '#ef4444', label: 'Avg Likes', val: m.sz ? fn(Math.round(m.aL)) : '--', sub: `Median: ${fn(Math.round(m.mL))}` },
        { icon: 'bi-chat-fill', bg: 'rgba(168, 85, 247, 0.15)', col: '#a855f7', label: 'Avg Comments', val: m.sz ? fn(Math.round(m.aC)) : '--', sub: `Median: ${fn(Math.round(m.mC))}` },
        { icon: 'bi-chat-quote-fill', bg: 'rgba(245, 158, 11, 0.15)', col: '#f59e0b', label: 'Cmts / 100 Likes', val: m.sz ? m.cpl.toFixed(1) : '--', sub: 'Discussion depth' },
        { icon: 'bi-graph-up-arrow', bg: 'rgba(6, 182, 212, 0.15)', col: '#06b6d4', label: 'Growth Trend', val: `<span class="${trendClass}">${trendText}</span>`, sub: m.sz && m.trend !== 'flat' ? `${Math.abs(m.tpct).toFixed(0)}% momentum shift` : 'Sample-based trajectory' },
        { icon: 'bi-speedometer2', bg: 'rgba(99, 102, 241, 0.15)', col: '#6366f1', label: 'Health Index', val: s ? `${s.ov}/100` : '--', sub: s ? `${s.g} · ${s.t}` : 'Needs data' }
    ];

    $('#kpiRow').html(kpis.map(k => `
        <div class="col-xl-3 col-lg-4 col-sm-6">
            <div class="kpi ca-hv">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="kpi-l">${esc(k.label)}</span>
                    <div class="kpi-ico" style="background:${k.bg}"><i class="bi ${k.icon}" style="color:${k.col}"></i></div>
                </div>
                <div class="kpi-v">${k.val}</div>
                <div class="kpi-s">${esc(k.sub)}</div>
            </div>
        </div>
    `).join(''));

    // Health Score Ring
    if (s) {
        $('#sVal').text(s.ov);
        $('#sGrd').text(`${s.g} · ${'★'.repeat(s.stars)}${'☆'.repeat(5 - s.stars)}`);
        $('#sTier').text(s.t).css({ background: s.c + '25', color: s.c, border: '1px solid ' + s.c + '50' });
        $('#sConf').html(`<span class="conf ${s.conf[1]}"><i class="bi bi-shield-check"></i> ${s.conf[0]} Confidence</span>`);
        $('#sBase').text(`Evaluated over last ${m.sz} posts`);
        
        // Pillars progress bars
        $('#cBars').html(Object.values(s.C).map(c => `
            <div class="cb-w">
                <div class="d-flex justify-content-between mb-1">
                    <span style="font-weight:600;font-size:11px">${esc(c.l)}</span>
                    <span style="font-size:11px;color:var(--tm)">${Math.round(c.s)}/100 <span style="opacity:.6">(${Math.round(c.nw * 100)}% wt)</span></span>
                </div>
                <div class="cb-t">
                    <div class="cb-f" style="width:${Math.round(c.s)}%"></div>
                </div>
            </div>
        `).join(''));

        // Radar Balance Chart
        const cv = Object.values(s.C);
        CH.radar('rdrChart', cv.map(c => c.l), [{
            label: d.fullName || d.username,
            data: cv.map(c => Math.round(c.s)),
            backgroundColor: 'rgba(220, 39, 67, 0.18)',
            borderColor: '#dc2743',
            pointBackgroundColor: '#dc2743'
        }]);
    }

    // Format Mix Doughnut
    if (m.formatStats && m.formatStats.length) {
        const colors = ['#dc2743', '#bc1888', '#f09433', '#3b82f6', '#10b981', '#a855f7'];
        CH.doughnut(
            'fmtChart',
            m.formatStats.map(f => f.format),
            m.formatStats.map(f => f.count),
            colors.slice(0, m.formatStats.length)
        );

        $('#fmtMixSummary').html(m.formatStats.map(f => `
            <div class="d-flex align-items-center justify-content-between py-1 border-bottom" style="font-size:12px">
                <span class="fw7">${esc(f.format)}</span>
                <span style="color:var(--tm)">${f.count} posts (${f.sharePct.toFixed(0)}%) &middot; <strong>${f.avgER.toFixed(2)}%</strong> ER</span>
            </div>
        `).join(''));
    }

    // Trajectory Bar Chart
    const valid = m.valid || [];
    if (valid.length) {
        CH.bar('barChart', valid.map((_, i) => 'P' + (i + 1)), [
            { label: 'Likes', data: valid.map(p => p.likesCount || 0), backgroundColor: 'rgba(220, 39, 67, 0.8)', borderRadius: 6 },
            { label: 'Comments', data: valid.map(p => p.commentsCount || 0), backgroundColor: 'rgba(59, 130, 246, 0.8)', borderRadius: 6 }
        ]);
        $('#trendBadge').html(`<span class="badge rounded-pill ${m.trend === 'rising' ? 'bg-success' : m.trend === 'falling' ? 'bg-danger' : 'bg-warning'} px-3 py-2" style="font-size:11px"><i class="bi bi-graph-up me-1"></i>${m.trend.toUpperCase()} TREND</span>`);
    }
}

/* =================================================================
   TAB 2 — MEDIA STUDIO & POST GALLERY
================================================================= */
let currentMediaFilter = 'all';
let currentMediaSort = 'er';

function renderMediaStudioTab(m, data) {
    const posts = m.valid || [];
    $('#tabPostCount').text(posts.length);

    if (m.hid > 0) {
        $('#hdnNote').text(`${m.hid} post(s) excluded due to hidden/private like counts.`).removeClass('d-none');
    } else {
        $('#hdnNote').addClass('d-none');
    }

    applyMediaFilteringAndSorting();
}

function applyMediaFilteringAndSorting() {
    if (!currentMetrics || !currentMetrics.valid) return;
    const fol = currentMetrics.fol || 0;
    let list = [...currentMetrics.valid];

    // Filter
    if (currentMediaFilter !== 'all') {
        list = list.filter(p => {
            const t = (p.type || 'image').toLowerCase();
            if (currentMediaFilter === 'sidecar') return t === 'sidecar' || t === 'carousel';
            return t === currentMediaFilter;
        });
    }

    // Sort
    if (currentMediaSort === 'er') {
        list.sort((a, b) => {
            const erA = fol > 0 ? ((a.likesCount || 0) + (a.commentsCount || 0)) / fol : 0;
            const erB = fol > 0 ? ((b.likesCount || 0) + (b.commentsCount || 0)) / fol : 0;
            return erB - erA;
        });
    } else if (currentMediaSort === 'likes') {
        list.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
    } else if (currentMediaSort === 'comments') {
        list.sort((a, b) => (b.commentsCount || 0) - (a.commentsCount || 0));
    } else if (currentMediaSort === 'newest') {
        list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    }

    // Render Grid
    renderMediaGrid(list, fol);
    // Render Table
    renderMediaTable(list, fol);
}

function renderMediaGrid(posts, fol) {
    if (!posts.length) {
        $('#mediaGridContainer').html('<div class="col-12 py-5 text-center text-muted">No media found matching this filter.</div>');
        return;
    }

    const typeBadges = {
        video: '<span class="post-type-badge bg-danger text-white"><i class="bi bi-play-fill"></i> REEL</span>',
        sidecar: '<span class="post-type-badge bg-purple text-white"><i class="bi bi-layers-fill"></i> CAROUSEL</span>',
        carousel: '<span class="post-type-badge bg-purple text-white"><i class="bi bi-layers-fill"></i> CAROUSEL</span>',
        image: '<span class="post-type-badge bg-primary text-white"><i class="bi bi-image"></i> PHOTO</span>'
    };

    $('#mediaGridContainer').html(posts.map((p, idx) => {
        const lk = p.likesCount || 0;
        const cm = p.commentsCount || 0;
        const postER = fol > 0 ? ((lk + cm) / fol * 100).toFixed(2) : '--';
        const typeKey = (p.type || 'image').toLowerCase();
        const badge = typeBadges[typeKey] || typeBadges.image;
        const rawImg = p.displayUrl || (currentData ? currentData.profilePicUrlHD : '');
        const thumbUrl = rawImg ? proxyImg(rawImg, 'Post') : letterAv('Post', 300);
        const caption = p.caption || 'No caption available.';

        return `
            <div class="post-card" data-post-index="${idx}">
                <div class="post-thumb-wrap">
                    <img src="${thumbUrl}" class="post-thumb" alt="Post Thumbnail" referrerpolicy="no-referrer"
                         onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=300&fit=crop'">
                    ${badge}
                    <div class="post-stats-overlay">
                        <span><i class="bi bi-heart-fill text-danger me-1"></i>${fn(lk)}</span>
                        <span><i class="bi bi-chat-fill text-primary me-1"></i>${fn(cm)}</span>
                        <span class="badge bg-light text-dark border">${postER}% ER</span>
                    </div>
                </div>
                <div class="post-card-body">
                    <div class="post-card-caption">${esc(caption)}</div>
                    <div class="d-flex align-items-center justify-content-between mt-2 pt-2 border-top" style="font-size:11px;color:var(--tm)">
                        <span>${p.timestamp ? new Date(p.timestamp).toLocaleDateString() : 'Recent'}</span>
                        <span class="text-primary fw7">Inspect <i class="bi bi-chevron-right"></i></span>
                    </div>
                </div>
            </div>
        `;
    }).join(''));

    // Attach click modal event to cards
    $('#mediaGridContainer .post-card').on('click', function () {
        const postIdx = $(this).data('post-index');
        const selectedPost = posts[postIdx];
        if (selectedPost) openPostModal(selectedPost, fol);
    });
}

function renderMediaTable(posts, fol) {
    if (!posts.length) {
        $('#pTable').html('<tr><td colspan="7" class="text-center py-5 text-muted">No media matching criteria.</td></tr>');
        return;
    }

    $('#pTable').html(posts.map((p, i) => {
        const lk = p.likesCount || 0, cm = p.commentsCount || 0, rc = p.caption || '';
        const cap = esc(rc.substring(0, 65)) + (rc.length > 65 ? '&hellip;' : '');
        const url = esc(p.url || ('https://www.instagram.com/p/' + encodeURIComponent(p.shortCode || '') + '/'));
        const rawImg = p.displayUrl || (currentData ? currentData.profilePicUrlHD : '');
        const st = rawImg ? proxyImg(rawImg, 'Post') : letterAv('Post', 100);
        const per = fol > 0 ? ((lk + cm) / fol * 100).toFixed(2) : '--';
        const f = esc(p.type || 'Image');
        const fc = f.toLowerCase() === 'video' ? '#ef4444' : f.toLowerCase().includes('car') ? '#a855f7' : '#3b82f6';

        return `
            <tr>
                <td><img src="${st}" class="pt" alt="Thumb" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop'"></td>
                <td><div class="fw7" style="font-size:12px">${cap}</div></td>
                <td><span class="badge rounded-pill" style="background:${fc}20;color:${fc};border:1px solid ${fc}40;font-size:10px">${f}</span></td>
                <td class="fw7" style="color:var(--rd)">${fn(lk)}</td>
                <td class="fw7" style="color:var(--bl)">${fn(cm)}</td>
                <td class="fw7 text-success">${per}%</td>
                <td>
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-glass" style="font-size:11px;padding:4px 8px">
                        <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                </td>
            </tr>
        `;
    }).join(''));
}

function openPostModal(p, fol) {
    const lk = p.likesCount || 0;
    const cm = p.commentsCount || 0;
    const postER = fol > 0 ? ((lk + cm) / fol * 100).toFixed(2) : '--';
    const rawImg = p.displayUrl || (currentData ? currentData.profilePicUrlHD : '');
    const modalImg = rawImg ? proxyImg(rawImg, 'Post') : letterAv('Post', 500);
    const postUrl = p.url || ('https://www.instagram.com/p/' + encodeURIComponent(p.shortCode || '') + '/');
    const tags = (p.hashtags || []).map(t => `<span class="badge bg-light text-primary border me-1 mb-1">#${esc(t)}</span>`).join('');

    $('#modalPostTitle').html(`<i class="bi bi-camera me-2"></i>Post Analysis &bull; ${p.type || 'Photo'}`);
    $('#modalPostBody').html(`
        <div class="row g-4">
            <div class="col-md-6 text-center">
                <img src="${modalImg}" class="img-fluid rounded-3" style="max-height:420px;object-fit:cover;border:1px solid var(--bd)" alt="Post media" referrerpolicy="no-referrer">
            </div>
            <div class="col-md-6 d-flex flex-column justify-content-between">
                <div>
                    <div class="d-flex gap-3 mb-3">
                        <div class="p-3 rounded-3 flex-fill text-center" style="background:var(--sf2);border:1px solid var(--bd)">
                            <div class="text-danger fw8 fs-5"><i class="bi bi-heart-fill me-1"></i>${fn(lk)}</div>
                            <div class="small text-muted">Likes</div>
                        </div>
                        <div class="p-3 rounded-3 flex-fill text-center" style="background:var(--sf2);border:1px solid var(--bd)">
                            <div class="text-primary fw8 fs-5"><i class="bi bi-chat-fill me-1"></i>${fn(cm)}</div>
                            <div class="small text-muted">Comments</div>
                        </div>
                        <div class="p-3 rounded-3 flex-fill text-center" style="background:var(--sf2);border:1px solid var(--bd)">
                            <div class="text-success fw8 fs-5">${postER}%</div>
                            <div class="small text-muted">Eng. Rate</div>
                        </div>
                    </div>

                    <div class="st mb-2">Caption</div>
                    <div class="p-3 rounded-3 mb-3" style="background:var(--sf2);font-size:13px;max-height:160px;overflow-y:auto;border:1px solid var(--bd)">
                        ${esc(p.caption || 'No caption.')}
                    </div>

                    ${tags ? `<div class="st mb-2">Hashtags</div><div class="mb-3">${tags}</div>` : ''}
                </div>

                <div class="pt-3 border-top d-flex justify-content-between align-items-center">
                    <span style="font-size:12px;color:var(--tm)">
                        <i class="bi bi-clock me-1"></i>${p.timestamp ? new Date(p.timestamp).toLocaleString() : 'Recent'}
                    </span>
                    <a href="${esc(postUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ig btn-ia btn-sm">
                        <i class="bi bi-instagram me-1"></i> View on Instagram
                    </a>
                </div>
            </div>
        </div>
    `);

    const modal = new bootstrap.Modal(document.getElementById('postDetailModal'));
    modal.show();
}

/* =================================================================
   TAB 3 — TIMING & CADENCE HEATMAP
================================================================= */
function renderTimingTab(m) {
    const bestD = m.bestDayObj;
    const bestS = m.bestSlotObj;

    // Recommendation Alert
    if (bestD && bestS) {
        $('#aiTimingRecommendation').html(`
            <div class="d-flex align-items-center gap-3">
                <div class="kpi-ico bg-success bg-opacity-25 text-success fs-4 rounded-circle" style="width:48px;height:48px">
                    <i class="bi bi-lightning-charge-fill"></i>
                </div>
                <div>
                    <h6 class="fw8 mb-1">Recommended Next Post Window: <span class="text-success">${bestD.day} ${bestS.label}</span></h6>
                    <p class="mb-0 small text-muted">
                        Based on historical engagement, content uploaded on <strong>${bestD.day}s</strong> achieves an average of <strong>${bestD.avgER.toFixed(2)}% ER</strong>, outperforming other days by <strong>${((bestD.avgER / (m.er || 1)) * 100 - 100).toFixed(0)}%</strong>.
                    </p>
                </div>
            </div>
        `);
    } else {
        $('#aiTimingRecommendation').html('<div class="small text-muted">Insufficient timestamp metadata to formulate an optimal window.</div>');
    }

    // Day of Week Grid
    const dow = m.dowStats || [];
    $('#dowHeatmap').html(dow.map(d => {
        const isBest = bestD && bestD.day === d.day;
        return `
            <div class="timing-day-cell ${isBest ? 'best' : ''}">
                <div class="fw7" style="font-size:11px;color:${isBest ? 'var(--gn)' : 'var(--tm)'}">${d.day.substring(0, 3)}</div>
                <div class="fw8 fs-6 mt-1">${d.count}</div>
                <div style="font-size:10px;color:var(--tm)">posts</div>
                <div class="mt-2 pt-1 border-top fw7" style="font-size:11px;color:${isBest ? 'var(--gn)' : 'var(--tx)'}">
                    ${d.count > 0 ? d.avgER.toFixed(1) + '%' : '--'}
                </div>
            </div>
        `;
    }).join(''));

    // Day of Week Chart
    CH.bar(
        'dowChart',
        dow.map(d => d.day.substring(0, 3)),
        [{
            label: 'Avg Eng Rate (%)',
            data: dow.map(d => Number(d.avgER.toFixed(2))),
            backgroundColor: dow.map(d => (bestD && bestD.day === d.day ? 'rgba(16, 185, 129, 0.85)' : 'rgba(59, 130, 246, 0.7)')),
            borderRadius: 6
        }]
    );

    // Time Slot List
    const slots = m.slotStats || {};
    $('#timeSlotList').html(Object.values(slots).map(s => `
        <div class="timing-slot-cell">
            <div class="d-flex align-items-center gap-3">
                <i class="bi ${s.icon} fs-5 text-warning"></i>
                <div>
                    <div class="fw7" style="font-size:13px">${esc(s.label)}</div>
                    <div style="font-size:11px;color:var(--tm)">${s.count} post(s) in this block</div>
                </div>
            </div>
            <div class="text-end">
                <div class="fw8 fs-6 text-success">${s.avgER.toFixed(2)}%</div>
                <div style="font-size:10px;color:var(--tm)">Avg ER</div>
            </div>
        </div>
    `).join(''));

    // Cadence Box
    $('#cadenceBox').html(`
        <div class="row g-2 text-center">
            <div class="col-6 border-end">
                <div class="fw8 fs-4 text-primary">${m.ppw ? m.ppw.toFixed(1) : '--'}</div>
                <div style="font-size:11px;color:var(--tm)">Posts / Week</div>
            </div>
            <div class="col-6">
                <div class="fw8 fs-4 text-info">${m.intervalDays ? m.intervalDays.toFixed(1) + 'd' : '--'}</div>
                <div style="font-size:11px;color:var(--tm)">Average Interval</div>
            </div>
        </div>
    `);
}

/* =================================================================
   TAB 4 — HASHTAG & CAPTION SEMANTIC LAB
================================================================= */
function renderHashtagsTab(m) {
    const tags = m.hashtags || [];

    if (!tags.length) {
        $('#htTableBody').html('<tr><td colspan="4" class="text-center py-4 text-muted">No hashtags detected in sampled posts.</td></tr>');
        $('#htCloud').html('<div class="text-muted small">No hashtag data available.</div>');
    } else {
        // Table
        $('#htTableBody').html(tags.slice(0, 10).map((h, i) => `
            <tr>
                <td class="fw7 text-primary">#${esc(h.tag)}</td>
                <td><span class="badge rounded-pill bg-dark border">${h.count}x</span></td>
                <td>${fn(h.avgLikes)}</td>
                <td class="fw7 text-success">${h.avgER}%</td>
            </tr>
        `).join(''));

        // Cloud
        $('#htCloud').html(tags.slice(0, 24).map(h => `
            <span class="ht-pill" title="${h.count} posts &bull; ${h.avgER}% ER">
                #${esc(h.tag)} <span class="ht-cnt">${h.count}</span>
            </span>
        `).join(''));
    }

    // Caption & CTA Analytics
    const cs = m.captionStats;
    $('#captionAnalyticsBox').html(`
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small fw6">Average Caption Length</span>
                <span class="badge bg-secondary">${cs.avgLength} characters</span>
            </div>
            <div class="progress" style="height:6px">
                <div class="progress-bar bg-primary" style="width:${Math.min(100, (cs.avgLength / 300) * 100)}%"></div>
            </div>
        </div>

        <div class="p-3 rounded-2 mb-3" style="background:rgba(255,255,255,0.03);border:1px solid var(--bd)">
            <div class="fw7 mb-1" style="font-size:12px"><i class="bi bi-question-circle me-1 text-warning"></i>Question Prompt (CTA) Impact</div>
            <div style="font-size:12px;color:var(--tm)">
                Posts asking a question receive on average <strong>${cs.avgCmtsWithQ}</strong> comments vs <strong>${cs.avgCmtsNoQ}</strong> for statements 
                (${cs.ctaUplift > 0 ? `<span class="text-success fw7">+${cs.ctaUplift.toFixed(0)}% uplift</span>` : 'neutral'}).
            </div>
        </div>

        <div class="row g-2 text-center" style="font-size:11px">
            <div class="col-4 border-end">
                <div class="fw7 text-muted">Short (<80)</div>
                <div class="fw8 mt-1">${cs.shortAvgER}% ER</div>
            </div>
            <div class="col-4 border-end">
                <div class="fw7 text-muted">Med (80-250)</div>
                <div class="fw8 mt-1">${cs.medAvgER}% ER</div>
            </div>
            <div class="col-4">
                <div class="fw7 text-muted">Long (>250)</div>
                <div class="fw8 mt-1">${cs.longAvgER}% ER</div>
            </div>
        </div>
    `);
}

/* =================================================================
   TAB 5 — AI STRATEGY & SWOT MATRIX
================================================================= */
function renderSWOTTab(m, s) {
    const swot = IN.generateSWOT(m, s);
    if (!swot) return;

    $('#insHL').html(swot.hl);

    const renderList = (items, emptyText) => {
        if (!items.length) return `<div class="small text-muted py-2">${emptyText}</div>`;
        return items.map(item => `
            <div class="mb-2 pb-2 border-bottom border-secondary border-opacity-25">
                <div class="fw7" style="font-size:13px">${esc(item.title)}</div>
                <div class="small" style="color:var(--tx-sec);line-height:1.4">${item.desc}</div>
            </div>
        `).join('');
    };

    $('#strList').html(renderList(swot.strengths, 'No standout strengths identified.'));
    $('#wkList').html(renderList(swot.weaknesses, 'No major weaknesses identified.'));
    $('#oppList').html(renderList(swot.opportunities, 'No direct opportunities found.'));
    $('#threatList').html(renderList(swot.threats, 'No systemic threats observed.'));

    // Prioritized Action Plan
    const pClass = { High: 'ph', Medium: 'pm', Low: 'pl' };
    $('#actList').html(swot.actions.length ? swot.actions.map(act => `
        <div class="ic act d-flex align-items-center gap-3">
            <span class="badge rounded-pill ${pClass[act.prio] || 'pl'}" style="font-size:11px;min-width:65px;text-align:center">${esc(act.prio)}</span>
            <div style="font-size:13px;font-weight:500;line-height:1.5">${esc(act.text)}</div>
        </div>
    `).join('') : '<div class="small text-muted">No pending actions.</div>');

    // Formulas Used
    const b = m.fol ? SC.bench(m.fol) : null;
    $('#scForm').html(`
        <div class="row g-3" style="font-size:12px;line-height:1.8">
            <div class="col-md-6">
                <strong>Mathematical Formulas:</strong>
                <ul class="mt-2 ps-3">
                    <li><strong>Engagement Rate:</strong> (Avg Likes + Avg Comments) / Followers &times; 100</li>
                    <li><strong>Volatility Index (CV):</strong> StdDev(Engagements) / Mean(Engagements)</li>
                    <li><strong>Conversation Depth:</strong> Avg Comments / Avg Likes &times; 100</li>
                    <li><strong>Publishing Cadence:</strong> Sample Count / Timespan (Days) &times; 7</li>
                </ul>
            </div>
            <div class="col-md-6">
                <strong>Tier Benchmark Targets (${b ? b.label : 'General'}):</strong>
                <ul class="mt-2 ps-3">
                    <li><strong>Good ER:</strong> &ge; ${b ? b.good : 2.0}%</li>
                    <li><strong>Average ER:</strong> ~${b ? b.avg : 1.2}%</li>
                </ul>
            </div>
        </div>
    `);
}

/* =================================================================
   TAB 6 — PORTFOLIO WATCHLIST & REPORTS HUB
================================================================= */
function renderPortfolioTab() {
    const list = ST.getWatchlist();
    $('#navWatchCount').text(list.length);

    if (!list.length) {
        $('#watchlistGrid').html('<div class="col-12 py-4 text-center text-muted small">No saved accounts yet. Click the "Watchlist" button on any profile to bookmark it here!</div>');
    } else {
        $('#watchlistGrid').html(list.map(item => `
            <div class="col-md-6">
                <div class="ca p-3 d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-3">
                        <img src="${item.avatar || letterAv(item.fullName, 80)}" class="av-xs rounded-circle" alt="Thumb" referrerpolicy="no-referrer">
                        <div>
                            <div class="fw7" style="font-size:13px">${esc(item.fullName)}</div>
                            <div style="font-size:11px;color:var(--tm)">@${esc(item.username)} &bull; ${fn(item.followers)} fol</div>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge rounded-pill bg-dark border">${item.score}/100</span>
                        <button class="btn btn-sm btn-glass load-wl-btn" data-user="${esc(item.username)}" title="Load Profile">
                            <i class="bi bi-arrow-right"></i>
                        </button>
                        <button class="btn btn-sm btn-link text-danger remove-wl-btn p-0" data-user="${esc(item.username)}" title="Remove">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join(''));

        // Events
        $('.load-wl-btn').on('click', function () {
            const u = $(this).data('user');
            $('#acIn').val(u);
            runSingleAnalysis();
        });
        $('.remove-wl-btn').on('click', function () {
            const u = $(this).data('user');
            ST.removeWatchlist(u);
            renderPortfolioTab();
            updateBookmarkState();
        });
    }

    // Cache Stats
    const cacheKeys = ST.getCacheKeys();
    $('#cacheStatsBox').html(`
        <div class="d-flex justify-content-between align-items-center mb-2" style="font-size:12px">
            <span>Cached Profiles: <strong>${cacheKeys.length}</strong></span>
            <button id="btnClearCacheNow" class="btn btn-sm btn-outline-danger" style="font-size:11px;padding:2px 8px">Clear Cache</button>
        </div>
        ${cacheKeys.length ? cacheKeys.map(k => `
            <div class="d-flex justify-content-between py-1 border-bottom border-secondary border-opacity-25" style="font-size:11px;color:var(--tm)">
                <span>@${esc(k.user)}</span>
                <span>expires in ~${k.remainingMin}m</span>
            </div>
        `).join('') : '<div class="small text-muted py-2">Cache is empty.</div>'}
    `);

    $('#btnClearCacheNow').on('click', function () {
        ST.clearAllCache();
        renderPortfolioTab();
        showAlert('Local cache cleared successfully.');
    });
}

function updateBookmarkState() {
    if (!currentData || !currentData.username) return;
    const isSaved = ST.isWatchlisted(currentData.username);
    if (isSaved) {
        $('#bookmarkBtn').addClass('btn-danger').removeClass('btn-glass');
        $('#bookmarkIco').attr('class', 'bi bi-bookmark-check-fill');
    } else {
        $('#bookmarkBtn').addClass('btn-glass').removeClass('btn-danger');
        $('#bookmarkIco').attr('class', 'bi bi-bookmark-plus');
    }
    $('#navWatchCount').text(ST.getWatchlist().length);
}

/* =================================================================
   COMPARE MODE ARENA (Head-to-Head)
================================================================= */
function renderCompareArena(dA, dB) {
    const mA = MX.compute(dA);
    const mB = MX.compute(dB);
    const sA = SC.compute(mA);
    const sB = SC.compute(mB);

    renderMiniProfile(dA, 'profA');
    renderMiniProfile(dB, 'profB');

    // Dual Score Rings
    const ringCard = (sfx, s, name) => `
        <div class="col-md-6">
            <div class="ca p-4 text-center">
                <div class="fw8 mb-3 fs-6">${esc(name)}</div>
                <div class="ring-w">
                    <svg viewBox="0 0 140 140">
                        <circle class="ring-t" cx="70" cy="70" r="60"/>
                        <circle class="ring-f" id="rF${sfx}" cx="70" cy="70" r="60" stroke-dasharray="376.99" stroke-dashoffset="376.99" stroke="${s ? s.c : '#666'}"/>
                    </svg>
                    <div>
                        <div class="ring-n fs-4">${s ? s.ov : '--'}</div>
                        <div class="ring-g">${s ? s.g : '--'}</div>
                    </div>
                </div>
                <div class="mt-2"><span class="badge rounded-pill" style="font-size:11px;background:${s ? s.c + '25' : '#444'};color:${s ? s.c : '#aaa'}">${s ? s.t : '--'}</span></div>
            </div>
        </div>
    `;

    $('#cmpSR').html(ringCard('A', sA, dA.fullName || dA.username) + ringCard('B', sB, dB.fullName || dB.username));

    setTimeout(() => {
        if (sA) { const el = document.getElementById('rFA'); if (el) el.style.strokeDashoffset = 376.99 - (sA.ov / 100) * 376.99; }
        if (sB) { const el = document.getElementById('rFB'); if (el) el.style.strokeDashoffset = 376.99 - (sB.ov / 100) * 376.99; }
    }, 100);

    // Balance Overlay Radar
    const labels = sA ? Object.values(sA.C).map(c => c.l) : sB ? Object.values(sB.C).map(c => c.l) : [];
    const rds = [];
    if (sA) rds.push({ label: '@' + dA.username, data: Object.values(sA.C).map(c => Math.round(c.s)), backgroundColor: 'rgba(220,39,67,.2)', borderColor: '#dc2743', pointBackgroundColor: '#dc2743' });
    if (sB) rds.push({ label: '@' + dB.username, data: Object.values(sB.C).map(c => Math.round(c.s)), backgroundColor: 'rgba(59,130,246,.2)', borderColor: '#3b82f6', pointBackgroundColor: '#3b82f6' });
    if (rds.length) CH.radar('cmpRdr', labels, rds);

    // Trajectory Comparison
    const maxLen = Math.max(mA.era.length, mB.era.length);
    const lineLabels = Array.from({ length: maxLen }, (_, i) => 'P' + (i + 1));
    CH.line('cmpLine', lineLabels, [
        { label: '@' + dA.username, data: mA.era, borderColor: '#dc2743', backgroundColor: 'rgba(220,39,67,.1)', fill: true, tension: .3 },
        { label: '@' + dB.username, data: mB.era, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)', fill: true, tension: .3 }
    ]);

    // Metric Comparison Matrix
    const rows = [
        { l: 'Followers', a: fn(mA.fol), b: fn(mB.fol), ar: mA.fol, br: mB.fol },
        { l: 'Avg Likes', a: fn(Math.round(mA.aL)), b: fn(Math.round(mB.aL)), ar: mA.aL, br: mB.aL },
        { l: 'Avg Comments', a: fn(Math.round(mA.aC)), b: fn(Math.round(mB.aC)), ar: mA.aC, br: mB.aC },
        { l: 'Eng. Rate', a: fp(mA.er), b: fp(mB.er), ar: mA.er, br: mB.er },
        { l: 'Cmts / 100 Likes', a: mA.cpl.toFixed(1), b: mB.cpl.toFixed(1), ar: mA.cpl, br: mB.cpl },
        { l: 'Consistency (CV)', a: mA.cv.toFixed(2), b: mB.cv.toFixed(2), ar: -mA.cv, br: -mB.cv },
        { l: 'Health Score', a: sA ? sA.ov : '--', b: sB ? sB.ov : '--', ar: sA ? sA.ov : -1, br: sB ? sB.ov : -1 },
        { l: 'Trend Direction', a: mA.trend.toUpperCase(), b: mB.trend.toUpperCase(), ar: null, br: null }
    ];

    $('#cmpTbl').html(`
        <thead>
            <tr>
                <th>Growth Metric</th>
                <th style="color:#dc2743">@${esc(dA.username)} (A)</th>
                <th style="color:#3b82f6">@${esc(dB.username)} (B)</th>
                <th>Advantage</th>
                <th>Delta Difference</th>
            </tr>
        </thead>
        <tbody>
            ${rows.map(r => {
                let win = '&mdash;', dif = '&mdash;', wc = '';
                if (r.ar !== null && r.br !== null && r.ar !== -1 && r.br !== -1) {
                    if (r.ar > r.br) { win = 'A'; wc = '#dc2743'; }
                    else if (r.br > r.ar) { win = 'B'; wc = '#3b82f6'; }
                    else win = 'Tie';
                    
                    if (typeof r.ar === 'number' && typeof r.br === 'number' && r.br !== 0) {
                        const pct = (((r.ar - r.br) / Math.abs(r.br)) * 100).toFixed(1);
                        dif = (pct > 0 ? '+' : '') + pct + '%';
                    }
                }
                return `
                    <tr>
                        <td class="fw7" style="font-size:12px">${esc(r.l)}</td>
                        <td style="font-size:12px">${r.a}</td>
                        <td style="font-size:12px">${r.b}</td>
                        <td>${win !== '&mdash;' && win !== 'Tie' ? `<span class="badge" style="background:${wc}25;color:${wc};border:1px solid ${wc}50">${win} Wins</span>` : win}</td>
                        <td style="font-size:11px;color:var(--tm)">${dif}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    `);

    // Verdict Summary
    const nA = dA.fullName || dA.username;
    const nB = dB.fullName || dB.username;
    const scA = sA ? sA.ov : 0;
    const scB = sB ? sB.ov : 0;
    const winnerName = scA > scB ? nA : scB > scA ? nB : 'Tied';
    const pointMargin = Math.abs(scA - scB);

    $('#cmpVerdict').html(`
        <div class="p-3 rounded-3 mb-3" style="background:var(--sf2);border:1px solid var(--bd)">
            <h6 class="fw8 mb-1"><i class="bi bi-trophy-fill text-warning me-2"></i>Overall Winner: ${esc(winnerName)} ${pointMargin ? `by <strong>${pointMargin} points</strong>` : ''}</h6>
            <p class="mb-0 small text-muted">
                ${esc(nA)} achieved an index of <strong>${scA}/100</strong> (${sA ? sA.g : '--'}), while ${esc(nB)} earned <strong>${scB}/100</strong> (${sB ? sB.g : '--'}).
            </p>
        </div>
    `);

    $('#emptyState, #resWrap').addClass('d-none');
    $('#cmpWrap').removeClass('d-none');
}

function renderMiniProfile(data, id) {
    const name = data.fullName || data.name || data.username || '--';
    const rawPic = data.profilePicUrlHD || data.profilePicUrl;
    const fb = letterAv(name);
    const av = rawPic ? proxyImg(rawPic, name) : fb;

    $('#' + id).html(`
        <div class="ca p-3 d-flex align-items-center gap-3">
            <img src="${av}" class="av-sm rounded-circle" alt="Thumb" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'">
            <div>
                <div class="fw8" style="font-size:14px">${esc(name)} ${data.verified ? '<i class="bi bi-patch-check-fill text-primary"></i>' : ''}</div>
                <div style="font-size:12px;color:var(--tm)">@${esc(data.username || '')} &bull; ${fn(data.followersCount)} followers</div>
            </div>
        </div>
    `);
}

/* =================================================================
   DATA EXPORTS (CSV, JSON, Report Brief)
================================================================= */
function exportCSV() {
    if (!currentMetrics || !currentData) return;
    const posts = currentMetrics.valid || [];
    const fol = currentMetrics.fol || 0;

    let csv = 'Index,Type,Likes,Comments,EngagementRate,Timestamp,Caption,URL\n';
    posts.forEach((p, i) => {
        const lk = p.likesCount || 0;
        const cm = p.commentsCount || 0;
        const er = fol > 0 ? ((lk + cm) / fol * 100).toFixed(2) : '0';
        const cap = `"${(p.caption || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const date = p.timestamp ? `"${p.timestamp}"` : '""';
        const url = `"${p.url || ''}"`;
        csv += `${i + 1},${p.type || 'Photo'},${lk},${cm},${er}%,${date},${cap},${url}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `instagram_${currentData.username}_posts_${Date.now()}.csv`;
    a.click();
}

function exportJSON() {
    if (!currentData || !currentMetrics) return;
    const dump = {
        profile: {
            username: currentData.username,
            fullName: currentData.fullName,
            biography: currentData.biography,
            followers: currentMetrics.fol,
            following: currentMetrics.follows,
            postsCount: currentData.postsCount
        },
        healthScore: currentScore,
        metrics: {
            avgLikes: currentMetrics.aL,
            avgComments: currentMetrics.aC,
            overallER: currentMetrics.er,
            commentsPer100Likes: currentMetrics.cpl,
            volatilityCV: currentMetrics.cv,
            trend: currentMetrics.trend,
            postsPerWeek: currentMetrics.ppw
        },
        formatMix: currentMetrics.formatStats,
        topHashtags: currentMetrics.hashtags,
        posts: currentMetrics.valid
    };

    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `instagram_${currentData.username}_data_${Date.now()}.json`;
    a.click();
}

function buildReportText() {
    if (!currentData || !currentMetrics || !currentScore) return '';
    const m = currentMetrics, s = currentScore, d = currentData;
    return [
        '=================================================================',
        `  INSTAANALYTICS AI REPORT: @${d.username.toUpperCase()}`,
        '=================================================================',
        `Generated: ${new Date().toLocaleString()}`,
        `Profile: ${d.fullName || d.username} | Verified: ${d.verified ? 'YES' : 'NO'}`,
        `Audience: ${fn(m.fol)} Followers | Published: ${fn(d.postsCount)} Posts`,
        `Bio: ${d.biography || 'None'}`,
        '',
        '--- CORE GROWTH METRICS ---',
        `Average Likes:        ${Math.round(m.aL).toLocaleString()} (Median: ${Math.round(m.mL).toLocaleString()})`,
        `Average Comments:     ${Math.round(m.aC).toLocaleString()}`,
        `Overall Eng. Rate:    ${m.er.toFixed(2)}%`,
        `Comments / 100 Likes: ${m.cpl.toFixed(1)}`,
        `Consistency (CV):     ${m.cv.toFixed(2)} (${m.cv <= 0.45 ? 'High Stability' : 'Volatile'})`,
        `Momentum Trend:       ${m.trend.toUpperCase()} (${m.tpct > 0 ? '+' : ''}${m.tpct.toFixed(0)}%)`,
        `Publishing Cadence:   ${m.ppw ? m.ppw.toFixed(1) + ' posts/wk' : 'N/A'}`,
        '',
        '--- ACCOUNT HEALTH SCORE ---',
        `Overall Score:        ${s.ov}/100 (Grade: ${s.g} · ${s.t})`,
        `Stars:                ${'★'.repeat(s.stars)}${'☆'.repeat(5 - s.stars)}`,
        `Confidence Level:     ${s.conf[0]}`,
        ...Object.values(s.C).map(c => `  - ${c.l}: ${Math.round(c.s)}/100 (${c.v})`),
        '',
        '--- CONTENT FORMAT MIX ---',
        ...m.formatStats.map(f => `  - ${f.format}: ${f.count} posts (${f.sharePct.toFixed(0)}%) · Avg ER: ${f.avgER.toFixed(2)}%`),
        '',
        '================================================================='
    ].join('\n');
}

/* =================================================================
   SEARCH & ANALYSIS CONTROLLERS
================================================================= */
async function runSingleAnalysis() {
    const rawInput = $('#acIn').val();
    const username = cleanUser(rawInput);
    if (!username) {
        showAlert('Please enter an Instagram @username or profile URL.');
        return;
    }

    hideAlert();
    setButtonLoading('#srchBtn', true, 'Extracting Live Data...');

    try {
        const limit = parseInt($('#limSel').val(), 10) || 12;
        const res = await API.fetch([username], limit, forceRefreshActive);
        forceRefreshActive = false;

        const profileData = res[username];
        if (!profileData) {
            showAlert(`Could not find profile @${username}. Check the spelling or try another public profile.`);
            return;
        }

        ST.addHist(username);
        drawHistoryChips();
        renderProfile(profileData);

    } catch (err) {
        showAlert('Error: ' + (err.responseJSON?.error?.message || err.statusText || 'Failed to fetch Instagram profile data.'));
    } finally {
        setButtonLoading('#srchBtn', false, '<i class="bi bi-lightning-charge-fill me-1"></i> Analyze Live');
    }
}

async function runCompareAnalysis() {
    const uA = cleanUser($('#acInA').val());
    const uB = cleanUser($('#acInB').val());

    if (!uA || !uB) {
        showAlert('Please provide usernames for both Account A and Account B.');
        return;
    }
    if (uA === uB) {
        showAlert('Please provide two different Instagram profiles to compare.');
        return;
    }

    hideAlert();
    setButtonLoading('#cmpBtn', true, 'Comparing Accounts...');

    try {
        const limit = parseInt($('#limSel').val(), 10) || 12;
        const res = await API.fetch([uA, uB], limit, forceRefreshActive);
        forceRefreshActive = false;

        const dA = res[uA];
        const dB = res[uB];

        if (!dA && !dB) {
            showAlert('Could not find data for either account.');
            return;
        }
        if (!dA) {
            showAlert(`Could not find @${uA}. Displaying @${uB} only.`);
            renderProfile(dB);
            return;
        }
        if (!dB) {
            showAlert(`Could not find @${uB}. Displaying @${uA} only.`);
            renderProfile(dA);
            return;
        }

        ST.addHist(uA);
        ST.addHist(uB);
        drawHistoryChips();
        renderCompareArena(dA, dB);

    } catch (err) {
        showAlert('Error: ' + (err.responseJSON?.error?.message || err.statusText || 'Comparison request failed.'));
    } finally {
        setButtonLoading('#cmpBtn', false, '<i class="bi bi-intersect me-1"></i> Compare');
    }
}

function togCmp(enable, persist) {
    compareMode = enable;
    if (persist) ST.setPref('cmpMode', enable);

    if (enable) {
        $('#cmpToggle').addClass('on');
        $('#sinRow').addClass('d-none');
        $('#cmpRow').removeClass('d-none');
    } else {
        $('#cmpToggle').removeClass('on');
        $('#sinRow').removeClass('d-none');
        $('#cmpRow').addClass('d-none');
    }
}

function drawHistoryChips() {
    const history = ST.getHist();
    if (!history.length) {
        $('#histWrap').addClass('d-none');
        return;
    }
    $('#histWrap').removeClass('d-none');
    $('#histChips').html(history.map(u => `
        <span class="hc" data-u="${esc(u)}">
            <i class="bi bi-clock-history" style="font-size:10px"></i> @${esc(u)}
        </span>
    `).join(''));
}

/* =================================================================
   INIT & EVENT BINDINGS
================================================================= */
$(() => {
    // 1. Restore State & Preferences
    compareMode = ST.pref('cmpMode', false);
    if (compareMode) togCmp(true, false);

    const lastInput = ST.pref('lastIn', '');
    if (lastInput) $('#acIn').val(lastInput);

    const savedTheme = ST.pref('theme', 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);
    $('#themeIco').attr('class', savedTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill');

    drawHistoryChips();
    $('#navWatchCount').text(ST.getWatchlist().length);

    // 2. Search & Compare Events
    $('#srchBtn').on('click', runSingleAnalysis);
    $('#acIn').on('keypress', e => { if (e.which === 13) runSingleAnalysis(); })
             .on('input', function () { ST.setPref('lastIn', $(this).val()); });

    $('#cmpBtn').on('click', runCompareAnalysis);
    $('#acInA, #acInB').on('keypress', e => { if (e.which === 13) runCompareAnalysis(); });

    $('#cmpToggle, #cmpLabel').on('click', function(e) {
        if (e.target.tagName !== 'INPUT') {
            togCmp(!compareMode, true);
        }
    });

    $('#forceBtn').on('click', function () {
        forceRefreshActive = true;
        showAlert('Bypass cache active: next search will fetch fresh live data from Apify.');
    });

    $('#clrBtn').on('click', () => { $('#acIn').val('').focus(); hideAlert(); });
    $('#clrHistBtn').on('click', () => { ST.clearHist(); drawHistoryChips(); });

    // Quick Suggestion Chips
    $(document).on('click', '.qc[data-u]', function () {
        const u = $(this).data('u');
        if (compareMode) {
            if (!$('#acInA').val()) $('#acInA').val(u);
            else $('#acInB').val(u);
        } else {
            $('#acIn').val(u);
            runSingleAnalysis();
        }
    });

    // History Chips Click
    $('#histChips').on('click', '.hc', function () {
        const u = $(this).data('u');
        if (compareMode) {
            if (!$('#acInA').val()) $('#acInA').val(u);
            else $('#acInB').val(u);
        } else {
            $('#acIn').val(u);
            runSingleAnalysis();
        }
    });

    // 3. Sub-Navigation Tabs
    $('.d-tab-btn').on('click', function () {
        const targetTab = $(this).data('tab');
        $('.d-tab-btn').removeClass('active');
        $(this).addClass('active');

        $('.tab-pane-content').addClass('d-none');
        $('#' + targetTab).removeClass('d-none');
    });

    $('#quickWatchlistBtn').on('click', function () {
        $('.d-tab-btn').removeClass('active');
        $('[data-tab="tab-portfolio"]').addClass('active');
        $('.tab-pane-content').addClass('d-none');
        $('#tab-portfolio').removeClass('d-none');
        renderPortfolioTab();
        $('#resWrap').removeClass('d-none');
        $('#emptyState').addClass('d-none');
    });

    // 4. Media Studio Controls
    $('#mediaFilterGroup .btn').on('click', function () {
        $('#mediaFilterGroup .btn').removeClass('active');
        $(this).addClass('active');
        currentMediaFilter = $(this).data('filter');
        applyMediaFilteringAndSorting();
    });

    $('#mediaSortSel').on('change', function () {
        currentMediaSort = $(this).val();
        applyMediaFilteringAndSorting();
    });

    $('#viewGridBtn').on('click', function () {
        $(this).addClass('active');
        $('#viewTableBtn').removeClass('active');
        $('#mediaGridContainer').removeClass('d-none');
        $('#mediaTableContainer').addClass('d-none');
    });

    $('#viewTableBtn').on('click', function () {
        $(this).addClass('active');
        $('#viewGridBtn').removeClass('active');
        $('#mediaGridContainer').addClass('d-none');
        $('#mediaTableContainer').removeClass('d-none');
    });

    // 5. Watchlist Bookmark Button
    $('#bookmarkBtn').on('click', function () {
        if (!currentData || !currentMetrics) return;
        const saved = ST.toggleWatchlist(currentData, currentScore);
        updateBookmarkState();
        renderPortfolioTab();
        showAlert(saved ? `@${currentData.username} saved to your Watchlist!` : `@${currentData.username} removed from Watchlist.`);
    });

    $('#clearWatchlistBtn').on('click', function () {
        ST.clearWatchlist();
        renderPortfolioTab();
        updateBookmarkState();
    });

    // 6. Exports & Clipboard
    $('#exportCsvBtn, #dlCsvBtn2').on('click', exportCSV);
    $('#dlJsonBtn').on('click', exportJSON);
    $('#dlTxtBtn').on('click', function () {
        const text = buildReportText();
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `instagram_${currentData?.username || 'report'}_summary.txt`;
        a.click();
    });

    $('#cpyBtn').on('click', function () {
        navigator.clipboard.writeText(buildReportText()).then(() => {
            $(this).html('<i class="bi bi-check2"></i> Copied!');
            setTimeout(() => $(this).html('<i class="bi bi-clipboard"></i> Copy Summary'), 2000);
        });
    });

    $('#prtBtn').on('click', () => window.print());

    // 7. Theme Toggle
    $('#themeBtn').on('click', function () {
        const curr = document.documentElement.getAttribute('data-theme');
        const next = curr === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        ST.setPref('theme', next);
        $('#themeIco').attr('class', next === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill');
        
        // Re-render charts with updated theme colors
        if (currentMetrics && currentScore) {
            renderOverviewTab(currentMetrics, currentScore, currentData);
            renderTimingTab(currentMetrics);
        }
    });

    // 8. Q&A Ask Analyst Chips
    $('#qChips').on('click', '.qc', function () {
        if (!currentMetrics) return;
        const query = $(this).data('q');
        $('#qaBox').html(IN.qa(query, currentMetrics, currentScore)).removeClass('d-none');
        $('#qChips .qc').removeClass('aqc');
        $(this).addClass('aqc');
    });

    // 9. Methodology Accordion
    $('#scAccH').on('click', function () {
        $('#scAccB').toggleClass('open');
        $('#scChev').toggleClass('bi-chevron-down bi-chevron-up');
    });
});