import { useState } from "react";
import { supabase } from "../supabaseClient";
import HomeServiceLogModal from "./HomeServiceLogModal";
import ProfileSheet from "./ProfileSheet";
import EditHomeModal from "./EditHomeModal";
import AddTaskModal from "./AddTaskModal";

const HOME_TASK_ICONS = [
  { match: /hvac|furnace|heat.?pump|air.?condition|heating|cooling/i, icon: "🌡️" },
  { match: /air.?filter|filter.?change/i,                             icon: "💨" },
  { match: /condensate|drain.?pan/i,                                  icon: "💧" },
  { match: /roof|shingle|ice.?dam/i,                                  icon: "🏠" },
  { match: /gutter|downspout|leaf/i,                                  icon: "🍂" },
  { match: /water.?heater/i,                                          icon: "🚿" },
  { match: /smoke|fire.?alarm|co.?detector|carbon/i,                  icon: "🔥" },
  { match: /pool|hot.?tub|spa/i,                                      icon: "🏊" },
  { match: /generator/i,                                              icon: "⚡" },
  { match: /pest|termite|rodent|bug/i,                                icon: "🐛" },
  { match: /window|door|weather.?strip|seal/i,                        icon: "🪟" },
  { match: /deck|fence|wood|stain/i,                                  icon: "🪵" },
  { match: /dryer.?vent/i,                                            icon: "🔥" },
  { match: /plumb|pipe|shut.?off/i,                                   icon: "🔧" },
  { match: /electric|outlet|circuit|gfci/i,                           icon: "🔌" },
  { match: /lawn|yard|garden|irrigation|sprinkler/i,                  icon: "🌱" },
  { match: /septic/i,                                                  icon: "🔩" },
  { match: /extinguisher/i,                                           icon: "🧯" },
  { match: /inspect/i,                                                icon: "🔍" },
];

const getHomeTaskIcon = (name) => {
  const match = HOME_TASK_ICONS.find(({ match }) => match.test(name));
  return match ? match.icon : "🏡";
};

const SEASON_NAMES = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter", year_round: "Year-round" };
const SEASON_COLORS = { spring: "#4CAF82", summer: "#FF7A35", fall: "#F59E0B", winter: "#7C6CD0", year_round: "#8E95A3" };

const getCurrentSeason = () => {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 3) return "spring";   // Mar–Apr
  if (m >= 4 && m <= 7) return "summer";   // May–Aug
  if (m >= 8 && m <= 10) return "fall";    // Sep–Nov
  return "winter";                          // Dec–Feb
};

const getNextSeason = (s) => ({ spring: "summer", summer: "fall", fall: "winter", winter: "spring" }[s]);

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

