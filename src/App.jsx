import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, Bell, BellRing, Check, Clock3, Instagram, Plus, RotateCcw, Trash2, Users, X, BarChart3 } from "lucide-react";

const STORAGE_KEY = "insta-following-count-v1";
const RESET_HOUR = 5;
const INTERVAL_MS = 60 * 60 * 1000;

function localDayKey(date = new Date()) {
  const d = new Date(date);
  if (d.getHours() < RESET_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function cleanDailyProfile(p) {
  return { ...p, followedToday: 0, completedCycles: 0, nextAt: null };
}
function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.profiles)) return { day: localDayKey(), profiles: [], history: [] };
    let history = Array.isArray(parsed.history) ? parsed.history : [];
    // Preserve the old version's current-day count as a first historical point during migration.
    if (!Array.isArray(parsed.history)) {
      (parsed.profiles || []).forEach((p) => {
        if (Number(p.followedToday) > 0) history.push({ id: `legacy-${p.id}-${parsed.day || localDayKey()}`, profileId: p.id, profileName: p.name, date: parsed.day || localDayKey(), timestamp: new Date(`${parsed.day || localDayKey()}T12:00:00`).getTime(), count: Number(p.followedToday) });
      });
    }
    const today = localDayKey();
    const profiles = parsed.day === today ? parsed.profiles : parsed.profiles.map(cleanDailyProfile);
    return { ...parsed, day: today, profiles, history };
  } catch {
    return { day: localDayKey(), profiles: [], history: [] };
  }
}
function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function timeUntilReset() {
  const now = new Date();
  const reset = new Date(now);
  reset.setHours(RESET_HOUR, 0, 0, 0);
  if (now >= reset) reset.setDate(reset.getDate() + 1);
  return reset;
}
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function startOfWeek(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d;
}
function bucketKey(timestamp, range) {
  const d = new Date(timestamp);
  if (range === "day") return dateKey(d);
  if (range === "week") return dateKey(startOfWeek(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function bucketLabel(key, range) {
  if (range === "month") { const [y, m] = key.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" }); }
  const d = new Date(`${key}T12:00:00`);
  return range === "week" ? `${d.getDate()} ${d.toLocaleDateString(undefined, { month: "short" })}` : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function App() {
  const [data, setData] = useState(readSaved);
  const [now, setNow] = useState(Date.now());
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [alarmProfile, setAlarmProfile] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [chartRange, setChartRange] = useState("day");
  const [chartProfile, setChartProfile] = useState("all");
  const firedRef = useRef(new Set());

  const save = useCallback((next) => {
    setData(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // At 5 AM, reset only today's counters and timers. Keep profiles and all historical records.
  useEffect(() => {
    const checkReset = () => {
      const today = localDayKey();
      setData((current) => {
        if (current.day === today) return current;
        const fresh = { ...current, day: today, profiles: current.profiles.map(cleanDailyProfile), history: current.history || [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        firedRef.current.clear();
        return fresh;
      });
      setNow(Date.now());
    };
    const id = setInterval(checkReset, 15000);
    window.addEventListener("focus", checkReset);
    document.addEventListener("visibilitychange", checkReset);
    return () => { clearInterval(id); window.removeEventListener("focus", checkReset); document.removeEventListener("visibilitychange", checkReset); };
  }, []);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data]);

  const dueProfiles = useMemo(() => data.profiles.filter(p => p.nextAt && p.nextAt <= now), [data.profiles, now]);
  useEffect(() => {
    dueProfiles.forEach((p) => {
      const key = `${p.id}-${p.nextAt}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      setAlarmProfile(p);
      setNotice(`${p.name} is ready for the next 50-account session.`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("One-hour session is ready", { body: `${p.name}: your next 50-follow session is ready.` });
      playAlarm();
    });
  }, [dueProfiles]);

  function playAlarm() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      [0, 0.25, 0.5].forEach((offset) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.18);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch { /* Browser may block audio until the user interacts. */ }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { setNotice("This browser does not support notifications."); return; }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    setNotice(permission === "granted" ? "Notifications enabled." : "Notifications were not allowed. Keep this tab open for on-screen reminders.");
  }

  function addProfile(e) {
    e.preventDefault(); if (!name.trim()) return;
    const profile = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name: name.trim(), handle: handle.trim().replace(/^@/, ""), followedToday: 0, completedCycles: 0, nextAt: null, createdAt: Date.now() };
    save({ ...data, profiles: [profile, ...data.profiles] });
    setName(""); setHandle(""); setShowAdd(false);
  }

  function markFifty(id) {
    const profile = data.profiles.find(p => p.id === id); if (!profile) return;
    const timestamp = Date.now();
    const entry = { id: `${id}-${timestamp}`, profileId: id, profileName: profile.name, date: localDayKey(new Date(timestamp)), timestamp, count: 50 };
    const next = { ...data, history: [...(data.history || []), entry], profiles: data.profiles.map(p => p.id === id ? { ...p, followedToday: (p.followedToday || 0) + 50, completedCycles: (p.completedCycles || 0) + 1, nextAt: timestamp + INTERVAL_MS } : p) };
    save(next); setAlarmProfile(null);
    firedRef.current.delete(`${id}-${profile.nextAt}`);
  }

  function removeProfile(id) {
    if (!window.confirm("Remove this profile from the active list? Its historical follow records will be kept in Analytics.")) return;
    save({ ...data, profiles: data.profiles.filter(p => p.id !== id) });
  }
  function resetProfile(id) {
    save({ ...data, profiles: data.profiles.map(p => p.id === id ? cleanDailyProfile(p) : p) });
  }

  const totalFollowed = data.profiles.reduce((sum, p) => sum + (p.followedToday || 0), 0);
  const resetCountdown = formatTime(timeUntilReset().getTime() - now);
  const analytics = useMemo(() => {
    const source = (data.history || []).filter(x => chartProfile === "all" || x.profileId === chartProfile);
    const count = chartRange === "day" ? 14 : chartRange === "week" ? 8 : 12;
    const keys = [];
    const base = new Date(); base.setHours(12, 0, 0, 0);
    if (chartRange === "day") {
      for (let i = count - 1; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - i); keys.push(dateKey(d)); }
    } else if (chartRange === "week") {
      const start = startOfWeek(base);
      for (let i = count - 1; i >= 0; i--) { const d = new Date(start); d.setDate(d.getDate() - i * 7); keys.push(dateKey(d)); }
    } else {
      for (let i = count - 1; i >= 0; i--) { const d = new Date(base.getFullYear(), base.getMonth() - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    }
    const totals = Object.fromEntries(keys.map(k => [k, 0]));
    source.forEach((item) => { const key = bucketKey(new Date(`${item.date || localDayKey()}T12:00:00`).getTime(), chartRange); if (key in totals) totals[key] += Number(item.count || 0); });
    return keys.map(key => ({ key, label: bucketLabel(key, chartRange), total: totals[key] }));
  }, [data.history, chartProfile, chartRange]);
  const maxChartValue = Math.max(50, ...analytics.map(x => x.total));
  const historyTotal = (data.history || []).filter(x => chartProfile === "all" || x.profileId === chartProfile).reduce((s, x) => s + Number(x.count || 0), 0);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#080b16] text-white">
      <div className="mx-auto min-h-screen w-[94%] max-w-[1600px] pb-10 pt-6 sm:w-[92%] lg:w-[90%] safe-bottom">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-orange-400 shadow-lg shadow-fuchsia-900/30"><Instagram size={23} /></div><div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">Insta Following Count</h1><p className="text-xs text-slate-400">Manual session tracker</p></div></div>
          <button onClick={enableNotifications} className={`rounded-xl border p-3 transition ${notificationsEnabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-300"}`} aria-label="Enable notifications">{notificationsEnabled ? <BellRing size={18} /> : <Bell size={18} />}</button>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#151a2b] p-4"><div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Users size={15} /> Profiles</div><div className="text-3xl font-bold tabular-nums sm:text-4xl">{data.profiles.length}</div><p className="mt-1 text-xs text-slate-500">Saved accounts</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#151a2b] p-4"><div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Check size={15} /> Followed today</div><div className="text-3xl font-bold tabular-nums sm:text-4xl">{totalFollowed}</div><p className="mt-1 text-xs text-slate-500">Across all profiles</p></div>
        </section>

        <section className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><Clock3 size={20} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-amber-100">Daily counters reset at 5:00 AM</p><p className="text-xs text-amber-100/60">Next reset in {resetCountdown} · Profiles and history stay saved</p></div><span className="rounded-lg bg-amber-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">Auto</span></section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Your accounts</h2><p className="text-xs text-slate-500">Track each account separately</p></div><button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-white/5 active:scale-95"><Plus size={17} /> Add profile</button></div>
        {notice && <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-3 text-sm text-fuchsia-100"><span>{notice}</span><button onClick={() => setNotice("")}><X size={16} /></button></div>}

        {data.profiles.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-12 text-center"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-slate-300"><Instagram size={26} /></div><h3 className="font-semibold">No profiles added yet</h3><p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">Add an Instagram account to start tracking your hourly sessions.</p><button onClick={() => setShowAdd(true)} className="mt-5 rounded-xl bg-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white">Add your first profile</button></div> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">{data.profiles.map((p) => {
          const remaining = p.nextAt ? p.nextAt - now : 0; const isDue = p.nextAt && remaining <= 0; const isRunning = p.nextAt && remaining > 0;
          return <article key={p.id} className={`min-w-0 rounded-2xl border p-5 transition ${isDue ? "border-emerald-400/50 bg-emerald-400/[0.08] shadow-lg shadow-emerald-950/20" : "border-white/10 bg-[#151a2b]"}`}>
            <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/20 text-lg font-bold text-pink-200">{p.name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-semibold">{p.name}</h3><p className="truncate text-xs text-slate-500">{p.handle ? `@${p.handle}` : "Instagram profile"}</p></div><button onClick={() => removeProfile(p.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-400/10 hover:text-red-300" aria-label={`Remove ${p.name}`}><Trash2 size={16} /></button></div>
              <div className="mt-3 flex items-end justify-between"><div><p className="text-xs uppercase tracking-wider text-slate-500">Followed today</p><p className="text-2xl font-bold tabular-nums">{p.followedToday || 0}<span className="ml-1 text-xs font-normal text-slate-500">members</span></p></div><div className="text-right"><p className="text-xs uppercase tracking-wider text-slate-500">{isDue ? "Ready now" : isRunning ? "Next session in" : "Timer not started"}</p><p className={`font-mono text-lg font-bold tabular-nums ${isDue ? "text-emerald-300" : isRunning ? "text-sky-300" : "text-slate-500"}`}>{isRunning ? formatTime(remaining) : isDue ? "00:00:00" : "--:--:--"}</p></div></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full transition-all ${isDue ? "w-full bg-emerald-400" : isRunning ? "bg-sky-400" : "w-0"}`} style={isRunning ? { width: `${Math.max(0, Math.min(100, (1 - remaining / INTERVAL_MS) * 100))}%` } : undefined} /></div>
              <div className="mt-4 flex gap-2"><button onClick={() => markFifty(p.id)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold active:scale-[.98] ${isDue ? "bg-emerald-400 text-[#07140e]" : "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white"}`}><Check size={16} /> Mark 50 followed</button><button onClick={() => resetProfile(p.id)} className="grid w-12 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400" title="Reset today's count and timer"><RotateCcw size={16} /></button></div>
              <p className="mt-2 text-center text-xs text-slate-400">Completed sessions today: {p.completedCycles || 0} · Historical records are kept</p>
            </div></div>
          </article>;
        })}</div>}

        <button onClick={() => setShowAnalytics(v => !v)} className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-400/25 bg-violet-400/10 px-4 py-3.5 text-sm font-bold text-violet-100"><BarChart3 size={18} /> {showAnalytics ? "Hide following analytics" : "View following analytics"}</button>
        {showAnalytics && <section className="mt-4 rounded-2xl border border-white/10 bg-[#151a2b] p-4 sm:p-6">
          <div className="mb-4"><h2 className="font-bold">Following history</h2><p className="text-xs text-slate-500">Your saved follow totals over time</p></div>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">{[["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]].map(([key, label]) => <button key={key} onClick={() => setChartRange(key)} className={`rounded-lg py-2 text-xs font-semibold ${chartRange === key ? "bg-violet-500 text-white" : "bg-white/5 text-slate-400"}`}>{label}</button>)}</div>
          <select value={chartProfile} onChange={e => setChartProfile(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-[#0d1120] px-3 py-2.5 text-sm text-slate-200 outline-none"><option value="all">All profiles combined</option>{data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs text-slate-500">Total recorded follows</p><p className="text-2xl font-bold tabular-nums">{historyTotal.toLocaleString()}</p></div><p className="text-xs text-slate-500">{chartRange === "day" ? "Last 14 days" : chartRange === "week" ? "Last 8 weeks" : "Last 12 months"}</p></div>
          <div className="flex min-w-0 h-[clamp(12rem,28vw,20rem)] items-end gap-2 overflow-x-auto border-b border-white/10 pb-3 sm:gap-3">{analytics.map(item => <div key={item.key} className="flex h-full min-w-[4.2%] flex-1 flex-col items-center justify-end gap-2"><span className="text-xs tabular-nums text-slate-400">{item.total || ""}</span><div title={`${item.label}: ${item.total}`} className="w-full max-w-[4rem] rounded-t-lg bg-gradient-to-t from-fuchsia-600 to-violet-400" style={{ height: `${item.total ? Math.max(4, item.total / maxChartValue * 100) : 2}%`, opacity: item.total ? 1 : 0.18 }} /><span className="w-full truncate text-center text-[0.68rem] text-slate-400">{item.label}</span></div>)}</div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Each “Mark 50 followed” tap saves a dated record. The 5:00 AM reset clears only today's counters and timers; this history remains saved.</p>
          {(data.history || []).length === 0 && <p className="mt-3 rounded-lg bg-white/5 p-3 text-center text-xs text-slate-400">No history yet. Mark a 50-follow session to start your graph.</p>}
        </section>}

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><AlarmClock size={17} className="text-violet-300" /> Reminder settings</div><ul className="space-y-1.5 text-xs leading-relaxed text-slate-500"><li>• Timer starts when you tap “Mark 50 followed” for an account.</li><li>• When it reaches zero, the account row highlights and an alarm plays if the browser allows it.</li><li>• Enable the bell for browser notifications. Keep this page open for reliable reminders.</li><li>• At 5:00 AM, only daily counts and timers reset. Profiles and analytics history are preserved.</li></ul></div>
        <p className="mt-5 text-center text-xs text-slate-500">Data stays in this browser on this device · No backend</p>
      </div>

      {showAdd && <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setShowAdd(false)}><form onSubmit={addProfile} onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#171c2e] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">Add Instagram profile</h2><p className="text-xs text-slate-500">Create a separate tracker row</p></div><button type="button" onClick={() => setShowAdd(false)} className="rounded-xl bg-white/5 p-2 text-slate-400"><X size={18} /></button></div><label className="mb-1.5 block text-xs font-medium text-slate-300">Profile name *</label><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Personal account" required className="mb-4 w-full rounded-xl border border-white/10 bg-[#0d1120] px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /><label className="mb-1.5 block text-xs font-medium text-slate-300">Instagram username (optional)</label><input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@username" className="w-full rounded-xl border border-white/10 bg-[#0d1120] px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /><button type="submit" className="mt-5 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 py-3 font-bold text-white">Add profile</button></form></div>}
      {alarmProfile && <div className="fixed bottom-4 left-4 right-4 z-30 mx-auto flex max-w-[1600px] items-center gap-3 rounded-2xl border border-emerald-300/30 bg-[#12251e] p-4 shadow-2xl shadow-black/40"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><BellRing size={20} /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-emerald-100">One-hour break completed</p><p className="truncate text-xs text-emerald-100/65">{alarmProfile.name} is ready for another session.</p></div><button onClick={() => setAlarmProfile(null)} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-emerald-950">Got it</button></div>}
    </main>
  );
}
