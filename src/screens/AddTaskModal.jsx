import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";

const C = {
  bg: "#F5F7FA", card: "#FFFFFF", border: "#ECEEF2",
  orange: "#FF7A35", orangeLight: "#FFF0E8", orangeDark: "#CC5A1F",
  green: "#4CAF82", greenLight: "#E8F5EF", greenDark: "#2D7A57",
  textPrimary: "#1A1D23", textSecondary: "#8E95A3",
  red: "#EF4444", redLight: "#FEE2E2",
  amber: "#F59E0B", amberLight: "#FEF3C7",
  purple: "#7C6CD0", purpleLight: "#EDE9FB",
};

const VEHICLE_CATEGORIES = ["Engine", "Tires", "Brakes", "Fluids", "Filters", "Electrical", "Inspection", "Other"];
const HOME_CATEGORIES    = ["HVAC", "Plumbing", "Electrical", "Roof & Gutters", "Safety", "Exterior", "Appliances", "Other"];

const INTERVAL_OPTIONS = [
  { label: "1 month",   days: 30  },
  { label: "2 months",  days: 60  },
  { label: "3 months",  days: 90  },
  { label: "6 months",  days: 180 },
  { label: "1 year",    days: 365 },
  { label: "2 years",   days: 730 },
];

const formatIntervalLabel = (task) => {
  if (task.inspect_at_next_visit || task.interval_type === "inspect") return "Inspect at next visit";
  if (task.interval_miles) return `Every ${task.interval_miles.toLocaleString()} miles`;
  if (task.interval_days) {
    const opt = INTERVAL_OPTIONS.find(o => o.days === task.interval_days);
    return opt ? opt.label : `Every ${task.interval_days} days`;
  }
  return "Custom";
};

const AVG_MILES_PER_MONTH = 1200;

