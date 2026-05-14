import { useState } from "react";
import { supabase } from "../supabaseClient";
import ServiceLogModal from "./ServiceLogModal";
import HomeServiceLogModal from "./HomeServiceLogModal";
import ProfileSheet from "./ProfileSheet";

const C = {
  bg: "#F5F7FA", card: "#FFFFFF", border: "#ECEEF2",
  green: "#4CAF82", greenLight: "#E8F5EF", greenDark: "#2D7A57",
  orange: "#FF7A35", orangeLight: "#FFF0E8", orangeDark: "#CC5A1F",
  textPrimary: "#1A1D23", textSecondary: "#8E95A3",
  amber: "#F59E0B", amberLight: "#FEF3C7", amberDark: "#B45309",
  red: "#EF4444", redLight: "#FEE2E2",
  purple: "#7C6CD0", purpleLight: "#EDE9FB",
};

const getVehicleUrgency = (task, currentMileage) => {
  if (task.inspect_at_next_visit) return "inspect";
  if (task.next_due_miles && currentMileage >= task.next_due_miles) return "overdue";
  if (task.next_due_at && new Date(task.next_due_at) < new Date()) return "overdue";
  if (task.next_due_miles && (task.next_due_miles - currentMileage) <= 500) return "soon";
  if (task.next_due_at) {
    const days = Math.floor((new Date(task.next_due_at) - new Date()) / 86400000);
    if (days <= 14) return "soon";
  }
  if (!task.next_due_miles && !task.next_due_at) return "inspect";
  return "ok";
};

