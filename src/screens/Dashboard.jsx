import { useState } from "react";
import { supabase } from "../supabaseClient";
import ServiceLogModal from "./ServiceLogModal";
import EditVehicleModal from "./EditVehicleModal";
import ProfileSheet from "./ProfileSheet";
import AddTaskModal from "./AddTaskModal";

const CATEGORY_ORDER = ["Brakes","Engine","Fluids","Tires","Filters","Electrical","Inspection","Other"];
const CATEGORY_ICONS = { Brakes:"🛑", Engine:"🔧", Fluids:"💧", Tires:"🔄", Filters:"🌬️", Electrical:"⚡", Inspection:"🔍", Other:"🔩" };

const TASK_ICONS = [
  { match: /oil.?change/i,              icon: "🛢️" },
  { match: /tire.?rotat/i,              icon: "🔄" },
  { match: /tire.?replac/i,             icon: "🚗" },
  { match: /brake.?(inspect|check)/i,   icon: "🛑" },
  { match: /cabin.?air/i,               icon: "💨" },
  { match: /engine.?air|air.?filter/i,  icon: "🌬️" },
  { match: /spark.?plug/i,              icon: "⚡" },
  { match: /battery/i,                  icon: "🔋" },
  { match: /transmission/i,             icon: "⚙️" },
  { match: /coolant|antifreeze/i,       icon: "🌡️" },
  { match: /transfer.?case/i,           icon: "🔩" },
  { match: /wiper/i,                    icon: "🌧️" },
  { match: /brake.?fluid/i,             icon: "🔴" },
  { match: /differential/i,             icon: "🔧" },
  { match: /inspect/i,                  icon: "🔍" },
];

const getTaskIcon = (name) => {
  const match = TASK_ICONS.find(({ match }) => match.test(name));
  return match ? match.icon : "🔧";
};

const C = {
  bg:            "#F5F7FA",
  card:          "#FFFFFF",
  border:        "#ECEEF2",
  green:         "#4CAF82",
  greenLight:    "#E8F5EF",
  greenDark:     "#2D7A57",
  orange:        "#FF7A35",
  orangeLight:   "#FFF0E8",
  orangeDark:    "#CC5A1F",
  textPrimary:   "#1A1D23",
  textSecondary: "#8E95A3",
  amber:         "#F59E0B",
  amberLight:    "#FEF3C7",
  amberDark:     "#B45309",
  red:           "#EF4444",
  redLight:      "#FEE2E2",
  purple:        "#7C6CD0",
  purpleLight:   "#EDE9FB",
};

