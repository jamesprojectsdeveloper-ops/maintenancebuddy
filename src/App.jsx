import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import Welcome from "./screens/Welcome";
import AssetSelect from "./screens/AssetSelect";
import VehicleOnboarding from "./screens/VehicleOnboarding";
import Generating from "./screens/Generating";
import HomeOnboarding from "./screens/HomeOnboarding";
import HomeGenerating from "./screens/HomeGenerating";
import Dashboard from "./screens/Dashboard";
import HomeDashboard from "./screens/HomeDashboard";
import CombinedDashboard from "./screens/CombinedDashboard";
import "./App.css";

const bodyFont = { fontFamily: "'DM Sans', system-ui, sans-serif" };

export default function App() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState("loading");

  const [allVehicles, setAllVehicles] = useState([]);
  const [allHomes, setAllHomes] = useState([]);

  const [vehicleTasksMap, setVehicleTasksMap] = useState({});
  const [homeTasksMap, setHomeTasksMap] = useState({});

  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [activeHomeId, setActiveHomeId] = useState(null);

  const [pendingVehicle, setPendingVehicle] = useState(null);
  const [pendingHome, setPendingHome] = useState(null);

  const [profile, setProfile] = useState(null);

  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserData(session);
      } else {
        setScreen("welcome");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setScreen("welcome");
        setAllVehicles([]);
        setAllHomes([]);
        setVehicleTasksMap({});
        setHomeTasksMap({});
        setActiveVehicleId(null);
        setActiveHomeId(null);
        setPendingInvites([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-fetch vehicle mileage (and home data) when the tab regains focus,
  // so the owner sees changes made by a shared user without needing a full reload.
  const sessionRef = useRef(null);
  sessionRef.current = session;

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      if (!sessionRef.current) return;

      try {
        const { data: freshVehicles } = await supabase
          .from("vehicles")
          .select("id, current_mileage, mileage_updated_at");
        if (freshVehicles?.length) {
          const map = Object.fromEntries(
            freshVehicles.map(v => [v.id, v.current_mileage])
          );
          setAllVehicles(prev =>
            prev.map(v =>
              map[v.id] !== undefined ? { ...v, current_mileage: map[v.id] } : v
            )
          );
        }
      } catch { /* ignore */ }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const dedupeByName = (tasks) => {
    const seen = new Set();
    return (tasks || []).filter(t => {
      const key = t.name?.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const loadTasksForVehicle = async (vehicleId) => {
    const { data } = await supabase
      .from("maintenance_tasks")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    const tasks = dedupeByName(data);
    setVehicleTasksMap(prev => ({ ...prev, [vehicleId]: tasks }));
    return tasks;
  };

  const loadTasksForHome = async (homeId) => {
    const { data } = await supabase
      .from("home_maintenance_tasks")
      .select("*")
      .eq("home_id", homeId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    const tasks = dedupeByName(data);
    setHomeTasksMap(prev => ({ ...prev, [homeId]: tasks }));
    return tasks;
  };

  const loadUserData = async (sess) => {
    let vehicles = [], homes = [], prof = null;

    // Step 1: Claim any pending invites addressed to this user's email
    try {
      await supabase
        .from("asset_shares")
        .update({ shared_with_user_id: sess.user.id })
        .eq("invite_email", sess.user.email.toLowerCase())
        .eq("status", "pending")
        .is("shared_with_user_id", null);
    } catch { /* ignore — table may not exist yet */ }

    // Step 2: Load own assets + profile
    try {
      const [vehiclesRes, homesRes, profRes] = await Promise.all([
        supabase.from("vehicles").select("*").eq("user_id", sess.user.id).order("created_at", { ascending: false }),
        supabase.from("homes").select("*").eq("user_id", sess.user.id).order("created_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("id", sess.user.id).maybeSingle(),
      ]);
      vehicles = vehiclesRes.data || [];
      homes    = homesRes.data   || [];
      prof     = profRes.data    || null;

      // Auto-populate profile name from auth metadata if not already set.
      // This ensures the owner's name is always available for shared-asset lookups.
      const authName = sess.user.user_metadata?.full_name
        || sess.user.user_metadata?.name
        || null;
      if (authName && !prof?.full_name) {
        const { data: upserted } = await supabase
          .from("profiles")
          .upsert({ id: sess.user.id, full_name: authName }, { onConflict: "id" })
          .select().maybeSingle();
        if (upserted) prof = upserted;
      }

      // Backfill owner_name on any existing share records this user created
      // that are missing the name (created before this field was added).
      const displayName = prof?.full_name?.split(" ")[0]
        || authName?.split(" ")[0]
        || null;
      if (displayName) {
        supabase
          .from("asset_shares")
          .update({ owner_name: displayName })
          .eq("owner_user_id", sess.user.id)
          .is("owner_name", null)
          .then(() => {});
      }
    } catch { /* partial failure */ }

    // Step 3: Load accepted shared assets
    try {
      const { data: acceptedShares } = await supabase
        .from("asset_shares")
        .select("*")
        .eq("shared_with_user_id", sess.user.id)
        .eq("status", "accepted");

      if (acceptedShares?.length) {
        const svIds = acceptedShares.filter(s => s.asset_type === "vehicle").map(s => s.asset_id);
        const shIds = acceptedShares.filter(s => s.asset_type === "home").map(s => s.asset_id);
        const ownerIds = [...new Set(acceptedShares.map(s => s.owner_user_id))];

        const [svRes, shRes, ownRes] = await Promise.all([
          svIds.length ? supabase.from("vehicles").select("*").in("id", svIds) : { data: [] },
          shIds.length ? supabase.from("homes").select("*").in("id", shIds) : { data: [] },
          supabase.from("profiles").select("id, full_name").in("id", ownerIds),
        ]);

        const ownerMap = {};
        (ownRes.data || []).forEach(p => {
          if (p.full_name) ownerMap[p.id] = p.full_name.split(" ")[0];
        });
        const shareOwnerMap = {};
        acceptedShares.forEach(s => {
          shareOwnerMap[s.asset_id] =
            ownerMap[s.owner_user_id]
            || s.owner_name
            || "Someone";
        });

        vehicles = [
          ...vehicles,
          ...(svRes.data || []).map(v => ({ ...v, _sharedByName: shareOwnerMap[v.id] })),
        ];
        homes = [
          ...homes,
          ...(shRes.data || []).map(h => ({ ...h, _sharedByName: shareOwnerMap[h.id] })),
        ];
      }
    } catch { /* shared asset load failed — continue */ }

    // Step 4: Load pending invites for the accept/decline banner
    try {
      const { data: pendingShares } = await supabase
        .from("asset_shares")
        .select("*")
        .eq("shared_with_user_id", sess.user.id)
        .eq("status", "pending");

      if (pendingShares?.length) {
        const pvIds = pendingShares.filter(s => s.asset_type === "vehicle").map(s => s.asset_id);
        const phIds = pendingShares.filter(s => s.asset_type === "home").map(s => s.asset_id);
        const ownerIds = [...new Set(pendingShares.map(s => s.owner_user_id))];

        const [pvRes, phRes, ownRes] = await Promise.all([
          pvIds.length ? supabase.from("vehicles").select("id, nickname, year, make, model").in("id", pvIds) : { data: [] },
          phIds.length ? supabase.from("homes").select("id, nickname, home_type").in("id", phIds) : { data: [] },
          supabase.from("profiles").select("id, full_name").in("id", ownerIds),
        ]);

        const assetNameMap = {};
        (pvRes.data || []).forEach(v => {
          assetNameMap[v.id] = v.nickname || `${v.year} ${v.make} ${v.model}`;
        });
        (phRes.data || []).forEach(h => {
          assetNameMap[h.id] = h.nickname || (h.home_type === "condo" ? "Condo" : h.home_type === "townhouse" ? "Townhouse" : "Home");
        });
        const ownerMap = {};
        (ownRes.data || []).forEach(p => {
          ownerMap[p.id] = p.full_name?.split(" ")[0] || "Someone";
        });

        setPendingInvites(pendingShares.map(s => ({
          shareId: s.id,
          assetType: s.asset_type,
          assetId: s.asset_id,
          assetName: assetNameMap[s.asset_id] || "an asset",
          ownerName: ownerMap[s.owner_user_id] || "Someone",
        })));
      } else {
        setPendingInvites([]);
      }
    } catch { /* ignore */ }

    setProfile(prof);
    setAllVehicles(vehicles);
    setAllHomes(homes);

    await Promise.all([
      ...vehicles.map(v => loadTasksForVehicle(v.id).catch(() => {})),
      ...homes.map(h => loadTasksForHome(h.id).catch(() => {})),
    ]);

    routeToScreen(vehicles, homes);
  };

  const routeToScreen = (vehicles, homes) => {
    const v = vehicles.length;
    const h = homes.length;
    if (v === 0 && h === 0) {
      setScreen("asset-select");
    } else if (v === 1 && h === 0) {
      setActiveVehicleId(vehicles[0].id);
      setScreen("dashboard");
    } else if (v === 0 && h === 1) {
      setActiveHomeId(homes[0].id);
      setScreen("home-dashboard");
    } else {
      setScreen("combined-dashboard");
    }
  };

  const handleGoHome = () => routeToScreen(allVehicles, allHomes);

  const handleAuth = (sess) => {
    setSession(sess);
    loadUserData(sess);
  };

  const handleAssetSelect = (type) => {
    if (type === "vehicle") setScreen("vehicle");
    if (type === "home")    setScreen("home");
  };

  // ── Vehicle flow ─────────────────────────────────────────────────────────────
  const handleVehicleComplete = (data) => {
    setPendingVehicle(data);
    setScreen("generating");
  };

  const handleGenerationComplete = async () => {
    if (pendingVehicle?.id) {
      await loadTasksForVehicle(pendingVehicle.id);
    }
    const newVehicles = allVehicles.some(v => v.id === pendingVehicle?.id)
      ? allVehicles
      : [pendingVehicle, ...allVehicles];
    setAllVehicles(newVehicles);
    setActiveVehicleId(pendingVehicle?.id);
    setPendingVehicle(null);
    routeToScreen(newVehicles, allHomes);
  };

  const handleVehicleUpdate = (updated) => {
    setAllVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
  };

  // ── Home flow ────────────────────────────────────────────────────────────────
  const handleHomeComplete = (data) => {
    setPendingHome(data);
    setScreen("home-generating");
  };

  const handleHomeGenerationComplete = async () => {
    if (pendingHome?.id) {
      await loadTasksForHome(pendingHome.id);
    }
    const newHomes = allHomes.some(h => h.id === pendingHome?.id)
      ? allHomes
      : [pendingHome, ...allHomes];
    setAllHomes(newHomes);
    setActiveHomeId(pendingHome?.id);
    setPendingHome(null);
    routeToScreen(allVehicles, newHomes);
  };

  const handleHomeUpdate = (updated) => {
    setAllHomes(prev => prev.map(h => h.id === updated.id ? updated : h));
  };

  const handleProfileUpdate = (updated) => setProfile(updated);
  const handleAddAsset = () => setScreen("asset-select");

  const handleSetupVehiclePlan = (vehicleId) => {
    const vehicle = allVehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    setPendingVehicle(vehicle);
    setScreen("generating");
  };

  const handleVehicleDeleted = (vehicleId) => {
    const newVehicles = allVehicles.filter(v => v.id !== vehicleId);
    setAllVehicles(newVehicles);
    setVehicleTasksMap(prev => { const n = { ...prev }; delete n[vehicleId]; return n; });
    if (activeVehicleId === vehicleId) setActiveVehicleId(null);
    routeToScreen(newVehicles, allHomes);
  };

  const handleHomeDeleted = (homeId) => {
    const newHomes = allHomes.filter(h => h.id !== homeId);
    setAllHomes(newHomes);
    setHomeTasksMap(prev => { const n = { ...prev }; delete n[homeId]; return n; });
    if (activeHomeId === homeId) setActiveHomeId(null);
    routeToScreen(allVehicles, newHomes);
  };

  // ── Invite accept / decline ──────────────────────────────────────────────────
  const handleInviteAccepted = async (invite) => {
    setInviteLoading(invite.shareId);
    const { error } = await supabase
      .from("asset_shares")
      .update({ status: "accepted" })
      .eq("id", invite.shareId);
    if (error) { setInviteLoading(null); return; }
    setPendingInvites(prev => prev.filter(i => i.shareId !== invite.shareId));
    setInviteLoading(null);
    // Reload everything so the shared asset appears on the dashboard
    if (session) loadUserData(session);
  };

  const handleInviteDeclined = async (shareId) => {
    setInviteLoading(shareId);
    await supabase.from("asset_shares").delete().eq("id", shareId);
    setPendingInvites(prev => prev.filter(i => i.shareId !== shareId));
    setInviteLoading(null);
  };

  // Active asset objects
  const activeVehicle = allVehicles.find(v => v.id === activeVehicleId) || null;
  const activeHome    = allHomes.find(h => h.id === activeHomeId) || null;

  // ── Loading screen ───────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--navy)"
      }}>
        <div style={{
          width: 48, height: 48, background: "var(--teal)", borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "pulse 1.5s ease-in-out infinite"
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "white" }}>M</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* ── Pending invite banner ── */}
      {pendingInvites.length > 0 && screen !== "welcome" && (
        <div style={{
          position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)",
          width: "min(100vw, 480px)", zIndex: 9000,
          display: "flex", flexDirection: "column", gap: 8,
          padding: "12px 12px 0",
          pointerEvents: "none",
        }}>
          {pendingInvites.map(invite => (
            <div key={invite.shareId} style={{
              background: "#1A1D23",
              border: "1px solid #2E3240",
              borderRadius: 16,
              padding: "14px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              pointerEvents: "all",
              ...bodyFont,
            }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "white", marginBottom: 10 }}>
                <span style={{ color: "#8E95A3" }}>{invite.ownerName} shared </span>
                <strong style={{ color: "white" }}>{invite.assetName}</strong>
                <span style={{ color: "#8E95A3" }}> with you</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleInviteDeclined(invite.shareId)}
                  disabled={inviteLoading === invite.shareId}
                  style={{
                    flex: 1, padding: "8px", border: "1px solid #3A3D45",
                    borderRadius: 10, background: "none", color: "#8E95A3",
                    fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", ...bodyFont,
                  }}
                >
                  Decline
                </button>
                <button
                  onClick={() => handleInviteAccepted(invite)}
                  disabled={inviteLoading === invite.shareId}
                  style={{
                    flex: 2, padding: "8px", border: "none", borderRadius: 10,
                    background: "#FF7A35", color: "white",
                    fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", ...bodyFont,
                    opacity: inviteLoading === invite.shareId ? 0.7 : 1,
                  }}
                >
                  {inviteLoading === invite.shareId ? "Accepting…" : "Accept"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {screen === "welcome" && <Welcome onAuth={handleAuth} />}

      {screen === "asset-select" && (
        <AssetSelect session={session} profile={profile} onSelect={handleAssetSelect} onBack={() => routeToScreen(allVehicles, allHomes)} />
      )}

      {screen === "vehicle" && (
        <VehicleOnboarding
          session={session}
          onComplete={handleVehicleComplete}
          onBack={() => {
            if (allVehicles.length > 0 || allHomes.length > 0) {
              routeToScreen(allVehicles, allHomes);
            } else {
              setScreen("asset-select");
            }
          }}
        />
      )}
      {screen === "generating" && (
        <Generating
          session={session}
          vehicleData={pendingVehicle}
          onComplete={handleGenerationComplete}
        />
      )}

      {screen === "home" && (
        <HomeOnboarding
          session={session}
          onComplete={handleHomeComplete}
          onBack={() => {
            if (allVehicles.length > 0 || allHomes.length > 0) {
              routeToScreen(allVehicles, allHomes);
            } else {
              setScreen("asset-select");
            }
          }}
        />
      )}
      {screen === "home-generating" && (
        <HomeGenerating
          session={session}
          homeData={pendingHome}
          onComplete={handleHomeGenerationComplete}
        />
      )}

      {screen === "dashboard" && activeVehicle && (
        <Dashboard
          session={session}
          profile={profile}
          vehicleData={activeVehicle}
          tasks={vehicleTasksMap[activeVehicle.id] || []}
          onVehicleUpdate={handleVehicleUpdate}
          onProfileUpdate={handleProfileUpdate}
          onTasksUpdate={(tasks) =>
            setVehicleTasksMap(prev => ({ ...prev, [activeVehicle.id]: tasks }))
          }
          onAddVehicle={handleAddAsset}
          onGoHome={handleGoHome}
          onHomeUpdated={handleHomeUpdate}
          onVehicleDeleted={handleVehicleDeleted}
          onHomeDeleted={handleHomeDeleted}
        />
      )}

      {screen === "home-dashboard" && activeHome && (
        <HomeDashboard
          session={session}
          profile={profile}
          homeData={activeHome}
          homeTasks={homeTasksMap[activeHome.id] || []}
          onHomeUpdate={handleHomeUpdate}
          onProfileUpdate={handleProfileUpdate}
          onHomeTasksUpdate={(tasks) =>
            setHomeTasksMap(prev => ({ ...prev, [activeHome.id]: tasks }))
          }
          onAddAsset={handleAddAsset}
          onGoHome={handleGoHome}
          onVehicleUpdated={handleVehicleUpdate}
          onVehicleDeleted={handleVehicleDeleted}
          onHomeDeleted={handleHomeDeleted}
        />
      )}

      {screen === "combined-dashboard" && (
        <CombinedDashboard
          session={session}
          profile={profile}
          allVehicles={allVehicles}
          allHomes={allHomes}
          vehicleTasksMap={vehicleTasksMap}
          homeTasksMap={homeTasksMap}
          onViewVehicle={(vehicleId) => {
            setActiveVehicleId(vehicleId);
            setScreen("dashboard");
          }}
          onViewHome={(homeId) => {
            setActiveHomeId(homeId);
            setScreen("home-dashboard");
          }}
          onAddAsset={handleAddAsset}
          onSetupVehiclePlan={handleSetupVehiclePlan}
          onVehicleTasksUpdate={(vehicleId, tasks) =>
            setVehicleTasksMap(prev => ({ ...prev, [vehicleId]: tasks }))
          }
          onHomeTasksUpdate={(homeId, tasks) =>
            setHomeTasksMap(prev => ({ ...prev, [homeId]: tasks }))
          }
          onProfileUpdate={handleProfileUpdate}
          onVehicleUpdated={handleVehicleUpdate}
          onHomeUpdated={handleHomeUpdate}
          onVehicleDeleted={handleVehicleDeleted}
          onHomeDeleted={handleHomeDeleted}
        />
      )}
    </div>
  );
}
