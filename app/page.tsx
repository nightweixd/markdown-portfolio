"use client";
import HolderPanel from "./holder-panel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radar,
  Compass,
  Star,
  Bell,
  SlidersHorizontal,
  Search,
  ArrowUpRight,
  ChevronDown,
  RefreshCw,
  Plus,
  X,
  Check,
  Copy,
  ShieldCheck,
  ArrowDown,
  ArrowUp,
  Settings2,
  Radio,
  CircleHelp,
  Send,
  Pause,
  Play,
  Trash2,
  Filter,
  Activity,
  Database,
  ExternalLink,
} from "lucide-react";
import {
  addressPattern,
  defaultFilters,
  matches,
  parseFilters,
  riskLabel,
  type Filters,
  type Interval,
  type Source,
  type Token,
  type View,
} from "@/lib/screener";
type Section = "discover" | "watchlist" | "alerts" | "settings";
type Rule = {
  id: string;
  name: string;
  filters: Filters;
  source: Source | "auto";
  view: View;
  interval: Interval;
  local?: boolean;
  enabled: boolean;
  addresses?: string[];
};
type Preset = { name: string; filters: Filters };
type Data = {
  tokens: Token[];
  source: Source;
  fetchedAt: number;
  coverage: string;
  interval: Interval;
};
type Status = {
  gmgn: boolean;
  chainbase: boolean;
  telegram: boolean;
  database: boolean;
  cron: boolean;
};
const builtins: Preset[] = [
  { name: "All candidates", filters: defaultFilters },
  {
    name: "Liquid momentum",
    filters: {
      ...defaultFilters,
      minLiquidity: 50000,
      minVolume: 20000,
      minChange: 10,
    },
  },
  {
    name: "Fresh pairs",
    filters: { ...defaultFilters, minLiquidity: 10000, maxAgeHours: 24 },
  },
];
const money = (n: number | null) =>
  n === null
    ? "—"
    : n > 0 && n < 0.01 ? "<$0.01" : "$" +
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(n);
const price = (n: number | null) =>
  n === null
    ? "—"
    : "$" +
      new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 }).format(n);
const percent = (n: number | null) =>
  n === null ? "—" : (n > 0 ? "+" : "") + n.toFixed(1) + "%";
function sumKnown(tokens:Token[],field:"liquidity"|"volume"):number|null { const values=tokens.map(t=>t[field]).filter((n):n is number=>n!==null); return tokens.length && !values.length ? null : values.reduce((a,n)=>a+n,0); }
function age(t: number | null) {
  if (t === null) return "—";
  const m = Math.max(0, (Date.now() / 1000 - t) / 60);
  return m < 60
    ? Math.floor(m) + "m"
    : m < 1440
      ? (m / 60).toFixed(1) + "h"
      : Math.floor(m / 1440) + "d";
}
const initials = (t: Token) =>
  t.symbol.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?";