export default function Dashboard({
  session, profile, vehicleData, tasks,
  onVehicleUpdate, onProfileUpdate, onTasksUpdate, onAddVehicle, onGoHome,
  onHomeUpdated, onVehicleDeleted, onHomeDeleted,
}) {
  const [mileageInput, setMileageInput] = useState(vehicleData?.current_mileage || "");
  const [updatingMileage, setUpdatingMileage] = useState(false);
  const [currentMileage, setCurrentMileage] = useState(parseInt(vehicleData?.current_mileage) || 0);
  const [mileageSuccess, setMileageSuccess] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [filter, setFilter] = useState("all");
  const [logTask, setLogTask] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [taskLogs, setTaskLogs] = useState({});
  const [dismissConfirm, setDismissConfirm] = useState(null);
  const [quickEditTask, setQuickEditTask] = useState(null);
  const [quickEditForm, setQuickEditForm] = useState({ mileage: "", date: "" });
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [logFlash, setLogFlash] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);

  // ── Mileage ──────────────────────────────────────────────────────────
  const updateMileage = async () => {
    const newMi = parseInt(mileageInput);
    if (!newMi || newMi < 1 || newMi === currentMileage) return;
    setUpdatingMileage(true);
    await supabase.from("mileage_logs").insert({
      vehicle_id: vehicleData.id, user_id: session.user.id, mileage: newMi, source: "manual",
    });
    await supabase.from("vehicles").update({
      current_mileage: newMi, mileage_updated_at: new Date().toISOString(),
    }).eq("id", vehicleData.id);
    setCurrentMileage(newMi);
    setUpdatingMileage(false);
    setMileageSuccess(true);
    setTimeout(() => setMileageSuccess(false), 2000);
  };

  // ── After service log saved ───────────────────────────────────────────
  const handleLogSaved = async (loggedMileage, mileageWasUpdated = true) => {
    const { data: updatedTasks } = await supabase
      .from("maintenance_tasks").select("*")
      .eq("vehicle_id", vehicleData.id).eq("status", "active")
      .order("created_at", { ascending: false });
    if (updatedTasks) {
      const seen = new Set();
      const deduped = updatedTasks.filter(t => {
        const key = t.name?.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      onTasksUpdate(deduped);
    }
    if (logTask?.id) await fetchTaskLogs(logTask.id, true);
    if (mileageWasUpdated && loggedMileage) {
      setCurrentMileage(loggedMileage);
      setMileageInput(loggedMileage);
      onVehicleUpdate({ ...vehicleData, current_mileage: loggedMileage });
    }
    setLogTask(null);
  };
  
  // ── Add task ──────────────────────────────────────────────────────────
  const handleTaskAdded = (newTask) => {
    onTasksUpdate([newTask, ...tasks]);
    setShowAddTask(false);
  };

  // ── Vehicle ───────────────────────────────────────────────────────────
  const handleVehicleSaved = (updated) => {
    onVehicleUpdate(updated);
    setCurrentMileage(parseInt(updated.current_mileage) || currentMileage);
    setMileageInput(updated.current_mileage || mileageInput);
    setShowEdit(false);
  };

  const handleLogout = async () => supabase.auth.signOut();

  // ── Task history ──────────────────────────────────────────────────────
  const fetchTaskLogs = async (taskId, forceRefresh = false) => {
    if (taskLogs[taskId] && !forceRefresh) return;
    setTaskLogs(prev => ({ ...prev, [taskId]: { loading: true, logs: [] } }));
    const { data, error } = await supabase.from("service_logs").select("*")
      .eq("task_id", taskId).order("service_date", { ascending: false });
    setTaskLogs(prev => ({ ...prev, [taskId]: { loading: false, logs: error ? [] : (data || []) } }));
  };

  const toggleHistory = (task) => {
    if (!task.id) return;
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(task.id)) { next.delete(task.id); setQuickEditTask(null); }
      else { next.add(task.id); fetchTaskLogs(task.id); }
      return next;
    });
  };

  // ── Dismiss ───────────────────────────────────────────────────────────
  const dismissTask = async (taskId) => {
    await supabase.from("maintenance_tasks").update({ status: "dismissed" }).eq("id", taskId);
    onTasksUpdate(tasks.filter(t => t.id !== taskId));
    setDismissConfirm(null);
  };

  // ── Quick-edit inspect tasks ──────────────────────────────────────────
  const saveQuickEdit = async (task) => {
    const mileage = parseInt(quickEditForm.mileage);
    if (!mileage || !quickEditForm.date) return;
    setQuickEditSaving(true);
    const updates = { last_completed_miles: mileage };
    if (task.interval_miles) {
      updates.next_due_miles = mileage + task.interval_miles;
      const months = task.interval_miles / 1200;
      const due = new Date(quickEditForm.date);
      due.setDate(due.getDate() + Math.round(months * 30));
      updates.next_due_at = due.toISOString();
    } else if (task.interval_days) {
      const due = new Date(quickEditForm.date);
      due.setDate(due.getDate() + task.interval_days);
      updates.next_due_at = due.toISOString();
    }
    await supabase.from("maintenance_tasks").update(updates).eq("id", task.id);
    try {
      await supabase.from("service_logs").insert({
        vehicle_id: vehicleData.id, user_id: session.user.id,
        task_id: task.id, task_name: task.name,
        service_date: quickEditForm.date, mileage_at_service: mileage,
      });
    } catch { /* ok */ }
    const { data: refreshed } = await supabase.from("maintenance_tasks").select("*")
      .eq("vehicle_id", vehicleData.id).eq("status", "active");
    if (refreshed) onTasksUpdate(refreshed);
    await fetchTaskLogs(task.id, true);
    setQuickEditTask(null);
    setQuickEditForm({ mileage: "", date: "" });
    setQuickEditSaving(false);
  };

  // ── Progress / Health / Urgency ───────────────────────────────────────
  const getProgress = (task) => {
    if (!task.last_completed_miles || !task.interval_miles) return 0;
    return Math.min(Math.round(((currentMileage - task.last_completed_miles) / task.interval_miles) * 100), 110);
  };
  const getHealth = (task) => Math.max(0, 100 - getProgress(task));
  const getMilesRemaining = (task) => {
    if (!task.next_due_miles) return null;
    return task.next_due_miles - currentMileage;
  };
  const getUrgency = (task) => {
    const isInspect =
      task.inspect_at_next_visit ||
      (task.last_completed_miles == null && task.next_due_miles == null);
    if (isInspect) return "inspect";
    const pct = getProgress(task);
    const rem = getMilesRemaining(task);
    if (pct >= 100 || (rem !== null && rem <= 0)) return "overdue";
    if (pct >= 80 || (rem !== null && rem <= 500)) return "soon";
    return "ok";
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // ── Counts ────────────────────────────────────────────────────────────
  const overdueCount  = tasks.filter(t => getUrgency(t) === "overdue").length;
  const dueCount      = tasks.filter(t => getUrgency(t) === "soon").length;
  const inspectCount  = tasks.filter(t => getUrgency(t) === "inspect").length;
  const onTrackCount  = tasks.filter(t => getUrgency(t) === "ok").length;

  // ── Health ring ───────────────────────────────────────────────────────
  const healthPct = tasks.length === 0 ? 100
    : Math.round(Math.max(0,
        100
        - (overdueCount  / tasks.length) * 60
        - (dueCount      / tasks.length) * 20
        - (inspectCount  / tasks.length) * 10
      ));
  const RING_R     = 38;
  const RING_CIRC  = 2 * Math.PI * RING_R;
  const ringOffset = RING_CIRC * (1 - healthPct / 100);
  const ringColor  = healthPct > 70 ? "#4CAF82" : healthPct > 40 ? "#F59E0B" : "#EF4444";

  // ── Next service miles ────────────────────────────────────────────────
  const nextServiceMiles = tasks
    .map(t => getMilesRemaining(t))
    .filter(r => r !== null && r > 0)
    .sort((a, b) => a - b)[0] ?? null;

  // ── User greeting helpers ─────────────────────────────────────────────
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

  // ── Buddy message ─────────────────────────────────────────────────────
  const getBuddyMessage = () => {
    const overdueTasks = tasks.filter(t => getUrgency(t) === "overdue");
    const soonTasks    = tasks.filter(t => getUrgency(t) === "soon");
    const inspectTasks = tasks.filter(t => getUrgency(t) === "inspect");
    const car = vehicleData ? `your ${vehicleData.year} ${vehicleData.make}` : "your car";
    const name = getUserName();

    if (overdueTasks.length > 0) {
      const t = overdueTasks[0];
      const rem = getMilesRemaining(t);
      const miOver = rem !== null ? Math.abs(rem) : null;
      const extra = overdueTasks.length > 1 ? ` — and ${overdueTasks.length - 1} other thing${overdueTasks.length > 2 ? "s" : ""} too` : "";
      return miOver
        ? `${name}, the ${t.name.toLowerCase()} on ${car} is ${miOver.toLocaleString()} miles overdue${extra}. That's the one to book first — it's important.`
        : `Heads up, ${name} — the ${t.name.toLowerCase()} on ${car} is past due${extra}. Worth getting in soon.`;
    }
    if (soonTasks.length > 0) {
      const t = soonTasks[0];
      const rem = getMilesRemaining(t);
      if (rem !== null) {
        const weeks = Math.round(rem / 300);
        const timeStr = weeks <= 0 ? "basically now" : weeks === 1 ? "about a week" : `around ${weeks} weeks`;
        return `${car.charAt(0).toUpperCase() + car.slice(1)}'s ${t.name.toLowerCase()} is coming up in about ${rem.toLocaleString()} miles — ${timeStr} at your usual pace. Good time to book it.`;
      }
      return `The ${t.name.toLowerCase()} on ${car} is due soon, ${name}. Worth getting ahead of it before your next long drive.`;
    }
    if (inspectTasks.length > 0) {
      const name1 = inspectTasks[0].name.toLowerCase();
      return inspectTasks.length === 1
        ? `Next time you're in for service, ask them to take a look at the ${name1} on ${car}. Nothing alarming — just needs eyes on it.`
        : `${name}, you've got ${inspectTasks.length} things on ${car} that are worth a quick look at your next service. Nothing urgent, just flag them for your tech.`;
    }
    return `${car.charAt(0).toUpperCase() + car.slice(1)} is looking good, ${name}! Everything's on schedule — no action needed right now.`;
  };

  // ── Filtering & Grouping by service status ────────────────────────────
  const filteredTasks = tasks.filter(t => {
    if (filter === "due") return ["overdue","soon","inspect"].includes(getUrgency(t));
    if (filter === "ok")  return getUrgency(t) === "ok";
    return true;
  });

  const STATUS_GROUPS = [
    { key: "overdue", label: "Needs Attention",  icon: "🔴" },
    { key: "soon",    label: "Due Soon",          icon: "🟡" },
    { key: "inspect", label: "Inspect at Service", icon: "🔵" },
    { key: "ok",      label: "On Track",          icon: "🟢" },
  ];

  const tasksInGroup = (statusKey) =>
    filteredTasks
      .filter(t => getUrgency(t) === statusKey)
      .sort((a, b) => {
        const remA = getMilesRemaining(a) ?? Infinity;
        const remB = getMilesRemaining(b) ?? Infinity;
        return remA - remB;
      });

  // ── Urgency color maps (light theme) ─────────────────────────────────
  const urgencyAccent = { overdue: C.red,    soon: C.amber,    inspect: C.purple,    ok: C.green    };
  const urgencyBg     = { overdue: C.redLight, soon: C.amberLight, inspect: C.purpleLight, ok: C.greenLight };
  const urgencyText   = { overdue: C.red,    soon: C.amberDark, inspect: C.purple,    ok: C.greenDark };

  // ── Shared inline style helpers ───────────────────────────────────────
  const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 };
  const bodyFont  = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 80, ...bodyFont, color: C.textPrimary }}>

      {/* ── Top bar ── */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <button onClick={() => onGoHome?.()} style={{
            background: "none", border: "none", cursor: "pointer", padding: "4px 4px 4px 0",
            color: C.textSecondary, display: "flex", alignItems: "center", flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: C.textSecondary, fontWeight: 400 }}>{getGreeting()}, {getUserName()} 👋</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>
              🚗 {vehicleData?.nickname || `${vehicleData?.year} ${vehicleData?.make} ${vehicleData?.model}`}
            </div>
            {!vehicleData?._sharedByName && (
              <button onClick={() => setShowEdit(true)} style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 2, color: C.textSecondary, flexShrink: 0,
                display: "flex", alignItems: "center",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            onClick={() => setShowProfile(true)}
            style={{
              width: 38, height: 38, background: C.orange, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 700, fontSize: "1rem",
              cursor: "pointer", flexShrink: 0, userSelect: "none",
            }}
          >{getUserInitial()}</div>
        </div>
      </div>

      <div style={{ padding: "0 16px", maxWidth: 480, margin: "0 auto" }}>

        {/* ── Buddy strip ── */}
        <div style={{
          margin: "14px 0 12px",
          background: "linear-gradient(135deg, #E85D1F 0%, #FF7A35 60%, #FF9455 100%)",
          borderRadius: 16, padding: "14px 16px",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>👋</span>
          <p style={{ margin: 0, color: "white", fontSize: "0.9rem", lineHeight: 1.6, fontWeight: 400 }}>
            {getBuddyMessage()}
          </p>
        </div>

        {/* ── Health ring + breakdown ── */}
        <div style={{ ...cardStyle, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r={RING_R} fill="none" stroke={C.border} strokeWidth="7" />
              <circle
                cx="44" cy="44" r={RING_R} fill="none"
                stroke={ringColor} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 44 44)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: "1.2rem", fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>{healthPct}%</span>
              <span style={{ fontSize: "0.6rem", color: C.textSecondary, fontWeight: 500, marginTop: 2 }}>health</span>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { label: "Overdue",  count: overdueCount,  color: C.red    },
              { label: "Due soon", count: dueCount,      color: C.amber  },
              { label: "Inspect",  count: inspectCount,  color: C.purple },
              { label: "On track", count: onTrackCount,  color: C.green  },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.8125rem", color: C.textSecondary }}>{label}</span>
                </div>
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: C.textPrimary }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {/* Mileage */}
          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ fontSize: "0.72rem", color: C.textSecondary, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Odometer</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                value={mileageInput}
                onChange={e => setMileageInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && updateMileage()}
                style={{
                  flex: 1, border: "none", background: "transparent", ...bodyFont,
                  fontSize: "1.05rem", fontWeight: 800, color: C.textPrimary,
                  padding: 0, outline: "none", minWidth: 0,
                }}
              />
              <button
                onClick={updateMileage}
                disabled={updatingMileage || !parseInt(mileageInput) || parseInt(mileageInput) === currentMileage}
                style={{
                  background: mileageSuccess ? C.orangeDark : C.orange, border: "none",
                  borderRadius: 7, color: "white", cursor: "pointer", ...bodyFont,
                  fontSize: "0.72rem", fontWeight: 600, padding: "5px 9px", flexShrink: 0,
                  opacity: (updatingMileage || !parseInt(mileageInput) || parseInt(mileageInput) === currentMileage) ? 0.45 : 1,
                  transition: "all 0.15s ease",
                }}
              >{updatingMileage ? "…" : mileageSuccess ? "✓" : "Save"}</button>
            </div>
            <div style={{ fontSize: "0.72rem", color: C.textSecondary, marginTop: 4 }}>miles</div>
          </div>

          {/* Next service */}
          <div style={{ ...cardStyle, padding: 14 }}>
            <div style={{ fontSize: "0.72rem", color: C.textSecondary, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Next service</div>
            <div style={{
              fontSize: "1.05rem", fontWeight: 800,
              color: nextServiceMiles !== null
                ? (nextServiceMiles <= 500 ? C.red : nextServiceMiles <= 1500 ? C.amber : C.textPrimary)
                : overdueCount > 0 ? C.red : C.textPrimary,
            }}>
              {nextServiceMiles !== null ? `${nextServiceMiles.toLocaleString()} mi` : overdueCount > 0 ? "Overdue" : "—"}
            </div>
            <div style={{ fontSize: "0.72rem", color: C.textSecondary, marginTop: 4 }}>
              {nextServiceMiles !== null ? "until due" : overdueCount > 0 ? "needs attention" : "no data yet"}
            </div>
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["all","All"],["due","Needs attention"],["ok","On track"]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding: "7px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              ...bodyFont, fontSize: "0.8rem", fontWeight: filter === val ? 600 : 500,
              background: filter === val ? C.orange : C.card,
              color: filter === val ? "white" : C.textSecondary,
              boxShadow: filter === val ? "none" : `0 0 0 1px ${C.border}`,
              transition: "all 0.15s ease",
            }}>{label}</button>
          ))}
        </div>

        {/* ── Status groups ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {STATUS_GROUPS.map(({ key, label, icon }) => {
            const groupTasks  = tasksInGroup(key);
            if (groupTasks.length === 0) return null;
            const isCollapsed = collapsedCategories.has(key);

            return (
              <div key={key}>
                {/* Group header */}
                <button onClick={() => toggleCategory(key)} style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", background: "none",
                  border: "none", cursor: "pointer", padding: "0 0 8px", ...bodyFont,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: C.textPrimary }}>{label}</span>
                    <span style={{
                      fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px",
                      borderRadius: 999, background: urgencyBg[key], color: urgencyText[key],
                    }}>{groupTasks.length}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                    style={{ transition: "transform 0.2s ease", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", color: C.textSecondary }}>
                    <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Task cards */}
                {!isCollapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {groupTasks.map((task, i) => {
                      const urgency     = getUrgency(task);
                      const health      = getHealth(task);
                      const rem         = getMilesRemaining(task);
                      const isExpanded  = task.id && expandedTasks.has(task.id);
                      const logsState   = task.id ? taskLogs[task.id] : null;
                      const isQuickEdit = quickEditTask === task.id;
                      const accent      = urgencyAccent[urgency];
                      const needsLog    = urgency === "overdue" || urgency === "soon";
                      const barColor    = urgency === "overdue" ? "#EF4444" : urgency === "soon" ? "#F59E0B" : "#4CAF82";
                      const detailText  = urgency === "inspect"
                        ? "Inspect at your next service visit"
                        : task.interval_miles
                          ? `Every ${task.interval_miles.toLocaleString()} mi`
                          : task.interval_days
                            ? `Every ${Math.round(task.interval_days / 30)} months`
                            : task.description || "";

                      return (
                        <div key={task.id || i} style={{
                          background: C.card, border: `1px solid ${C.border}`,
                          borderRadius: 16, overflow: "hidden",
                          borderLeft: `4px solid ${accent}`,
                        }}>
                          <div style={{ padding: "14px 14px 12px 12px" }}>

                            {/* ── Top row: icon circle + name + badge ── */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                              <div style={{
                                width: 40, height: 40, borderRadius: "50%",
                                background: urgencyBg[urgency], flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 18,
                              }}>{getTaskIcon(task.name)}</div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: C.textPrimary, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span>{task.name}</span>
                                  {task.is_safety_critical && (
                                    <span style={{ fontSize: "0.6rem", background: C.redLight, color: C.red, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>Safety</span>
                                  )}
                                </div>
                              </div>

                              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: urgencyBg[urgency], color: urgencyText[urgency], whiteSpace: "nowrap", flexShrink: 0 }}>
                                {urgency === "overdue" ? "Overdue" : urgency === "soon" ? "Due Soon" : urgency === "inspect" ? "Inspect" : "On Track"}
                              </span>
                            </div>

                            {/* ── Detail text ── */}
                            {detailText && (
                              <div style={{ fontSize: "0.8rem", color: C.textSecondary, paddingLeft: 50, marginBottom: urgency !== "inspect" ? 10 : 0 }}>
                                {detailText}
                              </div>
                            )}

                            {/* ── Progress bar + miles / % (not for inspect) ── */}
                            {urgency !== "inspect" && task.interval_miles && (
                              <div style={{ paddingLeft: 50, marginBottom: needsLog ? 12 : 0 }}>
                                <div style={{ height: 6, borderRadius: 3, background: "#ECEEF2", overflow: "hidden", marginBottom: 4 }}>
                                  <div style={{ height: "100%", borderRadius: 3, width: `${health}%`, background: barColor, transition: "width 0.4s ease" }} />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ fontSize: "0.72rem", color: C.textSecondary }}>
                                    {rem !== null
                                      ? rem <= 0
                                        ? `${Math.abs(rem).toLocaleString()} mi overdue`
                                        : `${rem.toLocaleString()} mi until due`
                                      : task.next_due_at
                                        ? `Due ${new Date(task.next_due_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                                        : ""}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: urgencyText[urgency] }}>{health}%</span>
                                </div>
                              </div>
                            )}

                            {/* ── Action button — always rendered for every card ── */}
                            {(() => {
                              const taskKey = task.id || task.name;
                              const isFlashing = !!logFlash && logFlash === taskKey;
                              const handlePress = () => {
                                if (isFlashing) return;
                                setLogFlash(taskKey);
                                setTimeout(() => { setLogFlash(null); setLogTask(task); }, 1000);
                              };
                              if (urgency === "overdue" || urgency === "soon") {
                                return (
                                  <button
                                    className="btn-got-this-done"
                                    onClick={handlePress}
                                    style={{
                                      animation: isFlashing ? "logBounce 0.55s ease forwards" : "none",
                                      ...(isFlashing ? { background: "#E86520" } : {}),
                                    }}
                                  >
                                    {isFlashing ? "🎉 Logged!" : "DONE ✓"}
                                  </button>
                                );
                              }
                              if (urgency === "inspect") {
                                return (
                                  <div style={{ marginTop: 4 }}>
                                    <button
                                      className="btn-log-pill-purple"
                                      onClick={handlePress}
                                      style={{ animation: isFlashing ? "logBounce 0.55s ease forwards" : "none" }}
                                    >
                                      {isFlashing ? "🎉 Logged!" : "🔍 Log inspection"}
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div style={{ marginTop: 4 }}>
                                  <button
                                    className="btn-log-pill-orange"
                                    onClick={handlePress}
                                    style={{ animation: isFlashing ? "logBounce 0.55s ease forwards" : "none" }}
                                  >
                                    {isFlashing ? "🎉 Logged!" : "Log service ✓"}
                                  </button>
                                </div>
                              );
                            })()}

                            {/* ── Bottom row: history toggle ── */}
                            {task.id && (
                              <div style={{ marginTop: 10, display: "flex", alignItems: "center" }}>
                                <button onClick={() => toggleHistory(task)} style={{
                                  display: "flex", alignItems: "center", gap: 5,
                                  background: "none", border: "none", cursor: "pointer", padding: 0,
                                  ...bodyFont, fontSize: "0.75rem",
                                  color: isExpanded ? C.orange : C.textSecondary,
                                  transition: "color 0.15s ease",
                                }}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                                    style={{ transition: "transform 0.2s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  {isExpanded ? "Hide history" : "View history"}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* ── Expanded history panel ── */}
                          {isExpanded && (
                            <div style={{ background: "#F8F9FB", borderTop: `1px solid ${C.border}`, padding: "14px 14px 16px" }}>

                              {/* Quick-edit for inspect tasks */}
                              {urgency === "inspect" && (
                                <div style={{ marginBottom: 14 }}>
                                  {!isQuickEdit ? (
                                    <button
                                      className="btn-ol-purple-dashed"
                                      onClick={() => { setQuickEditTask(task.id); setQuickEditForm({ mileage: String(currentMileage), date: new Date().toISOString().split("T")[0] }); }}
                                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, ...bodyFont, fontSize: "0.8125rem", fontWeight: 500, textAlign: "left" }}
                                    >+ I know when this was done — update it</button>
                                  ) : (
                                    <div style={{ background: C.purpleLight, borderRadius: 8, padding: 12, border: `1px solid rgba(124,108,208,0.3)` }}>
                                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: C.purple, marginBottom: 10 }}>When was it last done?</div>
                                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                        <input type="number" placeholder="Mileage" value={quickEditForm.mileage}
                                          onChange={e => setQuickEditForm(f => ({ ...f, mileage: e.target.value }))}
                                          style={{ flex: 1, background: "white", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, ...bodyFont, fontSize: "0.85rem", padding: "8px 10px" }}
                                        />
                                        <input type="date" value={quickEditForm.date}
                                          onChange={e => setQuickEditForm(f => ({ ...f, date: e.target.value }))}
                                          style={{ flex: 1, background: "white", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, ...bodyFont, fontSize: "0.85rem", padding: "8px 10px", colorScheme: "light" }}
                                        />
                                      </div>
                                      <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={() => setQuickEditTask(null)} className="btn-ol-neutral" style={{ flex: 1, padding: 7, borderRadius: 6, ...bodyFont, fontSize: "0.8rem" }}>Cancel</button>
                                        <button onClick={() => saveQuickEdit(task)} disabled={quickEditSaving} className="btn-ol-purple" style={{ flex: 2, padding: 7, borderRadius: 6, ...bodyFont, fontSize: "0.8rem", fontWeight: 600 }}>{quickEditSaving ? "Saving…" : "Save"}</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Service log timeline */}
                              {logsState?.loading ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.textSecondary }}>
                                  <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderTopColor: C.orange, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                                  <span style={{ fontSize: "0.8rem" }}>Loading…</span>
                                </div>
                              ) : !logsState?.logs?.length ? (
                                <p style={{ margin: 0, fontSize: "0.8125rem", color: C.textSecondary, textAlign: "center", padding: "8px 0" }}>
                                  {urgency !== "inspect" && <>📋 No records yet. Log your first service to start tracking.</>}
                                </p>
                              ) : (
                                <div>
                                  {logsState.logs.map((log, idx) => (
                                    <div key={log.id} style={{ display: "flex", gap: 10, paddingBottom: 14 }}>
                                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: idx === 0 ? C.orange : C.border, flexShrink: 0, marginTop: 3 }} />
                                      <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: C.textPrimary }}>{formatDate(log.service_date)}</span>
                                          {log.mileage_at_service && (
                                            <span style={{ fontSize: "0.75rem", color: C.orangeDark, background: C.orangeLight, padding: "1px 6px", borderRadius: 4 }}>
                                              {log.mileage_at_service.toLocaleString()} mi
                                            </span>
                                          )}
                                          {log.cost && <span style={{ fontSize: "0.75rem", color: C.textSecondary, marginLeft: "auto" }}>${parseFloat(log.cost).toFixed(2)}</span>}
                                        </div>
                                        {log.product_brand && <div style={{ fontSize: "0.8rem", color: C.textPrimary, marginBottom: 2 }}>{log.product_brand}</div>}
                                        {log.condition_notes && <div style={{ fontSize: "0.78rem", color: C.textSecondary, fontStyle: "italic" }}>{log.condition_notes}</div>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Dismiss */}
                              <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                                {dismissConfirm === task.id ? (
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ fontSize: "0.78rem", color: C.textSecondary, flex: 1 }}>Remove this task?</span>
                                    <button onClick={() => setDismissConfirm(null)} className="btn-ol-neutral" style={{ padding: "4px 10px", borderRadius: 6, ...bodyFont, fontSize: "0.75rem" }}>Keep</button>
                                    <button onClick={() => dismissTask(task.id)} className="btn-ol-red" style={{ padding: "4px 10px", borderRadius: 6, ...bodyFont, fontSize: "0.75rem", fontWeight: 600 }}>Remove</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setDismissConfirm(task.id)} style={{ background: "none", border: "none", color: C.textSecondary, ...bodyFont, fontSize: "0.75rem", cursor: "pointer", padding: 0, opacity: 0.7 }}>
                                    Dismiss this task
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.textSecondary }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
            <p>No tasks yet.</p>
          </div>
        )}

        {/* Add task button */}
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <button
            onClick={() => setShowAddTask(true)}
            style={{
              width: "100%", padding: "11px", borderRadius: 12,
              border: `1.5px dashed ${C.border}`, background: "none",
              color: C.textSecondary, fontWeight: 600, fontSize: "0.85rem",
              cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span> Add task
          </button>
        </div>

      </div>

      {/* ── Bottom tab bar ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.card, borderTop: `1px solid ${C.border}`,
        display: "flex", zIndex: 20,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {[
          {
            id: "home", label: "Home",
            icon: (active) => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 9.5L12 3L21 9.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0}/>
                <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              </svg>
            ),
          },
          {
            id: "add", label: "Add",
            icon: () => (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            ),
          },
        ].map(tab => {
          const isActive = activeTab === tab.id && tab.id !== "add";
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === "add") { onAddVehicle(); return; }
                if (tab.id === "home") { onGoHome?.(); return; }
                setActiveTab(tab.id);
              }}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3,
                padding: "10px 0", background: "none", border: "none",
                cursor: "pointer", color: isActive ? C.orange : C.textSecondary,
                transition: "color 0.15s ease",
              }}
            >
              {tab.icon(isActive)}
              <span style={{ fontSize: "0.64rem", fontWeight: isActive ? 600 : 400, ...bodyFont }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Modals ── */}
      {logTask && (
        <ServiceLogModal
          session={session} vehicleData={vehicleData} task={logTask}
          currentMileage={currentMileage} onSaved={handleLogSaved} onClose={() => setLogTask(null)}
        />
      )}
      {showEdit && (
        <EditVehicleModal
          session={session} vehicleData={vehicleData} profile={profile}
          onSaved={handleVehicleSaved}
          onProfileSaved={onProfileUpdate}
          onClose={() => setShowEdit(false)}
        />
      )}
      {showProfile && (
        <ProfileSheet
          session={session} profile={profile}
          onClose={() => setShowProfile(false)}
          onProfileSaved={onProfileUpdate}
          onVehicleUpdated={onVehicleUpdate}
          onHomeUpdated={onHomeUpdated}
          onVehicleDeleted={onVehicleDeleted}
          onHomeDeleted={onHomeDeleted}
        />
      )}
      {showAddTask && (
        <AddTaskModal
          session={session}
          assetType="vehicle"
          vehicleData={vehicleData}
          onSaved={handleTaskAdded}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