export default function AddTaskModal({ session, assetType, vehicleData, homeData, onSaved, onClose }) {
  const isVehicle = assetType === "vehicle";
  const accent      = isVehicle ? C.orange : C.green;
  const accentLight = isVehicle ? C.orangeLight : C.greenLight;
  const accentDark  = isVehicle ? C.orangeDark : C.greenDark;
  const categories  = isVehicle ? VEHICLE_CATEGORIES : HOME_CATEGORIES;
  const bodyFont    = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  // ── AI flow state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState("input"); // input | chatting | confirm | manual
  const [taskInput, setTaskInput]   = useState("");
  const [displayMsgs, setDisplayMsgs] = useState([]); // { role:"user"|"ai", content }
  const [apiMsgs, setApiMsgs]         = useState([]); // { role:"user"|"assistant", content }
  const [userReply, setUserReply]     = useState("");
  const [aiLoading, setAiLoading]     = useState(false);
  const [finalTask, setFinalTask]     = useState(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const chatEndRef = useRef(null);

  // ── Manual form state ────────────────────────────────────────────────────────
  const [manualName,     setManualName]     = useState("");
  const [manualCategory, setManualCategory] = useState(categories[0]);
  const [intervalType,   setIntervalType]   = useState("time");
  const [intervalMiles,  setIntervalMiles]  = useState("");
  const [lastMileage,    setLastMileage]    = useState("");
  const [intervalDays,   setIntervalDays]   = useState(180);
  const [lastDate,       setLastDate]       = useState("");
  const [priority,       setPriority]       = useState("medium");
  const [isSafety,       setIsSafety]       = useState(false);
  const [manualSaving,   setManualSaving]   = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMsgs, aiLoading]);

  // ── System prompt ────────────────────────────────────────────────────────────
  const buildSystem = (name) => {
    let ctx;
    if (isVehicle && vehicleData) {
      ctx = `vehicle: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}${vehicleData.trim ? " " + vehicleData.trim : ""}, ${vehicleData.current_mileage} miles`;
    } else if (homeData) {
      ctx = `home: ${homeData.state || "unknown state"}, ${homeData.climate_zone || "unknown climate"}, ${homeData.home_type || "house"}`;
    }
    return `You are a maintenance expert. The user wants to add a maintenance task to their [${ctx}]. They typed: '${name}'. Ask at most 2 short friendly questions to determine the correct maintenance interval, then respond with this exact JSON:
{"name":"<task name>","category":"<category>","interval_type":"<mileage|time|inspect>","interval_miles":<number|null>,"interval_days":<number|null>,"priority":"<high|medium|low>","is_safety_critical":<boolean>,"inspect_at_next_visit":<boolean>,"description":"<one sentence why this matters>","suggested_message":"<friendly 1-sentence confirmation to show the user>"}
Return JSON only when you have enough information. While asking questions return: {"status":"asking","message":"<your question>"}. Keep questions very short and conversational.`;
  };

  const callClaude = async (msgs, taskName) => {
    const res = await fetch("/api/anthropic/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        system: buildSystem(taskName || taskInput),
        messages: msgs,
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  };

  const parseAI = (text) => {
    try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return null; }
  };

  const handleAIResponse = (text, prevDisplay, prevApi) => {
    const parsed = parseAI(text);
    if (parsed && !parsed.status) {
      setDisplayMsgs([...prevDisplay, { role: "ai", content: parsed.suggested_message || "Here's your task — looks good?" }]);
      setApiMsgs([...prevApi, { role: "assistant", content: text }]);
      setFinalTask(parsed);
      setStep("confirm");
    } else if (parsed?.status === "asking") {
      setDisplayMsgs([...prevDisplay, { role: "ai", content: parsed.message }]);
      setApiMsgs([...prevApi, { role: "assistant", content: text }]);
    } else {
      // fallback: create inspect task
      const fallback = { name: taskInput, category: categories[0], interval_type: "inspect", interval_miles: null, interval_days: null, priority: "medium", is_safety_critical: false, inspect_at_next_visit: true, description: "Custom task added by user.", suggested_message: "I'll add this as an inspection item so it shows up at your next service visit." };
      setDisplayMsgs([...prevDisplay, { role: "ai", content: fallback.suggested_message }]);
      setFinalTask(fallback);
      setStep("confirm");
    }
  };

  const startConversation = async () => {
    const name = taskInput.trim();
    if (!name) return;
    setStep("chatting");
    setAiLoading(true);
    setError("");
    const initUser = { role: "user", content: name };
    const initDisplay = [{ role: "user", content: name }];
    setDisplayMsgs(initDisplay);
    try {
      const text = await callClaude([initUser], name);
      handleAIResponse(text, initDisplay, [initUser]);
    } catch {
      setError("Couldn't connect to AI. Use the manual form below.");
    }
    setAiLoading(false);
  };

  const sendReply = async () => {
    const reply = userReply.trim();
    if (!reply || aiLoading) return;
    setUserReply("");
    setAiLoading(true);
    const newDisplay = [...displayMsgs, { role: "user", content: reply }];
    const newApi     = [...apiMsgs,     { role: "user", content: reply }];
    setDisplayMsgs(newDisplay);
    try {
      const text = await callClaude(newApi, taskInput);
      handleAIResponse(text, newDisplay, newApi);
    } catch {
      setError("Couldn't connect. Try the manual form.");
    }
    setAiLoading(false);
  };

  // ── Save helpers ─────────────────────────────────────────────────────────────
  const calcDueDates = ({ interval_miles, interval_days, last_completed_miles, inspect_at_next_visit }) => {
    if (inspect_at_next_visit) return { next_due_miles: null, next_due_at: null };
    const now = new Date();
    const currentMiles = parseInt(vehicleData?.current_mileage) || 0;
    let next_due_miles = null, next_due_at = null;
    if (interval_miles) {
      const fromMiles = last_completed_miles || currentMiles;
      next_due_miles = fromMiles + interval_miles;
      const milesUntilDue = next_due_miles - currentMiles;
      const d = new Date(now);
      d.setDate(d.getDate() + Math.round((milesUntilDue / AVG_MILES_PER_MONTH) * 30));
      next_due_at = d.toISOString();
    } else if (interval_days) {
      const d = new Date(now);
      d.setDate(d.getDate() + interval_days);
      next_due_at = d.toISOString();
    }
    return { next_due_miles, next_due_at };
  };

  const buildRow = (task, extra = {}) => {
    const { next_due_miles, next_due_at } = calcDueDates(task);
    const inspect = task.inspect_at_next_visit || false;

    if (isVehicle) {
      return {
        table: "maintenance_tasks",
        row: {
          vehicle_id: vehicleData.id,
          asset_type: "vehicle",
          user_id: session.user.id,
          name: task.name,
          category: task.category,
          description: task.description || "",
          priority: task.priority || "medium",
          is_safety_critical: task.is_safety_critical || false,
          interval_type: task.interval_type || "inspect",
          interval_miles: task.interval_miles || null,
          interval_days: task.interval_days || null,
          last_completed_miles: task.last_completed_miles || null,
          next_due_miles,
          next_due_at,
          using_conservative_default: false,
          status: "active",
          ...extra,
        },
        inspect,
      };
    }

    // Home — different schema, no mileage columns
    return {
      table: "home_maintenance_tasks",
      row: {
        home_id: homeData.id,
        user_id: session.user.id,
        name: task.name,
        category: task.category || "Other",
        description: task.description || "",
        interval_days: task.interval_days || 365,
        seasonal: "year_round",
        priority: task.priority || "medium",
        is_safety_critical: task.is_safety_critical || false,
        inspect_at_next_visit: inspect,
        last_completed_at: null,
        next_due_at: inspect ? null : next_due_at,
        status: "active",
        ...extra,
      },
      inspect,
    };
  };

  const persist = async (taskDef, manualExtra = {}) => {
    const { table, row, inspect } = buildRow(taskDef, manualExtra);
    const { data, error: e } = await supabase.from(table).insert(row).select().single();
    if (e) throw e;
    return { ...data, inspect_at_next_visit: inspect };
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await persist(finalTask);
      onSaved(saved);
    } catch { setError("Couldn't save — please try again."); }
    setSaving(false);
  };

  const switchToManual = () => {
    if (finalTask) {
      setManualName(finalTask.name || taskInput);
      setManualCategory(finalTask.category || categories[0]);
      setPriority(finalTask.priority || "medium");
      setIsSafety(finalTask.is_safety_critical || false);
      if (finalTask.interval_type === "mileage") {
        setIntervalType("mileage");
        setIntervalMiles(finalTask.interval_miles || "");
      } else if (finalTask.interval_type === "inspect") {
        setIntervalType("inspect");
      } else {
        setIntervalType("time");
        const opt = INTERVAL_OPTIONS.find(o => o.days === finalTask.interval_days);
        setIntervalDays(opt ? opt.days : 180);
      }
    } else {
      setManualName(taskInput || "");
    }
    setStep("manual");
  };

  const handleManualSave = async () => {
    if (!manualName.trim()) return;
    setManualSaving(true);
    setError("");
    try {
      const fromDate = lastDate ? new Date(lastDate + "T12:00:00") : new Date();
      let taskDef = {
        name: manualName.trim(),
        category: manualCategory,
        priority,
        is_safety_critical: isSafety,
        description: "",
        inspect_at_next_visit: intervalType === "inspect",
        interval_type: intervalType,
        interval_miles: intervalType === "mileage" ? (parseInt(intervalMiles) || null) : null,
        interval_days: intervalType === "time" ? intervalDays : null,
        last_completed_miles: intervalType === "mileage" ? (parseInt(lastMileage) || null) : null,
      };
      // For time-based with last date: override due date calculation
      let extra = {};
      if (intervalType === "time" && lastDate && intervalDays) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + intervalDays);
        extra.next_due_at = d.toISOString();
      }
      const saved = await persist(taskDef, extra);
      onSaved(saved);
    } catch { setError("Couldn't save — please try again."); }
    setManualSaving(false);
  };

  // ── Sub-renders ──────────────────────────────────────────────────────────────
  const ChatBubble = ({ msg }) => {
    const isUser = msg.role === "user";
    return (
      <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 10 }}>
        {!isUser && (
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginRight: 8, marginTop: 2,
            background: accent, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: "white",
          }}>M</div>
        )}
        <div style={{
          maxWidth: "78%", padding: "9px 13px", borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? accent : C.card,
          color: isUser ? "white" : C.textPrimary,
          border: isUser ? "none" : `1px solid ${C.border}`,
          fontSize: "0.875rem", lineHeight: 1.45,
        }}>{msg.content}</div>
      </div>
    );
  };

  const TypingDots = () => (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginRight: 8, marginTop: 2,
        background: accent, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 800, color: "white",
      }}>M</div>
      <div style={{
        padding: "12px 16px", borderRadius: "16px 16px 16px 4px",
        background: C.card, border: `1px solid ${C.border}`,
        display: "flex", gap: 5, alignItems: "center",
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: C.textSecondary,
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );

  const Chip = ({ label, active, onClick, color }) => (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${active ? (color || accent) : C.border}`,
      background: active ? (color ? color + "18" : accentLight) : C.card,
      color: active ? (color || accent) : C.textSecondary,
      fontWeight: active ? 700 : 500, fontSize: "0.8rem",
      cursor: "pointer", ...bodyFont, flexShrink: 0,
    }}>{label}</button>
  );

  // ── Main modal shell ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div
        onClick={(e) => e.target === e.currentTarget && onClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "flex-end" }}
      >
        <div style={{
          width: "100%", maxWidth: 480, margin: "0 auto",
          background: C.bg, borderRadius: "20px 20px 0 0",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          animation: "slideUp 0.28s ease",
          ...bodyFont,
        }}>
          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
          </div>

          {/* Header */}
          <div style={{ padding: "8px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: C.textPrimary }}>
                {step === "manual" ? "Add task manually" : "Add a task"}
              </div>
              {step !== "manual" && (
                <div style={{ fontSize: "0.78rem", color: C.textSecondary, marginTop: 1 }}>
                  Buddy will figure out the right interval
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textSecondary, fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
          </div>

          {/* ── STEP: input ── */}
          {step === "input" && (
            <div style={{ padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                autoFocus
                value={taskInput}
                onChange={e => setTaskInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && startConversation()}
                placeholder="What do you want to track?"
                style={{
                  width: "100%", padding: "13px 14px", borderRadius: 12,
                  border: `1.5px solid ${C.border}`, background: C.card,
                  fontSize: "0.9375rem", color: C.textPrimary,
                  outline: "none", boxSizing: "border-box", ...bodyFont,
                }}
              />
              <button
                onClick={startConversation}
                disabled={!taskInput.trim()}
                style={{
                  width: "100%", padding: "13px", borderRadius: 12, border: "none",
                  background: taskInput.trim() ? accent : C.border,
                  color: taskInput.trim() ? "white" : C.textSecondary,
                  fontWeight: 700, fontSize: "0.9375rem", cursor: taskInput.trim() ? "pointer" : "default",
                  ...bodyFont,
                }}
              >Continue</button>
              <button onClick={switchToManual} style={{
                background: "none", border: "none", cursor: "pointer",
                color: C.textSecondary, fontSize: "0.8rem", textDecoration: "underline",
                ...bodyFont, padding: 0, textAlign: "center",
              }}>Set manually instead</button>
            </div>
          )}

          {/* ── STEP: chatting ── */}
          {step === "chatting" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
                {displayMsgs.map((msg, i) => <ChatBubble key={i} msg={msg} />)}
                {aiLoading && <TypingDots />}
                {error && (
                  <div style={{ fontSize: "0.8rem", color: C.red, textAlign: "center", marginTop: 8 }}>{error}</div>
                )}
                <div ref={chatEndRef} />
              </div>
              {!aiLoading && !error && (
                <div style={{ padding: "8px 16px 20px", borderTop: `1px solid ${C.border}`, background: C.bg, display: "flex", gap: 8 }}>
                  <input
                    autoFocus
                    value={userReply}
                    onChange={e => setUserReply(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendReply()}
                    placeholder="Type your answer…"
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 10,
                      border: `1.5px solid ${C.border}`, background: C.card,
                      fontSize: "0.875rem", color: C.textPrimary,
                      outline: "none", ...bodyFont,
                    }}
                  />
                  <button onClick={sendReply} style={{
                    padding: "10px 16px", borderRadius: 10, border: "none",
                    background: accent, color: "white", fontWeight: 700,
                    fontSize: "0.875rem", cursor: "pointer", ...bodyFont,
                  }}>Send</button>
                </div>
              )}
              {(error) && (
                <div style={{ padding: "8px 16px 20px", textAlign: "center" }}>
                  <button onClick={switchToManual} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: accent, fontSize: "0.85rem", fontWeight: 600,
                    textDecoration: "underline", ...bodyFont,
                  }}>Set manually instead</button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: confirm ── */}
          {step === "confirm" && finalTask && (
            <div style={{ padding: "0 16px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Task summary card */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: C.textPrimary, flex: 1, marginRight: 8 }}>
                    {finalTask.name}
                  </div>
                  <span style={{
                    fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                    background: finalTask.priority === "high" ? C.redLight : finalTask.priority === "medium" ? C.amberLight : C.greenLight,
                    color: finalTask.priority === "high" ? C.red : finalTask.priority === "medium" ? C.amber : C.green,
                  }}>{(finalTask.priority || "medium").charAt(0).toUpperCase() + (finalTask.priority || "medium").slice(1)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.78rem", background: accentLight, color: accentDark, padding: "3px 10px", borderRadius: 999, fontWeight: 600 }}>
                    {formatIntervalLabel(finalTask)}
                  </span>
                  <span style={{ fontSize: "0.78rem", background: C.bg, color: C.textSecondary, padding: "3px 10px", borderRadius: 999 }}>
                    {finalTask.category}
                  </span>
                  {finalTask.is_safety_critical && (
                    <span style={{ fontSize: "0.78rem", background: C.redLight, color: C.red, padding: "3px 10px", borderRadius: 999, fontWeight: 600 }}>
                      Safety critical
                    </span>
                  )}
                </div>
                {finalTask.description && (
                  <div style={{ fontSize: "0.8rem", color: C.textSecondary, lineHeight: 1.4 }}>{finalTask.description}</div>
                )}
              </div>

              {error && <div style={{ fontSize: "0.8rem", color: C.red, textAlign: "center" }}>{error}</div>}

              <button
                onClick={handleConfirmSave}
                disabled={saving}
                style={{
                  width: "100%", padding: "13px", borderRadius: 12, border: "none",
                  background: accent, color: "white", fontWeight: 700,
                  fontSize: "0.9375rem", cursor: saving ? "default" : "pointer", ...bodyFont,
                  opacity: saving ? 0.7 : 1,
                }}
              >{saving ? "Saving…" : "Save task"}</button>

              <button onClick={switchToManual} style={{
                background: "none", border: "none", cursor: "pointer",
                color: C.textSecondary, fontSize: "0.8rem", textDecoration: "underline",
                ...bodyFont, padding: 0, textAlign: "center",
              }}>Edit manually instead</button>
            </div>
          )}

          {/* ── STEP: manual ── */}
          {step === "manual" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Name */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: C.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Task name *</label>
                <input
                  autoFocus
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Cabin air filter"
                  style={{
                    width: "100%", padding: "11px 13px", borderRadius: 10,
                    border: `1.5px solid ${C.border}`, background: C.card,
                    fontSize: "0.9rem", color: C.textPrimary, outline: "none",
                    boxSizing: "border-box", ...bodyFont,
                  }}
                />
              </div>

              {/* Category */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: C.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</label>
                <select
                  value={manualCategory}
                  onChange={e => setManualCategory(e.target.value)}
                  style={{
                    width: "100%", padding: "11px 13px", borderRadius: 10,
                    border: `1.5px solid ${C.border}`, background: C.card,
                    fontSize: "0.875rem", color: C.textPrimary, outline: "none",
                    boxSizing: "border-box", ...bodyFont, appearance: "none",
                  }}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Interval type */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: C.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Interval</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {isVehicle && <Chip label="By mileage" active={intervalType === "mileage"} onClick={() => setIntervalType("mileage")} />}
                  <Chip label="By time" active={intervalType === "time"} onClick={() => setIntervalType("time")} />
                  <Chip label="Inspect" active={intervalType === "inspect"} onClick={() => setIntervalType("inspect")} />
                </div>
              </div>

              {intervalType === "mileage" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", color: C.textSecondary, marginBottom: 5 }}>Every (miles)</label>
                    <input
                      type="number" inputMode="numeric"
                      value={intervalMiles}
                      onChange={e => setIntervalMiles(e.target.value)}
                      placeholder="e.g. 5000"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.card, fontSize: "0.875rem", color: C.textPrimary, outline: "none", boxSizing: "border-box", ...bodyFont }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", color: C.textSecondary, marginBottom: 5 }}>Last done at (mi)</label>
                    <input
                      type="number" inputMode="numeric"
                      value={lastMileage}
                      onChange={e => setLastMileage(e.target.value)}
                      placeholder="Optional"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.card, fontSize: "0.875rem", color: C.textPrimary, outline: "none", boxSizing: "border-box", ...bodyFont }}
                    />
                  </div>
                </div>
              )}

              {intervalType === "time" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", color: C.textSecondary, marginBottom: 5 }}>Frequency</label>
                    <select
                      value={intervalDays}
                      onChange={e => setIntervalDays(parseInt(e.target.value))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.card, fontSize: "0.875rem", color: C.textPrimary, outline: "none", boxSizing: "border-box", ...bodyFont, appearance: "none" }}
                    >
                      {INTERVAL_OPTIONS.map(o => <option key={o.days} value={o.days}>{o.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", color: C.textSecondary, marginBottom: 5 }}>Last done (optional)</label>
                    <input
                      type="date"
                      value={lastDate}
                      onChange={e => setLastDate(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.card, fontSize: "0.875rem", color: C.textPrimary, outline: "none", boxSizing: "border-box", ...bodyFont }}
                    />
                  </div>
                </div>
              )}

              {intervalType === "inspect" && (
                <div style={{ background: C.purpleLight, borderRadius: 10, padding: "10px 12px", fontSize: "0.8rem", color: C.purple }}>
                  This will appear as "Inspect at next visit" on your dashboard.
                </div>
              )}

              {/* Priority */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: C.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Priority</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <Chip label="High"   active={priority === "high"}   onClick={() => setPriority("high")}   color={C.red} />
                  <Chip label="Medium" active={priority === "medium"} onClick={() => setPriority("medium")} color={C.amber} />
                  <Chip label="Low"    active={priority === "low"}    onClick={() => setPriority("low")}    color={C.green} />
                </div>
              </div>

              {/* Safety critical */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary }}>Safety critical</div>
                  <div style={{ fontSize: "0.75rem", color: C.textSecondary, marginTop: 1 }}>Affects braking, steering, or visibility</div>
                </div>
                <div
                  onClick={() => setIsSafety(p => !p)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, cursor: "pointer",
                    background: isSafety ? accent : C.border,
                    position: "relative", transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 3, left: isSafety ? 21 : 3,
                    width: 20, height: 20, borderRadius: "50%", background: "white",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
              </div>

              {error && <div style={{ fontSize: "0.8rem", color: C.red, textAlign: "center" }}>{error}</div>}

              <button
                onClick={handleManualSave}
                disabled={!manualName.trim() || manualSaving}
                style={{
                  width: "100%", padding: "13px", borderRadius: 12, border: "none",
                  background: manualName.trim() ? accent : C.border,
                  color: manualName.trim() ? "white" : C.textSecondary,
                  fontWeight: 700, fontSize: "0.9375rem",
                  cursor: manualName.trim() ? "pointer" : "default",
                  opacity: manualSaving ? 0.7 : 1, ...bodyFont,
                }}
              >{manualSaving ? "Saving…" : "Save task"}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
