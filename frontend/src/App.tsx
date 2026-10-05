import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import ComingSoon from "./pages/coming-soon/page.jsx";
import Member from "./pages/member/page.jsx";
import MyKey from "./pages/my-key/page.jsx";
import { Suspense, lazy, useEffect, useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts";

// Lazy-loaded pages (code splitting — loads each page only when needed)
const Landing         = lazy(() => import("./pages/landing/page"));
const Login           = lazy(() => import("./pages/login/page"));
const Callback        = lazy(() => import("./pages/callback/page"));
const Dashboard       = lazy(() => import("./pages/page"));
const Providers       = lazy(() => import("./pages/providers/page"));
const ProviderDetail  = lazy(() => import("./pages/providers/[id]/page"));
const ProvidersNew    = lazy(() => import("./pages/providers/new/page"));
const Usage           = lazy(() => import("./pages/usage/page"));
const Quota           = lazy(() => import("./pages/quota/page"));
const ProxyPools      = lazy(() => import("./pages/proxy-pools/page"));
const Combos          = lazy(() => import("./pages/combos/page"));
const Endpoint        = lazy(() => import("./pages/endpoint/page"));
const Translator      = lazy(() => import("./pages/translator/page"));
const CliTools        = lazy(() => import("./pages/cli-tools/page"));
const CliToolDetail   = lazy(() => import("./pages/cli-tools/[toolId]/page"));
const Automation      = lazy(() => import("./pages/automation/page"));
const BasicChat       = lazy(() => import("./pages/basic-chat/page"));
const Mitm            = lazy(() => import("./pages/mitm/page"));
const Profile         = lazy(() => import("./pages/profile/page"));
const Docs            = lazy(() => import("./pages/docs/page"));
const Skills          = lazy(() => import("./pages/skills/page"));
const SystemPrompt    = lazy(() => import("./pages/system-prompt/page"));
const ConsoleLog      = lazy(() => import("./pages/console-log/page"));
const MediaProviders  = lazy(() => import("./pages/media-providers/web/page"));
const MediaProviderKind  = lazy(() => import("./pages/media-providers/[kind]/page"));
const MediaProviderKindId = lazy(() => import("./pages/media-providers/[kind]/[id]/page"));
const MediaProviderComboDetail = lazy(() => import("./pages/media-providers/combo/[id]/page"));
const WeavyPool          = lazy(() => import("./pages/providers/weavy/pool/page"));
const AmmailTutorial     = lazy(() => import("./pages/automation/ammail-tutorial/page"));

// Dashboard routes a portal account may not open. The API answers 404 on these
// paths, so letting the page mount only produces a half-rendered screen and a
// console full of failed fetches; the route has to refuse in the same place the
// backend does.
//
// Usage is deliberately absent: /api/usage/* is not admin-gated, and reading
// aggregate traffic is the point of the tier.
// The index route is not a summary page: pages/page.jsx renders
// EndpointPageClient, which fetches /api/keys and /api/settings. An empty
// path after the prefix is therefore an admin page too.
const ADMIN_PAGES = new Set([
  "",
  "endpoint", "providers", "providers/new", "combos",
  "api-health", "cloudflare-deploy", "anti-roseller", "paket-harga", "member",
  "proxy-pools", "model-rebranding", "system-prompt", "mitm", "cli-tools",
  "automation", "skills", "docs", "console-log", "profile",
]);

// Auth guard — session cookie must be present and, for admin pages, the role
// must be admin. Role comes from /api/auth/status; unknown means admin so the
// operator's own session is never locked out.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const hasSession = document.cookie.includes("syns4033_session") ||
                     localStorage.getItem("9r_authed") === "1";

  useEffect(() => {
    if (!hasSession) return;
    let alive = true;
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => alive && setRole(d?.role === "user" ? "user" : "admin"))
      .catch(() => alive && setRole("admin"));
    return () => { alive = false; };
  }, [hasSession]);

  if (!hasSession) return <Navigate to="/login" replace />;
  if (role === null) return <LoadingFallback />;
  if (role === "user") {
    const page = window.location.pathname.replace(/^\/dashboard\/?/, "").split("/")[0];
    if (ADMIN_PAGES.has(page)) return <NotFound />;
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-text-main">Not found</h1>
      <p className="text-text-muted mt-2">Halaman ini tidak tersedia.</p>
      <Link to="/dashboard/usage" className="mt-6 inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary">
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        Kembali
      </Link>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <span>Loading...</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/"       element={<Navigate to="/login" replace />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/callback" element={<Callback />} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="providers"       element={<Providers />} />
            <Route path="providers/new"   element={<ProvidersNew />} />
            <Route path="providers/weavy/pool" element={<WeavyPool />} />
            <Route path="providers/:id"   element={<ProviderDetail />} />
            <Route path="usage"           element={<Usage />} />
            <Route path="quota"           element={<Quota />} />
            {/* Pricing settings page omitted in v2 currently */}
            <Route path="proxy-pools"     element={<ProxyPools />} />
            <Route path="combos"          element={<Combos />} />
            <Route path="endpoint"        element={<Endpoint />} />
            <Route path="translator"      element={<Translator />} />
            <Route path="cli-tools"       element={<CliTools />} />
            <Route path="cli-tools/:toolId" element={<CliToolDetail />} />
            <Route path="automation"      element={<Automation />} />
            <Route path="automation/ammail-tutorial" element={<AmmailTutorial />} />
            <Route path="basic-chat"      element={<BasicChat />} />
            <Route path="mitm"            element={<Mitm />} />
            <Route path="profile"         element={<Profile />} />
            <Route path="docs"            element={<Docs />} />
            <Route path="skills"          element={<Skills />} />
            <Route path="system-prompt"   element={<SystemPrompt />} />
            <Route path="console-log"     element={<ConsoleLog />} />
            {/* Bare /media-providers had no route at all and fell through to the
            catch-all, which bounced a signed-in operator back to /login. */}
        <Route path="media-providers" element={<Navigate to="/dashboard/media-providers/web" replace />} />
        <Route path="media-providers/web" element={<MediaProviders />} />
            <Route path="media-providers/:kind" element={<MediaProviderKind />} />
            <Route path="media-providers/:kind/:id" element={<MediaProviderKindId />} />
            <Route path="media-providers/combo/:id" element={<MediaProviderComboDetail />} />
          <Route path="my-key" element={<MyKey />} />
          <Route path="member" element={<Member />} />
          </Route>

          {/* Fallback */}
              <Route path="pemakaian" element={<ComingSoon />} />
          <Route path="live-traffic" element={<ComingSoon />} />
          <Route path="api-health" element={<ComingSoon />} />
          <Route path="cloudflare-deploy" element={<ComingSoon />} />
          <Route path="anti-roseller" element={<ComingSoon />} />
          <Route path="paket-harga" element={<ComingSoon />} />
          <Route path="token-saver" element={<ComingSoon />} />
          <Route path="model-rebranding" element={<ComingSoon />} />
      <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