const getHomeUrgency = (task) => {
  if (task.inspect_at_next_visit) return "inspect";
  if (!task.next_due_at) return "inspect";
  const days = Math.floor((new Date(task.next_due_at) - new Date()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 14) return "soon";
  return "ok";
};

const HOME_ICONS = [
  { match: /hvac|furnace|air.?condition/i, icon: "🌡️" },
  { match: /air.?filter/i, icon: "💨" },
  { match: /roof|gutter/i, icon: "🏠" },
  { match: /water.?heater/i, icon: "🚿" },
  { match: /smoke|fire|carbon/i, icon: "🔥" },
  { match: /pool/i, icon: "🏊" },
  { match: /generator/i, icon: "⚡" },
  { match: /dryer/i, icon: "🔥" },
];
const getHomeIcon = (n) => (HOME_ICONS.find(({ match }) => match.test(n))?.icon) || "🏡";

const VEHICLE_ICONS = [
  { match: /oil/i, icon: "🛢️" }, { match: /tire.?rotat/i, icon: "🔄" },
  { match: /brake/i, icon: "🛑" }, { match: /cabin.?air/i, icon: "💨" },
  { match: /spark/i, icon: "⚡" }, { match: /battery/i, icon: "🔋" },
  { match: /transmission/i, icon: "⚙️" },
];
const getVehicleIcon = (n) => (VEHICLE_ICONS.find(({ match }) => match.test(n))?.icon) || "🔧";

const healthRing = (pct) => {
  const R = 28; const CIRC = 2 * Math.PI * R;
  return { R, CIRC, offset: CIRC * (1 - pct / 100) };
};

const calcVehicleHealth = (tasks, mileage) => {
  if (tasks.length === 0) return 100;
  const overdue = tasks.filter(t => getVehicleUrgency(t, mileage) === "overdue").length;
  const soon    = tasks.filter(t => getVehicleUrgency(t, mileage) === "soon").length;
  const inspect = tasks.filter(t => getVehicleUrgency(t, mileage) === "inspect").length;
  return Math.round(Math.max(0,
    100 - (overdue / tasks.length) * 60 - (soon / tasks.length) * 20 - (inspect / tasks.length) * 10
  ));
};

const calcHomeHealth = (tasks) => {
  if (tasks.length === 0) return 100;
  const overdue = tasks.filter(t => getHomeUrgency(t) === "overdue").length;
  const soon    = tasks.filter(t => getHomeUrgency(t) === "soon").length;
  const inspect = tasks.filter(t => getHomeUrgency(t) === "inspect").length;
  return Math.round(Math.max(0,
    100 - (overdue / tasks.length) * 60 - (soon / tasks.length) * 20 - (inspect / tasks.length) * 10
  ));
};

export default function CombinedDashboard({
  session, profile,
  allVehicles, allHomes,
  vehicleTasksMap, homeTasksMap,
  onViewVehicle, onViewHome, onAddAsset, onSetupVehiclePlan,
  onVehicleTasksUpdate, onHomeTasksUpdate, onProfileUpdate,
  onVehicleUpdated, onHomeUpdated, onVehicleDeleted, onHomeDeleted,
}) {
  // logItem: { type: "vehicle"|"home", task, asset }
  const [logItem, setLogItem] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const bodyFont = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };
  const getUserName = () => {
    if (profile?.full_name) return profile.full_name.split(" ")[0];
    const raw = session?.user?.email?.split("@")[0] || "there";
    const cleaned = raw.replace(/[0-9._-]/g, " ").trim().split(" ")[0];
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  };
  const getUserInitial = () => (getUserName()[0] || "U").toUpperCase();

  const handlePress = (task, type, asset) => {
    const taskKey = task.id || task.name;
    if (flashId === taskKey) return;
    setFlashId(taskKey);
    setTimeout(() => {
      setFlashId(null);
      setLogItem({ type, task, asset });
    }, 1000);
  };

  // ── Mini task row ────────────────────────────────────────────────────────────
  const MiniTaskCard = ({ task, type, urgency, asset }) => {
    const taskKey = task.id || task.name;
    const isFlashing = flashId === taskKey;
    const needsLog = urgency === "overdue" || urgency === "soon";
    const icon = type === "vehicle" ? getVehicleIcon(task.name) : getHomeIcon(task.name);
    const urgencyBg    = { overdue: C.redLight, soon: C.amberLight, inspect: C.purpleLight, ok: C.greenLight }[urgency];
    const urgencyTxt   = { overdue: C.red, soon: C.amberDark, inspect: C.purple, ok: C.greenDark }[urgency];
    const urgencyLabel = { overdue: "Overdue", soon: "Due Soon", inspect: "Inspect", ok: "On Track" }[urgency];

    return (
      <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: needsLog ? 8 : 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", background: urgencyBg,
            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary, marginBottom: 3 }}>{task.name}</div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: urgencyBg, color: urgencyTxt }}>{urgencyLabel}</span>
          </div>
        </div>
        {needsLog && (
          <button
            onClick={(e) => { e.stopPropagation(); handlePress(task, type, asset); }}
            style={{
              width: "100%", padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer",
              background: isFlashing ? "#E86520" : C.orange,
              color: "white", fontWeight: 700, fontSize: "0.82rem", ...bodyFont,
              animation: isFlashing ? "logBounce 0.55s ease forwards" : "none",
              transition: "background 0.15s ease",
            }}
          >{isFlashing ? "🎉 Logged!" : "DONE ✓"}</button>
        )}
      </div>
    );
  };

  // ── Asset card shell ─────────────────────────────────────────────────────────
  const AssetCard = ({ title, emoji, type, ring, buddy, urgentTasks, totalTasks, asset, onViewAll, onSetupPlan }) => {
    const cardAction = totalTasks > 0 ? onViewAll : onSetupPlan;
    return (
    <div
      onClick={cardAction}
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden", marginBottom: 16, cursor: cardAction ? "pointer" : "default" }}
    >
      {/* Gradient header */}
      <div style={{
        background: type === "home"
          ? "linear-gradient(135deg, #2D7A57 0%, #4CAF82 60%, #6BC99B 100%)"
          : "linear-gradient(135deg, #E85D1F 0%, #FF7A35 60%, #FF9455 100%)",
        padding: "14px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <svg width="68" height="68" viewBox="0 0 68 68">
              <circle cx="34" cy="34" r={ring.R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="6" />
              <circle cx="34" cy="34" r={ring.R} fill="none"
                stroke="white" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={ring.CIRC} strokeDashoffset={ring.offset}
                transform="rotate(-90 34 34)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: "white", lineHeight: 1 }}>
                {Math.round((1 - ring.offset / ring.CIRC) * 100)}%
              </span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.8)", fontWeight: 600, marginBottom: 2 }}>
              {emoji} {title}
            </div>
            {asset._sharedByName && (
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.55)", marginBottom: 4, fontWeight: 500 }}>
                Shared by {asset._sharedByName}
              </div>
            )}
            <p style={{ margin: 0, color: "white", fontSize: "0.85rem", lineHeight: 1.5 }}>{buddy}</p>
          </div>
        </div>
      </div>

      {/* Urgent task rows */}
      <div style={{ padding: "4px 16px 0" }}>
        {urgentTasks.length === 0 ? (
          <div style={{ padding: "16px 0", textAlign: "center", color: C.textSecondary, fontSize: "0.85rem" }}>
            ✅ All caught up — nothing urgent right now
          </div>
        ) : (
          urgentTasks.map(task => {
            const urgency = type === "vehicle"
              ? getVehicleUrgency(task, parseInt(asset.current_mileage) || 0)
              : getHomeUrgency(task);
            return <MiniTaskCard key={task.id} task={task} type={type} urgency={urgency} asset={asset} />;
          })
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: "12px 16px", borderTop: `1px solid ${C.border}`,
        fontSize: "0.8rem", fontWeight: totalTasks > 0 || (type === "vehicle" && onSetupPlan) ? 600 : 400,
        color: totalTasks > 0 ? (type === "home" ? C.green : C.orange)
          : type === "vehicle" && onSetupPlan ? C.orange
          : C.textSecondary,
        textAlign: "center",
      }}>
        {totalTasks > 0
          ? "See all tasks →"
          : type === "vehicle" && onSetupPlan
            ? "Set up maintenance plan →"
            : "No tasks yet"}
      </div>
    </div>
    );
  };

  // ── Log modal save handlers ───────────────────────────────────────────────────
  const handleVehicleLogSaved = (mileage) => {
    if (!logItem) return;
    const { task, asset } = logItem;
    const existing = vehicleTasksMap[asset.id] || [];
    const updated = existing.map(t => {
      if (t.id !== task.id) return t;
      const next = t.interval_miles ? mileage + t.interval_miles : null;
      return { ...t, last_completed_miles: mileage, next_due_miles: next };
    });
    onVehicleTasksUpdate(asset.id, updated);
    setLogItem(null);
  };

  const handleHomeLogSaved = (serviceDate) => {
    if (!logItem) return;
    const { task, asset } = logItem;
    const existing = homeTasksMap[asset.id] || [];
    const updated = existing.map(t => {
      if (t.id !== task.id) return t;
      const due = new Date(serviceDate);
      if (t.interval_days) due.setDate(due.getDate() + t.interval_days);
      return {
        ...t,
        last_completed_at: serviceDate,
        next_due_at: t.interval_days ? due.toISOString() : t.next_due_at,
        inspect_at_next_visit: false,
      };
    });
    onHomeTasksUpdate(asset.id, updated);
    setLogItem(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 80, ...bodyFont, color: C.textPrimary }}>

      {/* Top bar */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: "0.8rem", color: C.textSecondary }}>{getGreeting()}, {getUserName()} 👋</div>
          <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>Your assets</div>
        </div>
        <div onClick={() => setShowProfile(true)} style={{
          width: 38, height: 38, background: C.orange, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: "1rem", cursor: "pointer",
        }}>{getUserInitial()}</div>
      </div>

      <div style={{ padding: "14px 16px", maxWidth: 480, margin: "0 auto" }}>

        {/* All vehicle cards */}
        {allVehicles.map(vehicle => {
          const tasks   = vehicleTasksMap[vehicle.id] || [];
          const mileage = parseInt(vehicle.current_mileage) || 0;
          const overdue = tasks.filter(t => getVehicleUrgency(t, mileage) === "overdue").length;
          const soon    = tasks.filter(t => getVehicleUrgency(t, mileage) === "soon").length;
          const pct     = calcVehicleHealth(tasks, mileage);
          const ring    = healthRing(pct);
          const urgentTasks = tasks
            .filter(t => ["overdue", "soon"].includes(getVehicleUrgency(t, mileage)))
            .slice(0, 3);

          const name = getUserName();
          const car  = vehicle.nickname || `your ${vehicle.year} ${vehicle.make}`;
          let buddy;
          if (overdue > 0) {
            const t = tasks.find(t => getVehicleUrgency(t, mileage) === "overdue");
            buddy = `${name}, the ${t?.name?.toLowerCase()} on ${car} needs attention first.`;
          } else if (soon > 0) {
            const t = tasks.find(t => getVehicleUrgency(t, mileage) === "soon");
            buddy = `${t?.name} on ${car} is coming up soon. Worth booking ahead.`;
          } else {
            const label = vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
            buddy = `${label} is all good — everything's on schedule!`;
          }

          return (
            <AssetCard
              key={vehicle.id}
              title={vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              emoji="🚗"
              type="vehicle"
              ring={ring}
              buddy={buddy}
              urgentTasks={urgentTasks}
              totalTasks={tasks.length}
              asset={vehicle}
              onViewAll={() => onViewVehicle(vehicle.id)}
              onSetupPlan={onSetupVehiclePlan ? () => onSetupVehiclePlan(vehicle.id) : undefined}
            />
          );
        })}

        {/* All home cards */}
        {allHomes.map(home => {
          const tasks   = homeTasksMap[home.id] || [];
          const overdue = tasks.filter(t => getHomeUrgency(t) === "overdue").length;
          const soon    = tasks.filter(t => getHomeUrgency(t) === "soon").length;
          const pct     = calcHomeHealth(tasks);
          const ring    = healthRing(pct);
          const urgentTasks = tasks
            .filter(t => ["overdue", "soon"].includes(getHomeUrgency(t)))
            .slice(0, 3);

          const name      = getUserName();
          const homeLabel = home.nickname
            ? `your ${home.nickname}`
            : home.home_type === "condo" ? "your condo"
            : home.home_type === "townhouse" ? "your townhouse"
            : "your home";
          let buddy;
          if (overdue > 0) {
            const t = tasks.find(t => getHomeUrgency(t) === "overdue");
            buddy = `${name}, the ${t?.name?.toLowerCase()} for ${homeLabel} is past due. That's the priority.`;
          } else if (soon > 0) {
            const t = tasks.find(t => getHomeUrgency(t) === "soon");
            buddy = `${t?.name} is due soon for ${homeLabel}. Good time to get ahead of it.`;
          } else {
            const cap = homeLabel.charAt(0).toUpperCase() + homeLabel.slice(1);
            buddy = `${cap} is in great shape — all tasks on schedule!`;
          }

          const title = home.nickname
            || (home.home_type === "condo" ? "Condo"
              : home.home_type === "townhouse" ? "Townhouse"
              : "Home");

          return (
            <AssetCard
              key={home.id}
              title={title}
              emoji="🏠"
              type="home"
              ring={ring}
              buddy={buddy}
              urgentTasks={urgentTasks}
              totalTasks={tasks.length}
              asset={home}
              onViewAll={() => onViewHome(home.id)}
            />
          );
        })}

      </div>

      {/* Tab bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.card, borderTop: `1px solid ${C.border}`,
        display: "flex", paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {[
          {
            label: "Overview", active: true,
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity="0.15"/>
                <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            ),
            action: null,
          },
          {
            label: "Add", active: false,
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            ),
            action: onAddAsset,
          },
        ].map((tab, i) => (
          <button key={i} onClick={tab.action} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 3,
            padding: "10px 0", background: "none", border: "none",
            cursor: "pointer", color: tab.active ? C.orange : C.textSecondary,
            transition: "color 0.15s ease",
          }}>
            {tab.icon}
            <span style={{ fontSize: "0.64rem", fontWeight: tab.active ? 600 : 400, ...bodyFont }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Modals */}
      {logItem?.type === "vehicle" && (
        <ServiceLogModal
          session={session}
          vehicleData={logItem.asset}
          task={logItem.task}
          currentMileage={parseInt(logItem.asset.current_mileage) || 0}
          onSaved={handleVehicleLogSaved}
          onClose={() => setLogItem(null)}
        />
      )}
      {logItem?.type === "home" && (
        <HomeServiceLogModal
          session={session}
          homeData={logItem.asset}
          task={logItem.task}
          onSaved={handleHomeLogSaved}
          onClose={() => setLogItem(null)}
        />
      )}
      {showProfile && (
        <ProfileSheet
          session={session}
          profile={profile}
          onClose={() => setShowProfile(false)}
          onProfileSaved={(updated) => onProfileUpdate?.(updated)}
          onVehicleUpdated={onVehicleUpdated}
          onHomeUpdated={onHomeUpdated}
          onVehicleDeleted={onVehicleDeleted}
          onHomeDeleted={onHomeDeleted}
        />
      )}
    </div>
  );
}
