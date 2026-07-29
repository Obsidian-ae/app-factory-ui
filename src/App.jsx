import { Fragment, useEffect, useRef, useState } from "react";
import { Factory, Rocket, Ship, RefreshCw, ExternalLink, Trash2, Play, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "./api.js";

// ---- shared primitives (kept minimal on purpose — this is an internal tool, not a client-facing app) ----
const Btn = ({ kind, small, disabled, onClick, children, title }) => (
  <button
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={
      "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors " +
      (small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm") + " " +
      (disabled ? "opacity-40 cursor-not-allowed border border-stone-800 text-stone-500" :
        kind === "danger" ? "bg-red-600 text-white hover:bg-red-500" :
        kind === "ghost" ? "border border-stone-800 text-stone-100 hover:bg-stone-800" :
        "bg-sand-500 text-stone-950 hover:bg-sand-400")
    }
  >{children}</button>
);
const Field = ({ label, children, hint }) => (
  <label className="block mb-3">
    <div className="mb-1 text-xs font-medium text-stone-400">{label}</div>
    {children}
    {hint && <div className="mt-1 text-[11px] text-stone-500">{hint}</div>}
  </label>
);
const inpCls = "w-full rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none focus:border-sand-500";
const Inp = (props) => <input {...props} className={inpCls + " " + (props.className || "")} />;
const Sel = (props) => <select {...props} className={inpCls + " " + (props.className || "")} />;
const Badge = ({ tone, children }) => (
  <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " + ({
    ok: "bg-emerald-500/15 text-emerald-400",
    warn: "bg-amber-500/15 text-amber-400",
    bad: "bg-red-500/15 text-red-400",
    neutral: "bg-stone-800 text-stone-400",
  }[tone] || "bg-stone-800 text-stone-400")}>{children}</span>
);
const STAGE_STATUS_TONE = { succeeded: "ok", running: "warn", failed: "bad", pending: "neutral", skipped: "neutral" };