const palette = ["#a9a2f3", "#85bcaf", "#e4b26a", "#9bb8e3", "#d4a0bf"];
function readStored<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem("bsc-radar:v1:" + key) ?? "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
}
function saveStored(key: string, value: unknown) {
  try {
    localStorage.setItem("bsc-radar:v1:" + key, JSON.stringify(value));
  } catch {}
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Field({
  label,
  name,
  filters,
  setFilters,
}: {
  label: string;
  name: keyof Filters;
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={name === "minChange" ? -100 : 0}
        max={name === "maxTop10" ? 100 : undefined}
        value={Number(filters[name])}
        onChange={(e) =>
          setFilters({ ...filters, [name]: Number(e.target.value) })
        }
      />
    </label>
  );
}
export default function Dashboard() {
  const [section, setSection] = useState<Section>("discover"),
    [view, setView] = useState<View>("trending"),
    [interval, setIntervalValue] = useState<Interval>("1h"),
    [source, setSource] = useState<Source | "auto">("auto");
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState<Status | null>(null),
    [signedOut, setSignedOut] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters),
    [presets, setPresets] = useState<Preset[]>([]),
    [presetName, setPresetName] = useState("All candidates"),
    [watchlist, setWatchlist] = useState<string[]>([]),
    [ready, setReady] = useState(false);
  const [filterDraft, setFilterDraft] = useState<Filters>(defaultFilters);
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [auto, setAuto] = useState(true),
    [sort, setSort] = useState<keyof Token>("volume"),
    [ascending, setAscending] = useState(false);
  const [modal, setModal] = useState<"filters" | "preset" | "rule" | null>(
      null,
    ),
    [name, setName] = useState(""),
    [rules, setRules] = useState<Rule[]>([]),
    [notice, setNotice] = useState(""),
    [events, setEvents] = useState<{ text: string; time: number }[]>([]),
    [alertsOn, setAlertsOn] = useState(false),
    [busy, setBusy] = useState(false);
  const cooldown = useRef(0),
    requestId = useRef(0),
    seen = useRef(new Map<string, Set<string>>()),
    dialogRef = useRef<HTMLDialogElement>(null);
  const notify = useCallback((text: string) => setNotice(text), []);
  useEffect(() => {
    const saved = readStored<string[]>("watchlist", []);
    setWatchlist(
      Array.isArray(saved)
        ? saved.filter((a) => addressPattern.test(a)).slice(0, 30)
        : [],
    );
    const ps = readStored<Preset[]>("presets", []);
    setPresets(
      Array.isArray(ps)
        ? ps.filter((p) => {
            try {
              parseFilters(p.filters);
              return typeof p.name === "string";
            } catch {
              return false;
            }
          })
        : [],
    );
    setRules(readStored<Rule[]>("local-rules", []));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal]);
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status");
      if (r.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!r.ok) return;
      setSignedOut(false);
      setStatus((await r.json()) as Status);
      const rs = await fetch("/api/rules");
      if (rs.ok) {
        const body = (await rs.json()) as { rules: Rule[] };
        setRules((old) => [...old.filter((r) => r.local), ...body.rules]);
      }
    } catch {}
  }, []);
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);
  const load = useCallback(async () => {
    if (
      !ready ||
      !["discover", "watchlist"].includes(section) ||
      Date.now() < cooldown.current
    )
      return;
    const id = ++requestId.current;
    if (section === "watchlist" && !watchlist.length) {
      setData({
        tokens: [],
        source: source === "demo" ? "demo" : "dexscreener",
        fetchedAt: Date.now(),
        coverage:
          "Add tokens to your watchlist from Discover. Watchlists are saved in this browser.",
        interval,
      });
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ source, view, interval });
      if (section === "watchlist" && source !== "demo")
        params.set("addresses", watchlist.join(","));
      if (query && section === "discover") params.set("q", query);
      const response = await fetch("/api/market?" + params);
      const body = (await response.json()) as Data & {
        error?: string;
        retryAt?: number;
      };
      if (id !== requestId.current) return;
      if (!response.ok) {
        if (response.status === 401) setSignedOut(true);
        if (body.retryAt) cooldown.current = body.retryAt * 1000;
        throw new Error(body.error ?? "Market request failed");
      }
      setSignedOut(false);
      setData(body);
      setSelected((old) =>
        body.tokens.some((t: Token) => t.address === old)
          ? old
          : (body.tokens[0]?.address ?? null),
      );
    } catch (e) {
      if (id === requestId.current) {
        setError(
          e instanceof Error ? e.message : "Could not fetch market data.",
        );
        setData(null);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [ready, section, watchlist, source, view, interval, query]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (auto && document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      clearInterval(timer);
      requestId.current++;
    };
  }, [load, auto]);
  const tokens = useMemo(() => {
    let list = (data?.tokens ?? []).filter((t) => matches(t, filters));
    if (section === "watchlist")
      list = list.filter((t) => watchlist.includes(t.address));
    return [...list].sort((a, b) => {
      const av = a[sort],
        bv = b[sort];
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (
        (typeof av === "string"
          ? String(av).localeCompare(String(bv))
          : Number(av) - Number(bv)) * (ascending ? 1 : -1)
      );
    });
  }, [data, filters, section, watchlist, sort, ascending]);
  const token = tokens.find((t) => t.address === selected) ?? tokens[0] ?? null;
  useEffect(() => {
    if (!data || !alertsOn) return;
    for (const rule of rules) {
      if (
        !rule.enabled ||
        rule.view !== view ||
        rule.interval !== data.interval ||
        (rule.source !== "auto" && rule.source !== data.source)
      )
        continue;
      const current = new Set(
        data.tokens
          .filter(
            (t) =>
              matches(t, rule.filters) &&
              (!rule.addresses?.length || rule.addresses.includes(t.address)),
          )
          .map((t) => t.address),
      );
      const previous = seen.current.get(rule.id);
      if (previous) {
        for (const address of current) {
          if (previous.has(address)) continue;
          const t = data.tokens.find((t) => t.address === address)!;
          const text = `${t.symbol} matched “${rule.name}”${data.source === "demo" ? " (demo)" : ""}`;
          setEvents((old) => [{ text, time: Date.now() }, ...old].slice(0, 30));
          notify(text);
          if ("Notification" in window && Notification.permission === "granted")
            new Notification("BSC Radar", { body: text });
        }
      }
      seen.current.set(rule.id, current);
    }
  }, [data, alertsOn, rules, view, notify]);
  function toggleWatch(address: string) {
    setWatchlist((old) => {
      if (old.length >= 30 && !old.includes(address)) {
        notify("Your watchlist supports up to 30 contracts.");
        return old;
      }
      const next = old.includes(address)
        ? old.filter((a) => a !== address)
        : [...old, address];
      saveStored("watchlist", next);
      return next;
    });
  }
  function choosePreset(value: string) {
    setPresetName(value);
    const p = [...builtins, ...presets].find((p) => p.name === value);
    if (p) setFilters({ ...p.filters });
  }
  function changeFilters(f: Filters) {
    setFilters(f);
    setPresetName("Custom filters");
  }
  function chooseSection(s: Section) {
    setSection(s);
    setQuery("");
    setSearch("");
  }
  async function saveRule() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const rule = {
        name: name.trim(),
        filters,
        source,
        view,
        interval: data?.interval ?? interval,
        enabled: true,
        addresses: section === "watchlist" ? [...watchlist] : [],
      };
      if (source === "demo") {
        const local = { ...rule, id: crypto.randomUUID(), local: true };
        setRules((old) => {
          const next = [local, ...old];
          saveStored(
            "local-rules",
            next.filter((r) => r.local),
          );
          return next;
        });
        notify("Demo alert saved for this browser only.");
      } else {
        const response = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rule),
        });
        const body = (await response.json()) as Data & {
          error?: string;
          retryAt?: number;
        };
        if (!response.ok) throw new Error(body.error ?? "Request failed");
        await refreshStatus();
        notify(
          "Alert rule saved. Telegram needs server secrets and a scheduled monitor.",
        );
      }
      setModal(null);
      setName("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to save rule.");
    } finally {
      setBusy(false);
    }
  }
  async function deleteRule(rule: Rule) {
    if (rule.local) {
      setRules((old) => {
        const next = old.filter((r) => r.id !== rule.id);
        saveStored(
          "local-rules",
          next.filter((r) => r.local),
        );
        return next;
      });
    } else {
      const r = await fetch("/api/rules?id=" + rule.id, { method: "DELETE" });
      if (!r.ok) {
        notify("Could not delete the rule.");
        return;
      }
      setRules((old) => old.filter((r) => r.id !== rule.id));
    }
    seen.current.delete(rule.id);
  }
  async function enableNotifications() {
    setAlertsOn(!alertsOn);
    if (
      !alertsOn &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      const permission = await Notification.requestPermission();
      notify(
        permission === "granted"
          ? "Desktop notifications enabled."
          : "In-page alerts enabled. Desktop notifications were not granted.",
      );
    }
  }
  async function testTelegram() {
    setBusy(true);
    try {
      const r = await fetch("/api/alerts", { method: "POST" });
      const b = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? "Request failed");
      notify("Telegram test alert sent.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }
  const activeCount = Object.keys(filters).filter(
    (k) => filters[k as keyof Filters] !== defaultFilters[k as keyof Filters],
  ).length;
  const volumeInterval = data?.interval ?? interval;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="BSC Radar home">
          <div className="brand-mark">
            <Radar size={25} />
          </div>
          <span>
            BSC<span className="brand-light">radar</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-dot" />
          <div>
            Personal workspace<small>BNB Smart Chain</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">Your workspace</div>
        <nav>
          {(
            [
              { id: "discover", label: "Discover", icon: Compass },
              { id: "watchlist", label: "Watchlist", icon: Star },
              { id: "alerts", label: "Alerts", icon: Bell },
              { id: "settings", label: "Connections", icon: Settings2 },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={section === n.id ? "nav-item active" : "nav-item"}
              onClick={() => chooseSection(n.id)}
              aria-current={section === n.id ? "page" : undefined}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "watchlist" && watchlist.length > 0 && (
                <b>{watchlist.length}</b>
              )}
              {n.id === "alerts" && rules.length > 0 && <b>{rules.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="chain-card">
            <div className="bnb-symbol">◆</div>
            <span>
              One chain. Clear signals.<small>Your BSC discovery desk.</small>
            </span>
          </div>
          <button
            className="nav-item"
            onClick={() => chooseSection("settings")}
          >
            <CircleHelp size={18} />
            Setup guide
          </button>
          <div className="profile">
            <div>F</div>
            <span>
              My workspace<small>Personal screener</small>
            </span>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {section === "discover"
                ? "Discover"
                : section === "watchlist"
                  ? "Watchlist"
                  : section === "alerts"
                    ? "Alerts"
                    : "Connections"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="chain-pill">
              <span className="bnb-mini">◆</span> BNB Smart Chain
            </span>
            <button
              className="icon-button"
              aria-label="Open alert center"
              onClick={() => chooseSection("alerts")}
            >
              <Bell size={18} />
              {events.length > 0 && <i />}
            </button>
            <div className="avatar">F</div>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <h1>
                {section === "discover"
                  ? "Discover your next signal."
                  : section === "watchlist"
                    ? "Keep your eyes on the right coins."
                    : section === "alerts"
                      ? "Let the signals come to you."
                      : "Connect your data."}
              </h1>
              <p>
                {section === "discover"
                  ? "A clearer view of new and active tokens on BNB Smart Chain."
                  : section === "watchlist"
                    ? "Your saved contracts, refreshed with available market data."
                    : section === "alerts"
                      ? "Monitor filters on this page and through Telegram."
                      : "Private credentials stay on the server. Your dashboard sees only market data."}
              </p>
            </div>
            <div className="heading-actions">
              {section === "discover" || section === "watchlist" ? (
                <>
                  <button
                    className="button subtle"
                    onClick={() => setAuto(!auto)}
                  >
                    {auto ? <Pause size={15} /> : <Play size={15} />}{" "}
                    {auto ? "Auto refresh" : "Paused"}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      setName(
                        presetName === "Custom filters"
                          ? "My alert"
                          : presetName,
                      );
                      setModal("rule");
                    }}
                  >
                    <Plus size={17} />
                    Create alert
                  </button>
                </>
              ) : (
                <button className="button subtle" onClick={refreshStatus}>
                  <RefreshCw size={15} />
                  Check connection
                </button>
              )}
            </div>
          </div>
          {signedOut && (
            <form
              className="notice-banner"
              onSubmit={async (e) => {
                e.preventDefault();
                const password = new FormData(e.currentTarget).get("password");
                const r = await fetch("/api/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password }),
                });
                if (r.ok) {
                  await refreshStatus();
                  load();
                } else notify(((await r.json()) as { error: string }).error);
              }}
            >
              <ShieldCheck size={20} />
              <div>
                <strong>Sign in to your personal dashboard.</strong>
                <p>Standalone Cloudflare: use your dashboard password.</p>
                <a
                  className="text-button"
                  href="/signin-with-chatgpt?return_to=%2F"
                  target="_top"
                >
                  Sign in with ChatGPT
                </a>
              </div>
              <input
                aria-label="Dashboard password"
                name="password"
                type="password"
                required
              />
              <button className="button primary">Sign in</button>
            </form>
          )}
          {section === "discover" || section === "watchlist" ? (
            <>
              <div className="overview">
                <Metric
                  label="In your view"
                  value={String(tokens.length)}
                  note={`of ${data?.tokens.length ?? 0} discovered tokens`}
                />
                <Metric
                  label="Combined liquidity"
                  value={money(
                    sumKnown(tokens,"liquidity"),
                  )}
                  note="Across filtered tokens only"
                />
                <Metric
                  label={`${volumeInterval} trading volume`}
                  value={money(sumKnown(tokens,"volume"))}
                  note="Across filtered tokens only"
                />
                <div className="feed-metric">
                  <div className="feed-icon">
                    <Radio size={20} />
                  </div>
                  <div>
                    <span>
                      {data?.source === "demo"
                        ? "Demo data"
                        : data?.source === "gmgn"
                          ? "GMGN feed"
                          : data
                            ? "Public data feed"
                            : "Connecting feed"}
                    </span>
                    <strong>
                      {loading
                        ? "Refreshing…"
                        : data
                          ? "Updated " +
                            new Date(data.fetchedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Waiting for data"}
                    </strong>
                    <small>Refreshes every 60 seconds</small>
                  </div>
                </div>
              </div>
              <div className="discovery-layout">
                <section className="market-panel">
                  <div className="market-heading">
                    <div
                      className="tabs"
                      role="tablist"
                      aria-label="Token discovery"
                    >
                      {(["trending", "new"] as const).map((v) => (
                        <button
                          key={v}
                          role="tab"
                          aria-selected={view === v}
                          className={view === v ? "selected" : ""}
                          onClick={() => {
                            setView(v);
                            setQuery("");
                            setSearch("");
                            setSort(v === "new" ? "createdAt" : "volume");
                            setAscending(false);
                          }}
                        >
                          {v === "trending" ? (
                            <Activity size={17} />
                          ) : (
                            <Radio size={17} />
                          )}{" "}
                          {v === "trending" ? "Trending" : "New tokens"}
                        </button>
                      ))}
                    </div>
                    <div className="time-tabs" aria-label="Market interval">
                      {(["1h", "6h", "24h"] as const).map((i) => (
                        <button
                          key={i}
                          onClick={() => setIntervalValue(i)}
                          aria-pressed={interval === i}
                          className={interval === i ? "selected" : ""}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="tools">
                    <form
                      className="search-box"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setQuery(search.trim());
                      }}
                    >
                      <Search size={17} />
                      <input
                        aria-label="Search BSC token name or contract"
                        placeholder="Search tokens or paste a contract"
                        value={search}
                        maxLength={100}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {query && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => {
                            setQuery("");
                            setSearch("");
                          }}
                        >
                          <X size={15} />
                        </button>
                      )}
                      <button type="submit" aria-label="Run token search">
                        <ArrowUpRight size={16} />
                      </button>
                    </form>
                    <button
                      className="button filter-button"
                      onClick={() => {
                        setFilterDraft({ ...filters });
                        setModal("filters");
                      }}
                    >
                      <SlidersHorizontal size={15} />
                      Filters{activeCount > 0 && <b>{activeCount}</b>}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Refresh token data"
                      disabled={loading}
                      onClick={load}
                    >
                      <RefreshCw size={17} className={loading ? "spin" : ""} />
                    </button>
                  </div>
                  <div className="presets-row">
                    <span>
                      <Filter size={13} />
                      Preset
                    </span>
                    <select
                      aria-label="Saved filter preset"
                      value={presetName}
                      onChange={(e) => choosePreset(e.target.value)}
                    >
                      {presetName === "Custom filters" && (
                        <option>Custom filters</option>
                      )}
                      {[...builtins, ...presets].map((p) => (
                        <option key={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setName("");
                        setModal("preset");
                      }}
                    >
                      <Plus size={13} />
                      Save preset
                    </button>
                    <label className="source-select">
                      <span>Source</span>
                      <select
                        aria-label="Market data source"
                        value={source}
                        onChange={(e) => {
                          setSource(e.target.value as Source | "auto");
                          setQuery("");
                          setSearch("");
                        }}
                      >
                        <option value="auto">Auto</option>
                        <option value="gmgn">GMGN</option>
                        <option value="dexscreener">DEX Screener</option>
                        <option value="demo">Demo</option>
                      </select>
                    </label>
                  </div>
                  {error ? (
                    <div className="empty-state">
                      <Database size={34} />
                      <h3>We couldn’t refresh the feed.</h3>
                      <p>{error}</p>
                      <button className="button subtle" onClick={load}>
                        Try again
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setSource("demo")}
                      >
                        Explore with demo data
                      </button>
                    </div>
                  ) : loading && !data ? (
                    <div className="empty-state">
                      <RefreshCw size={30} className="spin" />
                      <h3>Looking for BSC tokens…</h3>
                      <p>Fetching available market data.</p>
                    </div>
                  ) : tokens.length === 0 ? (
                    <div className="empty-state">
                      <Compass size={38} />
                      <h3>
                        {section === "watchlist"
                          ? "Build your own radar."
                          : "No tokens in this view yet."}
                      </h3>
                      <p>
                        {section === "watchlist"
                          ? "Star a token in Discover to keep it here."
                          : "Try fewer filters, search a contract, or connect GMGN for wider discovery."}
                      </p>
                      <button
                        className="button subtle"
                        onClick={() => {
                          setFilters(defaultFilters);
                          setPresetName("All candidates");
                          if (section === "watchlist")
                            chooseSection("discover");
                        }}
                      >
                        {section === "watchlist"
                          ? "Explore tokens"
                          : "Reset filters"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setSource("demo")}
                      >
                        Try the demo
                      </button>
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th aria-label="Watchlist" className="star-cell" />
                            <th className="token-cell">Token</th>
                            {(
                              [
                                { key: "createdAt", label: "Age" },
                                { key: "price", label: "Price" },
                                {
                                  key: "change",
                                  label: volumeInterval + " change",
                                },
                                { key: "marketCap", label: "Market cap" },
                                { key: "liquidity", label: "Liquidity" },
                                {
                                  key: "volume",
                                  label: volumeInterval + " volume",
                                },
                              ] as const
                            ).map((c) => (
                              <th key={c.key}>
                                <button
                                  onClick={() => {
                                    if (sort === c.key)
                                      setAscending(!ascending);
                                    else {
                                      setSort(c.key);
                                      setAscending(false);
                                    }
                                  }}
                                >
                                  {c.label}
                                  {sort === c.key ? (
                                    ascending ? (
                                      <ArrowUp size={12} />
                                    ) : (
                                      <ArrowDown size={12} />
                                    )
                                  ) : null}
                                </button>
                              </th>
                            ))}
                            <th>Risk data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tokens.map((t, index) => (
                            <tr
                              key={t.address}
                              className={
                                token?.address === t.address
                                  ? "selected-row"
                                  : ""
                              }
                            >
                              <td className="star-cell">
                                <button
                                  className={
                                    watchlist.includes(t.address)
                                      ? "star-button starred"
                                      : "star-button"
                                  }
                                  aria-label={
                                    (watchlist.includes(t.address)
                                      ? "Remove "
                                      : "Add ") +
                                    t.symbol +
                                    (watchlist.includes(t.address)
                                      ? " from watchlist"
                                      : " to watchlist")
                                  }
                                  aria-pressed={watchlist.includes(t.address)}
                                  onClick={() => toggleWatch(t.address)}
                                >
                                  <Star size={16} />
                                </button>
                              </td>
                              <td>
                                <button
                                  className="token-button"
                                  onClick={() => setSelected(t.address)}
                                >
                                  <span
                                    className="token-avatar"
                                    style={{
                                      background: palette[index % 5] + "20",
                                      color: palette[index % 5],
                                    }}
                                  >
                                    {initials(t)}
                                  </span>
                                  <span>
                                    <strong>{t.symbol}</strong>
                                    <small>
                                      {t.platform.replace("pool_", "")}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td className="muted">{age(t.createdAt)}</td>
                              <td>{price(t.price)}</td>
                              <td
                                className={
                                  t.change !== null
                                    ? t.change >= 0
                                      ? "positive"
                                      : "negative"
                                    : "muted"
                                }
                              >
                                {percent(t.change)}
                              </td>
                              <td>{money(t.marketCap)}</td>
                              <td>{money(t.liquidity)}</td>
                              <td>
                                {money(t.volume)}
                                <span className="volume-bar">
                                  <i
                                    style={{
                                      width:
                                        Math.max(
                                          2,
                                          ((t.volume ?? 0) /
                                            Math.max(
                                              ...tokens.map(
                                                (t) => t.volume ?? 0,
                                              ),
                                              1,
                                            )) *
                                            100,
                                        ) + "%",
                                    }}
                                  />
                                </span>
                              </td>
                              <td>
                                <span
                                  className={
                                    "risk-badge " +
                                    riskLabel(t).toLowerCase().replace(" ", "-")
                                  }
                                >
                                  {riskLabel(t) === "No flags" && (
                                    <Check size={12} />
                                  )}{" "}
                                  {riskLabel(t)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>{tokens.length} tokens · Values in USD</span>
                    <span>
                      {data?.source === "demo"
                        ? "Fictional sample data"
                        : "Unknown values shown as —"}
                    </span>
                  </div>
                </section>
                <aside className="detail-panel">
                  {token ? (
                    <>
                      <div className="detail-label">
                        <span>Token spotlight</span>
                        <button
                          className="icon-button"
                          aria-label="Toggle spotlight token watchlist"
                          onClick={() => toggleWatch(token.address)}
                        >
                          <Star
                            size={17}
                            fill={
                              watchlist.includes(token.address)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </div>
                      <div className="spotlight-heading">
                        <div className="big-token-avatar">
                          {initials(token)}
                        </div>
                        <div>
                          <h2>{token.symbol}</h2>
                          <p>{token.name}</p>
                        </div>
                      </div>
                      <div className="spotlight-price">
                        <strong>{price(token.price)}</strong>
                        <span
                          className={
                            token.change !== null && token.change < 0
                              ? "negative"
                              : "positive"
                          }
                        >
                          {percent(token.change)}
                          <small>{volumeInterval}</small>
                        </span>
                      </div>
                      <div className="detail-facts">
                        <div>
                          <span>Market cap</span>
                          <b>{money(token.marketCap)}</b>
                        </div>
                        <div>
                          <span>Liquidity</span>
                          <b>{money(token.liquidity)}</b>
                        </div>
                        <div>
                          <span>Holders</span>
                          <b>{token.holders?.toLocaleString() ?? "Unknown"}</b>
                        </div>
                        <div>
                          <span>
                            {token.source === "dexscreener"
                              ? "Pair age"
                              : "Token age"}
                          </span>
                          <b>{age(token.createdAt)}</b>
                        </div>
                      </div>
                      <div className="activity-block">
                        <h3>
                          Trading activity{" "}
                          <span>
                            {view === "new" && token.source === "gmgn"
                              ? "24h"
                              : volumeInterval}
                          </span>
                        </h3>
                        <div className="buys-sells">
                          <span className="positive">
                            Buys <b>{token.buys?.toLocaleString() ?? "—"}</b>
                          </span>
                          <span className="negative">
                            Sells <b>{token.sells?.toLocaleString() ?? "—"}</b>
                          </span>
                        </div>
                        <div className="trade-meter">
                          <i
                            style={{
                              width:
                                token.buys !== null && token.sells !== null
                                  ? (token.buys /
                                      Math.max(token.buys + token.sells, 1)) *
                                      100 +
                                    "%"
                                  : "0%",
                            }}
                          />
                        </div>
                      </div>
                      <div className="risk-block">
                        <h3>
                          <ShieldCheck size={16} />
                          Reported risk checks
                        </h3>
                        <div>
                          <span>Honeypot</span>
                          <b
                            className={
                              token.honeypot === true
                                ? "negative"
                                : token.honeypot === false
                                  ? "positive"
                                  : "muted"
                            }
                          >
                            {token.honeypot === null
                              ? "Unknown"
                              : token.honeypot
                                ? "Flagged"
                                : "Not flagged"}
                          </b>
                        </div>
                        <div>
                          <span>Verified contract</span>
                          <b>
                            {token.verified === null
                              ? "Unknown"
                              : token.verified
                                ? "Yes"
                                : "No"}
                          </b>
                        </div>
                        <div>
                          <span>Top 10 holders</span>
                          <b>
                            {token.top10 === null
                              ? "Unknown"
                              : (token.top10 * 100).toFixed(1) + "%"}
                          </b>
                        </div>
                        <div>
                          <span>Wash trading</span>
                          <b>
                            {token.washTrading === null
                              ? "Unknown"
                              : token.washTrading
                                ? "Flagged"
                                : "Not flagged"}
                          </b>
                        </div>
                        <small>
                          Missing data is never a passing check. “No flags” is
                          not a guarantee of safety.
                        </small>
                      </div>
                      {token.source !== "demo" && (
                        <HolderPanel
                          address={token.address}
                          enabled={!!status?.chainbase}
                        />
                      )}
                      <div className="contract-block">
                        <span>Contract address</span>
                        <button
                          title={token.address}
                          onClick={() =>
                            navigator.clipboard
                              .writeText(token.address)
                              .then(() => notify("Contract address copied."))
                              .catch(() =>
                                notify("Clipboard permission unavailable."),
                              )
                          }
                        >
                          {token.address.slice(0, 9)}…{token.address.slice(-7)}
                          <Copy size={14} />
                        </button>
                      </div>
                      {token.source !== "demo" ? (
                        <div className="detail-links">
                          <a
                            className="button primary"
                            href={
                              token.pairUrl ??
                              `https://gmgn.ai/bsc/token/${token.address}`
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open chart
                            <ArrowUpRight size={16} />
                          </a>
                          <a
                            className="button subtle"
                            href={`https://bscscan.com/token/${token.address}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            BscScan
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ) : (
                        <p className="demo-note">
                          Sample token · chart links disabled
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="detail-empty">
                      <Radar size={38} />
                      <h3>Your next signal starts here.</h3>
                      <p>
                        Select a token to inspect market activity and reported
                        risk data.
                      </p>
                    </div>
                  )}
                </aside>
              </div>
              <div
                className={
                  "coverage-note " + (data?.source === "demo" ? "demo" : "")
                }
              >
                <Database size={16} />
                <p>
                  {data?.coverage ??
                    "Auto selects GMGN when configured, otherwise the public DEX Screener fallback."}
                </p>
              </div>
            </>
          ) : section === "alerts" ? (
            <div className="alerts-layout">
              <section className="settings-card">
                <div className="section-title">
                  <Bell size={20} />
                  <h2>Your alert rules</h2>
                  <button
                    className="button subtle"
                    onClick={enableNotifications}
                  >
                    {alertsOn ? <Check size={15} /> : <Bell size={15} />}{" "}
                    {alertsOn ? "Page alerts on" : "Enable page alerts"}
                  </button>
                </div>
                <p className="card-description">
                  Page alerts detect new matches in the loaded feed while
                  Discover or Watchlist is open. Telegram uses saved rules
                  independently.
                </p>
                {rules.length ? (
                  rules.map((r) => (
                    <div className="rule-row" key={r.id}>
                      <div className="rule-icon">
                        <Radio size={18} />
                      </div>
                      <div>
                        <strong>{r.name}</strong>
                        <p>
                          {r.view === "new" ? "New tokens" : "Trending"} ·{" "}
                          {r.interval} ·{" "}
                          {r.local
                            ? "Demo / this browser"
                            : r.source + " / saved on server"}
                        </p>
                        <small>
                          Liquidity ≥ {money(r.filters.minLiquidity)} · Volume ≥{" "}
                          {money(r.filters.minVolume)}
                        </small>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={"Delete " + r.name}
                        onClick={() => deleteRule(r)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Bell size={34} />
                    <h3>No alert rules yet.</h3>
                    <p>
                      Set your filters in Discover, then choose Create alert.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => chooseSection("discover")}
                    >
                      Set up a rule
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                )}
                <div className="channel-status">
                  <Send size={20} />
                  <div>
                    <strong>Telegram</strong>
                    <p>
                      {status?.telegram
                        ? "Credentials configured. A background schedule is required."
                        : "Add your bot token and chat ID to server secrets to connect."}
                    </p>
                  </div>
                  <button
                    className="button subtle"
                    disabled={!status?.telegram || busy}
                    onClick={testTelegram}
                  >
                    Send test
                  </button>
                </div>
              </section>
              <section className="settings-card">
                <h2>Recent page alerts</h2>
                <p className="card-description">
                  A new session establishes a baseline. A token triggers when it
                  enters a rule on a later refresh.
                </p>
                {events.length ? (
                  events.map((e, i) => (
                    <div className="event-row" key={i}>
                      <span className="event-dot" />
                      <div>
                        {e.text}
                        <small>{new Date(e.time).toLocaleTimeString()}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="quiet-state">
                    <Radio size={28} />
                    <p>
                      Nothing has triggered yet.
                      <br />
                      We’ll keep the noise down.
                    </p>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="settings-layout">
              <section className="settings-card">
                <div className="section-title">
                  <Database size={20} />
                  <h2>Market data</h2>
                  <span
                    className={
                      "connection-state " + (status?.gmgn ? "connected" : "")
                    }
                  >
                    {status?.gmgn ? "GMGN configured" : "GMGN setup pending"}
                  </span>
                </div>
                <h3>GMGN OpenAPI</h3>
                <p className="card-description">
                  Connect your key for BSC rankings, launchpad discovery and
                  reported holder and risk data.
                </p>
                <ol className="setup-steps">
                  <li>
                    Use the public key generated by <code>gmgn-cli config</code>{" "}
                    to bind your GMGN API key.
                  </li>
                  <li>
                    Add <code>GMGN_API_KEY</code> to encrypted server secrets in
                    your host.
                  </li>
                  <li>
                    Check API permissions and IP restrictions, redeploy, then
                    choose GMGN in the source menu.
                  </li>
                </ol>
                <div className="setup-callout">
                  <ShieldCheck size={19} />
                  <p>
                    Keep API keys out of browser code. Screening uses read-only
                    routes and does not need a wallet signing key.
                  </p>
                </div>
                <h3>Public fallback</h3>
                <p className="card-description">
                  DEX Screener works without a key. Discovery uses profiles and
                  paid boosts; coverage is limited. Contract search and market
                  metrics work. Holder and security fields remain unknown.
                </p>
                <h3>Chainbase / web3-data</h3>
                <p className="card-description">
                  {status?.chainbase
                    ? "Connected. Select a live token to load indexed holder counts and its largest balances. Data is cached for five minutes to reduce API usage."
                    : "Add CHAINBASE_API_KEY to server secrets to load indexed holder counts and top balances. A separate Chainbase API key is required."}
                </p>
              </section>
              <section className="settings-card">
                <div className="section-title">
                  <Send size={20} />
                  <h2>Telegram alerts</h2>
                </div>
                <ol className="setup-steps">
                  <li>
                    Create a bot with{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                    >
                      @BotFather
                    </a>{" "}
                    and send your bot a message.
                  </li>
                  <li>
                    Add <code>TELEGRAM_BOT_TOKEN</code> and{" "}
                    <code>TELEGRAM_CHAT_ID</code> as server secrets.
                  </li>
                  <li>
                    In your Cloudflare account, enable the included five-minute
                    Cron Trigger. Hosted Sites needs a separate linked schedule.
                  </li>
                  <li>
                    Save a live alert rule, then send a test to verify delivery.
                  </li>
                </ol>
                <p className="card-description">
                  Checks up to 20 rules. Each token sends at most once per rule
                  per UTC hour. Failed deliveries retry. Demo tokens never send.
                </p>
                <div className="connection-list">
                  {(
                    [
                      { label: "GMGN key", value: status?.gmgn },
                      { label: "Chainbase key", value: status?.chainbase },
                      { label: "Telegram secrets", value: status?.telegram },
                      { label: "Alert database", value: status?.database },
                      { label: "Monitor endpoint secret", value: status?.cron },
                    ] as const
                  ).map((s) => (
                    <div key={s.label}>
                      <span>{s.label}</span>
                      <b>{s.value ? "Configured" : "Pending"}</b>
                    </div>
                  ))}
                </div>
                <button
                  className="button primary"
                  disabled={!status?.telegram || busy}
                  onClick={testTelegram}
                >
                  <Send size={15} />
                  Send test alert
                </button>
              </section>
              <section className="settings-card privacy-card">
                <ShieldCheck size={23} />
                <div>
                  <h2>Your personal workspace</h2>
                  <p>
                    Watchlist and presets stay in this browser. Live alert rules
                    are stored on the server. Export your browser settings
                    before changing devices.
                  </p>
                  <button
                    className="button subtle"
                    onClick={() => {
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            { version: 1, watchlist, presets },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "bsc-radar-settings.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export watchlist & presets
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer className="footer">
            <span>
              <Radar size={14} /> BSC Radar
            </span>
            <p>A personal discovery desk. Data can be delayed or incomplete.</p>
            <button onClick={() => chooseSection("settings")}>
              Connection settings
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        className="modal-content"
        aria-labelledby="modal-title"
        onCancel={() => setModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (modal === "filters") {
              try {
                changeFilters(parseFilters(filterDraft));
                setModal(null);
              } catch (e) {
                notify(e instanceof Error ? e.message : "Invalid filters");
              }
            } else if (modal === "preset") {
              const trimmed = name.trim();
              if (!trimmed) return;
              if (builtins.some((p) => p.name === trimmed)) {
                notify("Choose a name different from the built-in presets.");
                return;
              }
              const next = [
                ...presets.filter((p) => p.name !== trimmed),
                { name: trimmed, filters },
              ];
              setPresets(next);
              saveStored("presets", next);
              setPresetName(trimmed);
              setModal(null);
              notify("Filter preset saved.");
            } else saveRule();
          }}
        >
          <div className="modal-heading">
            <h2 id="modal-title">
              {modal === "filters"
                ? "Fine-tune your radar"
                : modal === "preset"
                  ? "Save this filter preset"
                  : "Create an alert rule"}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
          </div>
          {modal === "filters" ? (
            <>
              <p className="card-description">
                Zero means no limit. Missing values cannot pass an active
                numerical filter. Minimum change −100 and top 10 holdings 100
                disable those limits.
              </p>
              <div className="filter-grid">
                {(
                  [
                    { name: "minLiquidity", label: "Minimum liquidity ($)" },
                    {
                      name: "minVolume",
                      label: `Minimum ${volumeInterval} volume ($)`,
                    },
                    { name: "minMarketCap", label: "Minimum market cap ($)" },
                    { name: "maxMarketCap", label: "Maximum market cap ($)" },
                    { name: "maxAgeHours", label: "Maximum age (hours)" },
                    {
                      name: "minChange",
                      label: `Minimum ${volumeInterval} change (%)`,
                    },
                    { name: "maxTop10", label: "Maximum top 10 holdings (%)" },
                  ] as const
                ).map((f) => (
                  <Field
                    key={f.name}
                    label={f.label}
                    name={f.name}
                    filters={filterDraft}
                    setFilters={setFilterDraft}
                  />
                ))}
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={filterDraft.excludeFlagged}
                  onChange={(e) =>
                    setFilterDraft({
                      ...filterDraft,
                      excludeFlagged: e.target.checked,
                    })
                  }
                />
                <div>
                  Hide reported risk flags
                  <small>
                    Honeypot, wash trading, or reported rug ratio above 30%.
                  </small>
                </div>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={filterDraft.verifiedOnly}
                  onChange={(e) =>
                    setFilterDraft({
                      ...filterDraft,
                      verifiedOnly: e.target.checked,
                    })
                  }
                />
                <div>
                  Require complete reported checks
                  <small>
                    Verified contract, honeypot and wash flags known false, rug
                    ratio available.
                  </small>
                </div>
              </label>
            </>
          ) : (
            <>
              <p className="card-description">
                {modal === "preset"
                  ? "Presets are saved in your browser."
                  : source === "demo"
                    ? "Demo rule for this browser. Telegram is disabled for sample tokens."
                    : "Save these filters for page and Telegram alerts. Telegram credentials and a schedule must be configured."}
              </p>
              <label className="field">
                <span>{modal === "preset" ? "Preset name" : "Alert name"}</span>
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fresh BSC momentum"
                />
              </label>
              <div className="rule-preview">
                <span>
                  {view === "new" ? "New tokens" : "Trending"} ·{" "}
                  {volumeInterval}
                </span>
                <strong>{tokens.length} tokens currently match</strong>
                <small>
                  Liquidity ≥ {money(filters.minLiquidity)} · Volume ≥{" "}
                  {money(filters.minVolume)}
                </small>
              </div>
            </>
          )}
          <div className="modal-actions">
            {modal === "filters" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setFilterDraft(defaultFilters);
                }}
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              className="button subtle"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy
                ? "Saving…"
                : modal === "filters"
                  ? "Apply filters"
                  : modal === "preset"
                    ? "Save preset"
                    : "Save alert"}
            </button>
          </div>
        </form>
      </dialog>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