export default function HomeDashboard({
  session, profile, homeData, homeTasks,
  onHomeUpdate, onProfileUpdate, onHomeTasksUpdate, onAddAsset, onGoHome,
  onVehicleUpdated, onVehicleDeleted, onHomeDeleted,
}) {
  const [filter, setFilter] = useState("all");
  const [logTask, setLogTask] = useState(null);
  const [logFlash, setLogFlash] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [taskLogs, setTaskLogs] = useState({});
  const [dismissConfirm, setDismissConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [showProfile, setShowProfile] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const bodyFont = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  // ── Urgency helpers (time-based) ──────────────────────────────────────────
  const getUrgency = (task) => {
    if (task.inspect_at_next_visit) return "inspect";
    if (!task.next_due_at) return "inspect";
    const days = Math.floor((new Date(task.next_due_at) - new Date()) / 86400000);
    if (days < 0) return "overdue";
    if (days <= 14) return "soon";
    return "ok";
  };

  const getHealth = (task) => {
    if (!task.next_due_at || !task.interval_days) return 100;
    const days = Math.floor((new Date(task.next_due_at) - new Date()) / 86400000);
    return Math.max(0, Math.min(100, Math.round((days / task.interval_days) * 100)));
  };

  const getDaysRemaining = (task) => {
    if (!task.next_due_at) return null;
    return Math.floor((new Date(task.next_due_at) - new Date()) / 86400000);
  };

  const formatInterval = (days) => {
    if (!days) return "";
    if (days <= 35) return "Monthly";
    if (days <= 100) return "Every 3 months";
    if (days <= 200) return "Every 6 months";
    if (days <= 400) return "Annually";
    if (days <= 600) return "Every 18 months";
    return "Every 2 years";
  };

  const formatDate = (d) => d
    ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  // ── Counts ─────────────────────────────────────────────────────────────────
  const overdueCount  = homeTasks.filter(t => getUrgency(t) === "overdue").length;
  const dueCount      = homeTasks.filter(t => getUrgency(t) === "soon").length;
  const inspectCount  = homeTasks.filter(t => getUrgency(t) === "inspect").length;
  const onTrackCount  = homeTasks.filter(t => getUrgency(t) === "ok").length;

  // ── Health ring ────────────────────────────────────────────────────────────
  const healthPct = homeTasks.length === 0 ? 100
    : Math.round(Math.max(0,
        100
        - (overdueCount  / homeTasks.length) * 60
        - (dueCount      / homeTasks.length) * 20
        - (inspectCount  / homeTasks.length) * 10
      ));
  const RING_R    = 38;
  const RING_CIRC = 2 * Math.PI * RING_R;
  const ringOffset = RING_CIRC * (1 - healthPct / 100);
  const ringColor  = healthPct > 70 ? "#4CAF82" : healthPct > 40 ? "#F59E0B" : "#EF4444";

  // ── User helpers ───────────────────────────────────────────────────────────
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

  // ── Home label ─────────────────────────────────────────────────────────────
  const homeLabel = homeData?.home_type === "condo" ? "your condo"
    : homeData?.home_type === "townhouse" ? "your townhouse"
    : "your home";

  // ── Buddy message ──────────────────────────────────────────────────────────
  const getBuddyMessage = () => {
    const name = getUserName();
    const overdue = homeTasks.filter(t => getUrgency(t) === "overdue");
    const soon    = homeTasks.filter(t => getUrgency(t) === "soon");
    const inspect = homeTasks.filter(t => getUrgency(t) === "inspect");

    if (overdue.length > 0) {
      const t = overdue[0];
      const daysOver = Math.abs(getDaysRemaining(t) ?? 0);
      const howLong = daysOver >= 30
        ? `about ${Math.round(daysOver / 30)} month${Math.round(daysOver / 30) > 1 ? "s" : ""}`
        : daysOver > 1 ? `${daysOver} days` : "a bit";
      const extra = overdue.length > 1 ? ` You've got ${overdue.length - 1} other thing${overdue.length > 2 ? "s" : ""} past due too.` : "";
      return `${name}, the ${t.name.toLowerCase()} for ${homeLabel} is ${howLong} overdue.${extra} That's the one to tackle first.`;
    }
    if (soon.length > 0) {
      const t = soon[0];
      const days = getDaysRemaining(t);
      const timeStr = days != null && days <= 3 ? "very soon" : days != null && days <= 7 ? "this week" : days != null ? `in about ${days} days` : "soon";
      const extra = soon.length > 1 ? ` ${soon.length - 1} other task${soon.length > 2 ? "s" : ""} coming up too.` : "";
      return `${name}, your ${t.name.toLowerCase()} is due ${timeStr}.${extra} Good time to get ahead of it.`;
    }
    if (inspect.length > 0) {
      return inspect.length === 1
        ? `${name}, flag the ${inspect[0].name.toLowerCase()} at your next service visit — nothing urgent, just worth getting eyes on it.`
        : `${name}, you've got ${inspect.length} things worth flagging at your next service visit. Nothing alarming — just log them when you can.`;
    }
    return `${homeLabel.charAt(0).toUpperCase() + homeLabel.slice(1)} is in great shape, ${name}! Everything's on schedule and nothing needs attention right now.`;
  };

  // ── Seasonal strip ─────────────────────────────────────────────────────────
  const currentSeason = getCurrentSeason();
  const nextSeason    = getNextSeason(currentSeason);
  const upcomingTasks = homeTasks.filter(t =>
    (t.seasonal === currentSeason || t.seasonal === nextSeason) &&
    getUrgency(t) !== "overdue"
  ).slice(0, 6);

  // ── Filtering & grouping ───────────────────────────────────────────────────
  const filteredTasks = homeTasks.filter(t => {
    if (filter === "due") return ["overdue","soon","inspect"].includes(getUrgency(t));
    if (filter === "ok")  return getUrgency(t) === "ok";
    return true;
  });

  const STATUS_GROUPS = [
    { key: "overdue", label: "Needs Attention",   icon: "🔴" },
    { key: "soon",    label: "Due Soon",           icon: "🟡" },
    { key: "inspect", label: "Inspect at Service", icon: "🔵" },
    { key: "ok",      label: "On Track",           icon: "🟢" },
  ];

  const tasksInGroup = (key) =>
    filteredTasks
      .filter(t => getUrgency(t) === key)
      .sort((a, b) => {
        const dA = getDaysRemaining(a) ?? Infinity;
        const dB = getDaysRemaining(b) ?? Infinity;
        return dA - dB;
      });

  const urgencyAccent = { overdue: C.red,    soon: C.amber,    inspect: C.purple,    ok: C.green    };
  const urgencyBg     = { overdue: C.redLight, soon: C.amberLight, inspect: C.purpleLight, ok: C.greenLight };
  const urgencyText   = { overdue: C.red,    soon: C.amberDark, inspect: C.purple,    ok: C.greenDark };

  const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 };

  // ── Toggle history ─────────────────────────────────────────────────────────
  const toggleHistory = async (task) => {
    if (!task.id) return;
    const next = new Set(expandedTasks);
    if (next.has(task.id)) {
      next.delete(task.id);
      setExpandedTasks(next);
      return;
    }
    next.add(task.id);
    setExpandedTasks(next);
    if (taskLogs[task.id]) return;
    setTaskLogs(prev => ({ ...prev, [task.id]: { loading: true, logs: [] } }));
    const { data } = await supabase
      .from("home_service_logs")
      .select("*")
      .eq("task_id", task.id)
      .order("service_date", { ascending: false })
      .limit(10);
    setTaskLogs(prev => ({ ...prev, [task.id]: { loading: false, logs: data || [] } }));
  };

  // ── Dismiss task ───────────────────────────────────────────────────────────
  const dismissTask = async (taskId) => {
    await supabase.from("home_maintenance_tasks").update({ status: "dismissed" }).eq("id", taskId);
    onHomeTasksUpdate(homeTasks.filter(t => t.id !== taskId));
    setDismissConfirm(null);
  };

  // ── Add task ──────────────────────────────────────────────────────────────
  const handleTaskAdded = (newTask) => {
    onHomeTasksUpdate([newTask, ...homeTasks]);
    setShowAddTask(false);
  };

  // ── Log saved ──────────────────────────────────────────────────────────────
  const handleLogSaved = async (serviceDate) => {
    if (!logTask) return;
    const { data: refreshed } = await supabase
      .from("home_maintenance_tasks")
      .select("*")
      .eq("home_id", homeData.id)
      .eq("status", "active");
    if (refreshed) onHomeTasksUpdate(refreshed);
    if (logTask?.id) setTaskLogs(prev => ({ ...prev, [logTask.id]: undefined }));
    setLogTask(null);
  };

  const toggleGroup = (key) => {
    const next = new Set(collapsedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedGroups(next);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 80, ...bodyFont, color: C.textPrimary }}>

      {/* ── Top bar ── */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: C.textSecondary }}>{getGreeting()}, {getUserName()} 👋</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>
              🏠 {homeData?.nickname
                ? homeData.nickname
                : `${homeData?.year_built ? `${homeData.year_built} ` : ""}${homeData?.home_type === "single_family" ? "Home" : homeData?.home_type === "condo" ? "Condo" : homeData?.home_type === "townhouse" ? "Townhouse" : "Home"}${homeData?.state ? ` · ${homeData.state}` : ""}`
              }
            </div>
            {homeData?._sharedByName && (
              <span style={{
                fontSize: "0.7rem", fontWeight: 600, color: C.green,
                background: "#E8F5EF", border: `1px solid #B2DEC8`,
                borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                whiteSpace: "nowrap",
              }}>
                Shared by {homeData._sharedByName}
              </span>
            )}
            {!homeData?._sharedByName && (
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
        <div onClick={() => setShowProfile(true)} style={{
          width: 38, height: 38, background: C.green, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: "1rem", cursor: "pointer", flexShrink: 0,
        }}>{getUserInitial()}</div>
      </div>

      <div style={{ padding: "0 16px", maxWidth: 480, margin: "0 auto" }}>

        {/* ── Buddy strip ── */}
        <div style={{
          margin: "14px 0 12px",
          background: "linear-gradient(135deg, #E85D1F 0%, #FF7A35 60%, #FF9455 100%)",
          borderRadius: 16, padding: "14px 16px",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>🏠</span>
          <p style={{ margin: 0, color: "white", fontSize: "0.9rem", lineHeight: 1.6, fontWeight: 400 }}>
            {getBuddyMessage()}
          </p>
        </div>

        {/* ── Health ring ── */}
        <div style={{ ...cardStyle, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r={RING_R} fill="none" stroke={C.border} strokeWidth="7" />
              <circle
                cx="44" cy="44" r={RING_R} fill="none"
                stroke={ringColor} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset}
                transform="rotate(-90 44 44)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
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

        {/* ── Seasonal strip ── */}
        {upcomingTasks.length > 0 && (
          <div style={{ ...cardStyle, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: "0.72rem", color: C.textSecondary, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              {SEASON_NAMES[currentSeason]} tasks coming up
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {upcomingTasks.map(t => {
                const u = getUrgency(t);
                const pillBg    = u === "overdue" ? C.redLight    : u === "soon" ? C.amberLight : C.greenLight;
                const pillColor = u === "overdue" ? C.red         : u === "soon" ? C.amberDark  : C.greenDark;
                const pillBdr   = u === "overdue" ? "#FECACA"     : u === "soon" ? "#FDE68A"    : "#BBF7D0";
                return (
                  <span key={t.id} style={{
                    fontSize: "0.75rem", fontWeight: 600,
                    padding: "4px 10px", borderRadius: 999,
                    background: pillBg, color: pillColor,
                    border: `1px solid ${pillBdr}`,
                  }}>
                    {getHomeTaskIcon(t.name)} {t.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

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
            const isCollapsed = collapsedGroups.has(key);

            return (
              <div key={key}>
                <button onClick={() => toggleGroup(key)} style={{
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

                {!isCollapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {groupTasks.map((task, i) => {
                      const urgency    = getUrgency(task);
                      const health     = getHealth(task);
                      const days       = getDaysRemaining(task);
                      const isExpanded = task.id && expandedTasks.has(task.id);
                      const accent     = urgencyAccent[urgency];
                      const needsLog   = urgency === "overdue" || urgency === "soon";
                      const barColor   = urgency === "overdue" ? "#EF4444" : urgency === "soon" ? "#F59E0B" : "#4CAF82";
                      const detailText = urgency === "inspect"
                        ? "Inspect at your next service visit"
                        : formatInterval(task.interval_days);

                      return (
                        <div key={task.id || i} style={{
                          background: C.card, border: `1px solid ${C.border}`,
                          borderRadius: 16, overflow: "hidden",
                          borderLeft: `4px solid ${accent}`,
                        }}>
                          <div style={{ padding: "14px 14px 12px 12px" }}>

                            {/* Top row */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                              <div style={{
                                width: 40, height: 40, borderRadius: "50%",
                                background: urgencyBg[urgency], flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 18,
                              }}>{getHomeTaskIcon(task.name)}</div>

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

                            {/* Detail text */}
                            {detailText && (
                              <div style={{ fontSize: "0.8rem", color: C.textSecondary, paddingLeft: 50, marginBottom: urgency !== "inspect" ? 10 : 0 }}>
                                {detailText}
                                {task.seasonal && task.seasonal !== "year_round" && (
                                  <span style={{ marginLeft: 6, fontSize: "0.72rem", color: SEASON_COLORS[task.seasonal] || C.textSecondary }}>
                                    · {SEASON_NAMES[task.seasonal]}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Progress bar */}
                            {urgency !== "inspect" && task.interval_days && (
                              <div style={{ paddingLeft: 50, marginBottom: needsLog ? 12 : 0 }}>
                                <div style={{ height: 6, borderRadius: 3, background: "#ECEEF2", overflow: "hidden", marginBottom: 4 }}>
                                  <div style={{ height: "100%", borderRadius: 3, width: `${health}%`, background: barColor, transition: "width 0.4s ease" }} />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ fontSize: "0.72rem", color: C.textSecondary }}>
                                    {days !== null
                                      ? days <= 0
                                        ? `${Math.abs(days)} days overdue`
                                        : days === 0 ? "Due today"
                                        : `${days} days until due`
                                      : ""}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: urgencyText[urgency] }}>{health}%</span>
                                </div>
                              </div>
                            )}

                            {/* Action button — always rendered */}
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
                                  >{isFlashing ? "🎉 Logged!" : "DONE ✓"}</button>
                                );
                              }
                              if (urgency === "inspect") {
                                return (
                                  <div style={{ marginTop: 4 }}>
                                    <button
                                      className="btn-log-pill-purple"
                                      onClick={handlePress}
                                      style={{ animation: isFlashing ? "logBounce 0.55s ease forwards" : "none" }}
                                    >{isFlashing ? "🎉 Logged!" : "🔍 Log inspection"}</button>
                                  </div>
                                );
                              }
                              return (
                                <div style={{ marginTop: 4 }}>
                                  <button
                                    className="btn-log-pill-orange"
                                    onClick={handlePress}
                                    style={{ animation: isFlashing ? "logBounce 0.55s ease forwards" : "none" }}
                                  >{isFlashing ? "🎉 Logged!" : "Log service ✓"}</button>
                                </div>
                              );
                            })()}

                            {/* History toggle */}
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

                          {/* Expanded history panel */}
                          {isExpanded && (
                            <div style={{ background: "#F8F9FB", borderTop: `1px solid ${C.border}`, padding: "14px 14px 16px" }}>
                              {taskLogs[task.id]?.loading ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.textSecondary }}>
                                  <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderTopColor: C.orange, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                                  <span style={{ fontSize: "0.8rem" }}>Loading…</span>
                                </div>
                              ) : !taskLogs[task.id]?.logs?.length ? (
                                <p style={{ margin: 0, fontSize: "0.8125rem", color: C.textSecondary, textAlign: "center", padding: "8px 0" }}>
                                  📋 No records yet. Log your first service to start tracking.
                                </p>
                              ) : (
                                <div>
                                  {taskLogs[task.id].logs.map((log, idx) => (
                                    <div key={log.id} style={{ display: "flex", gap: 10, paddingBottom: 14 }}>
                                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: idx === 0 ? C.orange : C.border, flexShrink: 0, marginTop: 3 }} />
                                      <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: C.textPrimary }}>{formatDate(log.service_date)}</span>
                                          {log.cost && <span style={{ fontSize: "0.75rem", color: C.textSecondary, marginLeft: "auto" }}>${parseFloat(log.cost).toFixed(2)}</span>}
                                        </div>
                                        {log.notes && <div style={{ fontSize: "0.78rem", color: C.textSecondary, fontStyle: "italic" }}>{log.notes}</div>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
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

        {homeTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.textSecondary }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏡</div>
            <p>No home tasks yet.</p>
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

      {/* ── Tab bar ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: C.card, borderTop: `1px solid ${C.border}`,
        display: "flex", paddingBottom: "env(safe-area-inset-bottom)",
        maxWidth: 480, margin: "0 auto",
      }}>
        {[
          { id: "home", label: "Home", icon: (a) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.8" fill={a ? "currentColor" : "none"} fillOpacity={a ? 0.15 : 0}/>
              <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )},
          { id: "add", label: "Add", icon: () => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )},
        ].map(tab => {
          const isActive = activeTab === tab.id && tab.id !== "add";
          return (
            <button key={tab.id} onClick={() => {
              if (tab.id === "add") { onAddAsset(); return; }
              if (tab.id === "home") { onGoHome?.(); return; }
              setActiveTab(tab.id);
            }} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3,
              padding: "10px 0", background: "none", border: "none",
              cursor: "pointer", color: isActive ? C.green : C.textSecondary,
              transition: "color 0.15s ease",
            }}>
              {tab.icon(isActive)}
              <span style={{ fontSize: "0.64rem", fontWeight: isActive ? 600 : 400, ...bodyFont }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Service log modal ── */}
      {showProfile && (
        <ProfileSheet
          session={session} profile={profile}
          onClose={() => setShowProfile(false)}
          onProfileSaved={onProfileUpdate}
          onVehicleUpdated={onVehicleUpdated}
          onHomeUpdated={onHomeUpdate}
          onVehicleDeleted={onVehicleDeleted}
          onHomeDeleted={onHomeDeleted}
        />
      )}
      {showEdit && (
        <EditHomeModal
          session={session} homeData={homeData}
          onSaved={(updated) => { onHomeUpdate(updated); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      )}
      {logTask && (
        <HomeServiceLogModal
          session={session} homeData={homeData} task={logTask}
          onSaved={handleLogSaved} onClose={() => setLogTask(null)}
        />
      )}
      {showAddTask && (
        <AddTaskModal
          session={session}
          assetType="home"
          homeData={homeData}
          onSaved={handleTaskAdded}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
