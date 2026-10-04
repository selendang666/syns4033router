
import { getSettings } from "../../../lib/localDb.js";
import { isOidcConfigured } from "../../../lib/auth/oidc.js";
import { getDashboardAuthSession } from "../../../lib/auth/dashboardSession.js";

export async function GET(req, res) {
  try {
    const settings = await getSettings();
    const cookieStore = { get: (k) => ({ value: (req).cookies?.[k] }) };
    const session = await getDashboardAuthSession(cookieStore.get("syns4033_session")?.value);
    const requireLogin = settings.requireLogin !== false;
    const authMode = settings.authMode || "password";
    const oidcName = String(session?.oidcName || "").trim();
    const oidcEmail = String(session?.oidcEmail || "").trim();
    const displayName = oidcName || oidcEmail || (session?.oidc ? "OIDC user" : "Password user");
    const loginMethod = session?.oidc ? "OIDC" : "Password";
    const initialPasswordConfigured = !!process.env.INITIAL_PASSWORD;

    return res.json({
      requireLogin,
      authMode,
      oidcConfigured: isOidcConfigured(settings),
      oidcLoginLabel: (settings.oidcLoginLabel || "Sign in with OIDC").trim() || "Sign in with OIDC",
      hasPassword: !!settings.password,
      initialPasswordConfigured,
      passwordConfigured: !!settings.password || initialPasswordConfigured,
      displayName,
      loginMethod,
      oidcName: oidcName || null,
      oidcEmail: oidcEmail || null,
      oidcLogin: !!session?.oidc,
      isLoggedIn: !!session,
      // No role claim means a password/OIDC login, which is the router's own
      // operator. The sidebar uses this to hide admin entries for portal users.
      role: session?.role === "user" ? "user" : "admin",
      username: session?.username || null,
    });
  } catch {
    return res.json({
      requireLogin: true,
      authMode: "password",
      oidcConfigured: false,
      oidcLoginLabel: "Sign in with OIDC",
      hasPassword: false,
      initialPasswordConfigured: false,
      passwordConfigured: false,
      displayName: "Password user",
      loginMethod: "Password",
      oidcName: null,
      oidcEmail: null,
      oidcLogin: false,
      isLoggedIn: false,
    });
  }
}