// ---- Intake form: questionnaire -> app-config compiler, with a live brand preview ----
function IntakeForm({ meta, onBuilt }) {
  const [f, setF] = useState({
    slug: "", business_name: "", contact_name: "", contact_email: "",
    locale: "en", currency: "AED", country: "AE",
    color_primary: "#c69a58", color_bg_dark: "#0c0a09", theme_default: "dark", logo_file: "logo.png",
    vat_enabled: true, vat_rate: 5, product_categories: "General", customer_types: "Retail, Wholesale",
    preset: "services", modules: null,
    admin_name: "", admin_email: "", staff_seats: 2,
    tier: "standard", monthly_price_aed: 499, ai_spend_cap: 15,
    logo_data_url: null,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  // Converts whatever image format was uploaded to a PNG data URL (matches
  // logo_file's fixed "logo.png") and caps it at 512px on the long edge —
  // keeps the payload small and avoids shipping an oversized image into
  // the client's app repo. Canvas re-encoding also guards against a
  // mismatched extension (e.g. a .jpg renamed to .png).
  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Logo must be an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Logo file is too large (max 5MB)."); return; }
    setError("");
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx2d = canvas.getContext("2d");
        ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
        setF((prev) => ({ ...prev, logo_data_url: canvas.toDataURL("image/png") }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const preset = meta.presets[f.preset] || {};
  const modules = f.modules || preset;
  const toggleModule = (name) => setF({ ...f, modules: { ...modules, [name]: !modules[name] } });
  const changePreset = (e) => setF({ ...f, preset: e.target.value, modules: null });

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      if (!f.slug.match(/^[a-z0-9-]+$/)) throw new Error("Slug must be lowercase letters, numbers, and hyphens only.");
      const config = {
        config_version: 1,
        client: {
          slug: f.slug, business_name: f.business_name, contact_name: f.contact_name,
          contact_email: f.contact_email, locale: f.locale, currency: f.currency, country: f.country,
        },
        branding: { logo_file: f.logo_file, color_primary: f.color_primary, color_bg_dark: f.color_bg_dark, theme_default: f.theme_default },
        business: {
          vat_enabled: f.vat_enabled, vat_rate: Number(f.vat_rate),
          product_categories: f.product_categories.split(",").map((s) => s.trim()).filter(Boolean),
          customer_types: f.customer_types.split(",").map((s) => s.trim()).filter(Boolean),
        },
        preset: f.preset,
        modules,
        users: { admin_name: f.admin_name, admin_email: f.admin_email, staff_seats: Number(f.staff_seats) },
        package: { tier: f.tier, monthly_price_aed: Number(f.monthly_price_aed), ai_monthly_spend_cap_usd: Number(f.ai_spend_cap) },
        template_version: "1.0.0",
      };
      const { buildId } = await api("/api/builds", { method: "POST", body: { ...config, logo_data_url: f.logo_data_url } });
      onBuilt(buildId);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h2 className="text-sm font-semibold text-stone-200 mb-3">Client details</h2>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Business name"><Inp value={f.business_name} onChange={set("business_name")} placeholder="Falcon Ridge Trading" /></Field>
          <Field label="Slug" hint="Used in URLs and repo names."><Inp value={f.slug} onChange={set("slug")} placeholder="falcon-ridge-trading" /></Field>
          <Field label="Contact name"><Inp value={f.contact_name} onChange={set("contact_name")} /></Field>
          <Field label="Contact email"><Inp type="email" value={f.contact_email} onChange={set("contact_email")} /></Field>
          <Field label="Locale"><Inp value={f.locale} onChange={set("locale")} /></Field>
          <Field label="Currency"><Inp value={f.currency} onChange={set("currency")} maxLength={3} /></Field>
          <Field label="Country"><Inp value={f.country} onChange={set("country")} /></Field>
          <Field label="Theme"><Sel value={f.theme_default} onChange={set("theme_default")}><option value="dark">Dark</option><option value="light">Light</option></Sel></Field>
        </div>

        <h2 className="text-sm font-semibold text-stone-200 mb-3 mt-2">Branding</h2>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Primary color"><input type="color" value={f.color_primary} onChange={set("color_primary")} className="h-9 w-full rounded-lg border border-stone-800 bg-stone-900" /></Field>
          <Field label="Dark background color"><input type="color" value={f.color_bg_dark} onChange={set("color_bg_dark")} className="h-9 w-full rounded-lg border border-stone-800 bg-stone-900" /></Field>
        </div>
        <Field label="Logo" hint="PNG/JPG/SVG, any size — resized automatically. Falls back to a plain placeholder if skipped.">
          <div className="flex items-center gap-3">
            {f.logo_data_url && <img src={f.logo_data_url} alt="logo preview" className="h-9 w-9 rounded object-contain bg-stone-900 border border-stone-800" />}
            <input type="file" accept="image/*" onChange={handleLogoFile} className="text-xs text-stone-400 file:mr-3 file:rounded-lg file:border file:border-stone-800 file:bg-stone-900 file:px-3 file:py-1.5 file:text-xs file:text-stone-100 file:cursor-pointer" />
          </div>
        </Field>

        <h2 className="text-sm font-semibold text-stone-200 mb-3 mt-2">Business rules</h2>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="VAT enabled"><Sel value={f.vat_enabled ? "yes" : "no"} onChange={(e) => setF({ ...f, vat_enabled: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No</option></Sel></Field>
          <Field label="VAT rate (%)"><Inp type="number" value={f.vat_rate} onChange={set("vat_rate")} /></Field>
          <Field label="Product categories" hint="comma-separated"><Inp value={f.product_categories} onChange={set("product_categories")} /></Field>
          <Field label="Customer types" hint="comma-separated"><Inp value={f.customer_types} onChange={set("customer_types")} /></Field>
        </div>

        <h2 className="text-sm font-semibold text-stone-200 mb-3 mt-2">Package & preset</h2>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Preset"><Sel value={f.preset} onChange={changePreset}>{Object.keys(meta.presets).map((p) => <option key={p} value={p}>{p}</option>)}</Sel></Field>
          <Field label="Package tier"><Inp value={f.tier} onChange={set("tier")} /></Field>
          <Field label="Monthly price (AED)" hint="What this client is actually billed via Stripe checkout."><Inp type="number" min="0" step="1" value={f.monthly_price_aed} onChange={set("monthly_price_aed")} /></Field>
          <Field label="AI spend cap (USD/month)"><Inp type="number" min="0" step="1" value={f.ai_spend_cap} onChange={set("ai_spend_cap")} /></Field>
        </div>
        <Field label="Modules" hint="Adjust individual modules away from the preset default if needed.">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.keys(preset).map((m) => (
              <label key={m} className="flex items-center gap-2 text-xs text-stone-300">
                <input type="checkbox" checked={!!modules[m]} onChange={() => toggleModule(m)} /> {m.replace(/_/g, " ")}
              </label>
            ))}
          </div>
        </Field>

        <h2 className="text-sm font-semibold text-stone-200 mb-3 mt-2">Admin user</h2>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Admin name"><Inp value={f.admin_name} onChange={set("admin_name")} /></Field>
          <Field label="Admin email"><Inp type="email" value={f.admin_email} onChange={set("admin_email")} /></Field>
        </div>

        {error && <div className="mb-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300 whitespace-pre-wrap">{error}</div>}
        <Btn onClick={submit} disabled={busy || !f.slug || !f.business_name || !f.admin_email}>{busy ? "Starting build…" : <><Rocket size={14} />Build this app</>}</Btn>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-stone-200 mb-3">Live preview</h2>
        <div className="rounded-2xl border border-stone-800 overflow-hidden sticky top-4" style={{ backgroundColor: f.color_bg_dark }}>
          <div className="p-5 flex items-center gap-2 border-b" style={{ borderColor: f.color_primary + "33" }}>
            {f.logo_data_url
              ? <img src={f.logo_data_url} alt="" className="h-6 w-6 rounded object-contain" />
              : <div className="h-6 w-6 rounded" style={{ backgroundColor: f.color_primary }} />}
            <div className="font-semibold text-sm" style={{ color: "#f5f5f4" }}>{f.business_name || "Your Business"}</div>
          </div>
          <div className="p-5 space-y-3">
            <div className="text-xs" style={{ color: "#a8a29e" }}>Sign in</div>
            <div className="h-9 rounded-lg border" style={{ borderColor: f.color_primary + "55" }} />
            <div className="h-9 rounded-lg border" style={{ borderColor: f.color_primary + "55" }} />
            <button className="h-9 w-full rounded-lg text-sm font-medium" style={{ backgroundColor: f.color_primary, color: f.color_bg_dark }}>Sign in</button>
          </div>
          <div className="px-5 pb-5 flex flex-wrap gap-1.5">
            {Object.entries(modules).filter(([, on]) => on).map(([m]) => (
              <span key={m} className="rounded-full px-2 py-1 text-[10px]" style={{ backgroundColor: f.color_primary + "22", color: f.color_primary }}>{m.replace(/_/g, " ")}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Build screen: live pipeline status, logs, retry ----
function BuildView({ buildId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState({});
  const [resuming, setResuming] = useState(false);
  const timer = useRef(null);

  const load = async () => {
    try { setData(await api("/api/builds/" + buildId)); setError(""); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => {
    load();
    timer.current = setInterval(load, 2000);
    return () => clearInterval(timer.current);
  }, [buildId]);

  const retry = async () => {
    setResuming(true);
    try { await api("/api/builds/" + buildId + "/resume", { method: "POST" }); await load(); }
    catch (e) { setError(e.message); }
    setResuming(false);
  };

  if (error) return <div className="text-sm text-red-400">{error}</div>;
  if (!data) return <div className="text-sm text-stone-500">Loading…</div>;

  const { build, client, steps } = data;
  return (
    <div>
      <button onClick={onBack} className="mb-3 text-xs text-stone-400 hover:text-stone-200">&larr; Back to fleet</button>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-stone-100">{client.business_name}</h2>
        <Badge tone={build.status === "succeeded" ? "ok" : build.status === "failed" ? "bad" : "warn"}>{build.status}</Badge>
        {build.status === "failed" && <Btn small kind="ghost" onClick={retry} disabled={resuming}><Play size={12} />{resuming ? "Retrying…" : "Retry"}</Btn>}
      </div>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <div key={s.id} className="rounded-lg border border-stone-800 overflow-hidden">
            <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-900" onClick={() => setOpen({ ...open, [s.id]: !open[s.id] })}>
              {open[s.id] ? <ChevronDown size={14} className="text-stone-500" /> : <ChevronRight size={14} className="text-stone-500" />}
              <span className="text-xs text-stone-500 w-5">{String(s.sequence).padStart(2, "0")}</span>
              <span className="text-sm text-stone-200 flex-1">{s.stage_name}</span>
              {s.attempts > 0 && <span className="text-[11px] text-stone-500">attempts {s.attempts}/{s.max_attempts}</span>}
              <Badge tone={STAGE_STATUS_TONE[s.status]}>{s.status}</Badge>
            </button>
            {open[s.id] && (
              <div className="border-t border-stone-800 bg-stone-950 px-3 py-2 text-[11px] font-mono text-stone-400 space-y-0.5 max-h-64 overflow-y-auto">
                {s.error && <div className="text-red-400">error: {s.error}</div>}
                {(s.logs || []).map((l, i) => <div key={i}><span className="text-stone-600">{l.ts}</span>  {l.message}</div>)}
                {!s.logs?.length && !s.error && <div className="text-stone-600">no logs yet</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Rollout panel: fleet-wide template updates (Factory Plan Phase 5) ----
// One version label, one click, applies to every client below that
// version — canary -> 25% -> all, halting on any failure. This is
// fleet-wide by nature, unlike the other actions in the table below which
// are all per-client, so it gets its own control rather than a per-row
// button.
function RolloutPanel() {
  const [versionLabel, setVersionLabel] = useState("");
  const [rolloutId, setRolloutId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const start = async () => {
    setError(""); setBusy(true);
    try {
      const { rolloutId: id } = await api("/api/rollouts", { method: "POST", body: { version_label: versionLabel } });
      setRolloutId(id);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  useEffect(() => {
    if (!rolloutId) return;
    const poll = () => api("/api/rollouts/" + rolloutId).then(setStatus).catch((e) => setError(e.message));
    poll();
    timer.current = setInterval(poll, 3000);
    return () => clearInterval(timer.current);
  }, [rolloutId]);

  const done = status?.rollout.status === "complete" || status?.rollout.status === "failed";

  return (
    <div className="mb-4 rounded-xl border border-stone-800 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Ship size={14} className="text-sand-500" />
        <div className="text-sm font-semibold text-stone-200">Roll out a template update</div>
      </div>
      {!rolloutId ? (
        <div className="flex items-center gap-2">
          <Inp value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="1.1.0" className="w-40" />
          <Btn small disabled={!versionLabel || busy} onClick={start}>{busy ? "Starting…" : "Roll out"}</Btn>
          <span className="text-xs text-stone-500">Applies to every client not already on this version. Canary first, halts on any failure.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <Badge tone={status?.rollout.status === "complete" ? "ok" : status?.rollout.status === "failed" ? "bad" : "warn"}>
              {status?.rollout.status || "starting"}
            </Badge>
            <span className="text-stone-500">target version {versionLabel}</span>
            {done && <button className="text-sand-500 hover:underline" onClick={() => { setRolloutId(null); setStatus(null); setVersionLabel(""); }}>done — start another</button>}
          </div>
          {status?.clients.map((c) => (
            <div key={c.slug} className="flex items-center gap-2 text-xs">
              <Badge tone={c.stage === "verified" ? "ok" : c.stage === "failed" ? "bad" : "warn"}>{c.stage}</Badge>
              <span className="text-stone-300">{c.business_name}</span>
              {c.error && <span className="text-red-400">{c.error}</span>}
            </div>
          ))}
        </div>
      )}
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
    </div>
  );
}

// ---- Fleet panel ----
function FleetPanel({ meta, onOpenBuild }) {
  const [clients, setClients] = useState(null);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null); // slug currently showing the destroy-confirmation row
  const [confirmText, setConfirmText] = useState("");
  const [handover, setHandover] = useState({}); // slug -> null (loading) | { error } | { frontend_url, admin_email, admin_password, checkout_url }

  const load = () => api("/api/clients").then(setClients);
  useEffect(() => { load(); }, []);

  const withBusy = (slug, fn) => async () => {
    setError(""); setBusy((b) => ({ ...b, [slug]: true }));
    try { await fn(); await load(); } catch (e) { setError(e.message); }
    setBusy((b) => ({ ...b, [slug]: false }));
  };

  const pollHealth = (slug) => withBusy(slug, () => api("/api/clients/" + slug + "/poll-health", { method: "POST" }));
  const toggleSub = (slug, current) => withBusy(slug, () => api("/api/clients/" + slug + "/subscription", {
    method: "PATCH", body: { status: current === "suspended" ? "active" : "suspended" },
  }));
  const confirmDestroy = (slug) => async () => {
    if (confirmText !== slug) return;
    setConfirming(null); setConfirmText("");
    await withBusy(slug, () => api("/api/clients/" + slug + "/destroy", { method: "POST", body: { confirm: slug } }))();
  };
  const toggleHandover = (slug) => async () => {
    if (handover[slug] !== undefined) { setHandover((h) => { const n = { ...h }; delete n[slug]; return n; }); return; }
    setHandover((h) => ({ ...h, [slug]: null }));
    try {
      const data = await api("/api/clients/" + slug + "/handover-info");
      setHandover((h) => ({ ...h, [slug]: data }));
    } catch (e) {
      setHandover((h) => ({ ...h, [slug]: { error: e.message } }));
    }
  };

  if (!clients) return <div className="text-sm text-stone-500">Loading…</div>;

  return (
    <div>
      <RolloutPanel />
      {!clients.length && <div className="text-sm text-stone-500">No clients yet — build one from the "New client" tab.</div>}
      {error && <div className="mb-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
      {!!clients.length && <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-500 border-b border-stone-800">
              <th className="py-2 pr-3 font-medium">Client</th>
              <th className="py-2 pr-3 font-medium">Template</th>
              <th className="py-2 pr-3 font-medium">Latest build</th>
              <th className="py-2 pr-3 font-medium">Health</th>
              <th className="py-2 pr-3 font-medium">Subscription</th>
              <th className="py-2 pr-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <Fragment key={c.id}>
                <tr key={c.id} className="border-b border-stone-900">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-stone-100">{c.business_name}</div>
                    <div className="text-[11px] text-stone-500">{c.slug}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-stone-400">{c.template_version || "—"}</td>
                  <td className="py-2.5 pr-3">
                    {c.latest_build_id ? (
                      <button className="text-xs text-sand-500 hover:underline" onClick={() => onOpenBuild(c.latest_build_id)}>
                        <Badge tone={c.latest_build_status === "succeeded" ? "ok" : c.latest_build_status === "failed" ? "bad" : "warn"}>{c.latest_build_status}</Badge>
                      </button>
                    ) : "—"}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={c.health_status === "ok" ? "ok" : c.health_status === "down" ? "bad" : "neutral"}>{c.health_status || "unknown"}</Badge>
                      <button title="Poll health now" disabled={busy[c.slug]} onClick={pollHealth(c.slug)} className="text-stone-500 hover:text-stone-200"><RefreshCw size={13} /></button>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={c.subscription_status === "active" ? "ok" : c.subscription_status === "suspended" ? "bad" : "neutral"}>{c.subscription_status || "unknown"}</Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <a href={meta.agencyDomain ? `https://${c.slug}.${meta.agencyDomain}` : "#"} target="_blank" rel="noreferrer" title="Open app">
                        <Btn small kind="ghost"><ExternalLink size={12} /></Btn>
                      </a>
                      <Btn small kind="ghost" disabled={busy[c.slug]} onClick={toggleSub(c.slug, c.subscription_status)}>
                        {c.subscription_status === "suspended" ? "Resume" : "Suspend"}
                      </Btn>
                      <Btn small kind="ghost" onClick={toggleHandover(c.slug)}>Handover</Btn>
                      <Btn small kind="danger" disabled={busy[c.slug]} onClick={() => { setConfirming(c.slug); setConfirmText(""); }}><Trash2 size={12} /></Btn>
                    </div>
                  </td>
                </tr>
                {handover[c.slug] !== undefined && (
                  <tr className="border-b border-stone-900 bg-stone-900/40">
                    <td colSpan={6} className="py-2.5 px-3">
                      {handover[c.slug] === null ? (
                        <div className="text-xs text-stone-500">Loading…</div>
                      ) : handover[c.slug].error ? (
                        <div className="text-xs text-red-300">{handover[c.slug].error}</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                          <div><span className="text-stone-500">App URL: </span><span className="text-stone-200 select-all">{handover[c.slug].frontend_url}</span></div>
                          <div><span className="text-stone-500">Admin email: </span><span className="text-stone-200 select-all">{handover[c.slug].admin_email || "—"}</span></div>
                          <div><span className="text-stone-500">Admin password: </span><span className="text-stone-200 select-all">{handover[c.slug].admin_password}</span></div>
                          <div><span className="text-stone-500">Payment link: </span><span className="text-stone-200 select-all break-all">{handover[c.slug].checkout_url}</span></div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {confirming === c.slug && (
                  <tr className="border-b border-stone-900 bg-red-950/20">
                    <td colSpan={6} className="py-2.5 px-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-300">Type <strong>{c.slug}</strong> to permanently destroy every cloud resource for this client:</span>
                        <Inp autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-56 py-1" />
                        <Btn small kind="danger" disabled={confirmText !== c.slug || busy[c.slug]} onClick={confirmDestroy(c.slug)}>Destroy</Btn>
                        <Btn small kind="ghost" onClick={() => setConfirming(null)}>Cancel</Btn>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState("fleet");
  const [buildId, setBuildId] = useState(null);

  useEffect(() => { api("/api/meta").then(setMeta).catch((e) => setMeta({ error: e.message })); }, []);

  if (!meta) return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-stone-500 text-sm">Loading…</div>;
  if (meta.error) return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-red-400 text-sm">Can't reach the factory API: {meta.error}</div>;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 px-6 py-3 flex items-center gap-3">
        <Factory size={18} className="text-sand-500" />
        <div className="font-semibold">App Factory</div>
        <nav className="ml-6 flex gap-1">
          {[["fleet", "Fleet"], ["intake", "New client"]].map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setBuildId(null); }}
              className={"px-3 py-1.5 rounded-lg text-sm " + (tab === k && !buildId ? "bg-stone-800 text-stone-100" : "text-stone-400 hover:text-stone-200")}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        {buildId ? (
          <BuildView buildId={buildId} onBack={() => { setBuildId(null); setTab("fleet"); }} />
        ) : tab === "intake" ? (
          <IntakeForm meta={meta} onBuilt={setBuildId} />
        ) : (
          <FleetPanel meta={meta} onOpenBuild={setBuildId} />
        )}
      </main>
    </div>
  );
}
