
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import Card from "./Card";
import Select from "./Select";
import Badge from "./Badge";

const NONE_PROXY_POOL_VALUE = "__none__";

export default function NoAuthProxyCard({ providerId }) {
  const [proxyPools, setProxyPools] = useState([]);
  const [proxyPoolId, setProxyPoolId] = useState(NONE_PROXY_POOL_VALUE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }).then((r) => r.ok ? r.json() : { proxyPools: [] }),
      fetch("/api/settings", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}),
    ]).then(([poolData, settingsData]) => {
      if (cancelled) return;
      setProxyPools(poolData.proxyPools || []);
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setProxyPoolId(override.proxyPoolId || NONE_PROXY_POOL_VALUE);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [providerId]);

  const handleChange = async (newValue) => {
    const previous = proxyPoolId;
    setProxyPoolId(newValue);
    setSaving(true);
    try {
      const readRes = await fetch("/api/settings", { cache: "no-store" });
      const data = readRes.ok ? await readRes.json() : {};
      const current = data.providerStrategies || {};
      const override = { ...(current[providerId] || {}) };
      if (newValue === NONE_PROXY_POOL_VALUE) delete override.proxyPoolId;
      else override.proxyPoolId = newValue;
      const updated = { ...current };
      if (Object.keys(override).length === 0) delete updated[providerId];
      else updated[providerId] = override;
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
      // fetch only rejects on network failure, so an expired session or a 500
      // resolved fine and the row flashed "saved" while the server kept the old
      // proxy pool. fetchProxyPools on the next visit is what revealed it.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Could not save the proxy pool choice");
        setProxyPoolId(previous);
        return;
      }
      setSaveError(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      console.log("Save proxyPoolId error:", e);
      setSaveError(e.message || "Network error");
      setProxyPoolId(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 text-green-500">
          <span className="material-symbols-outlined text-[20px]">lock_open</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">No authentication required</p>
          <p className="text-xs text-text-muted">No credential to configure. Whether the upstream answers from this host is a separate question — some of these services refuse datacenter addresses. Route through a proxy pool if a request fails.</p>
        </div>
        {savedFlash && <Badge variant="success" size="sm">Saved</Badge>}
      </div>
      <Select
        label="Proxy Pool"
        value={proxyPoolId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        options={[
          { value: NONE_PROXY_POOL_VALUE, label: "None (direct)" },
          ...proxyPools.map((pool) => ({ value: pool.id, label: pool.name })),
        ]}
      />
    </Card>
  );
}

NoAuthProxyCard.propTypes = {
  providerId: PropTypes.string.isRequired,
};
        {saveError && (
          <p className="text-xs text-red-500 break-words">{saveError}</p>
        )}
