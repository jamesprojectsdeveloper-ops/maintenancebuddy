import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function HomeServiceLogModal({ session, homeData, task, onSaved, onClose }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ service_date: today, notes: "", cost: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.service_date) {
      setError("Please enter the date.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      try {
        await supabase.from("home_service_logs").insert({
          user_id: session.user.id,
          home_id: homeData.id,
          task_id: task.id || null,
          task_name: task.name,
          service_date: form.service_date,
          notes: form.notes || null,
          cost: form.cost ? parseFloat(form.cost) : null,
        });
      } catch {
        // table may not exist yet
      }

      if (task.id && task.interval_days) {
        const dueDate = new Date(form.service_date);
        dueDate.setDate(dueDate.getDate() + task.interval_days);

        await supabase.from("home_maintenance_tasks").update({
          last_completed_at: form.service_date,
          next_due_at: dueDate.toISOString(),
          inspect_at_next_visit: false,
        }).eq("id", task.id);
      } else if (task.id) {
        await supabase.from("home_maintenance_tasks").update({
          last_completed_at: form.service_date,
          inspect_at_next_visit: false,
        }).eq("id", task.id);
      }

      onSaved(form.service_date);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />

        <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 4 }}>{task.name}</h3>
        <p style={{ fontSize: "0.83rem", color: "#8E95A3", marginBottom: 20 }}>Log this task as completed</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Date completed</label>
            <input
              type="date"
              value={form.service_date}
              onChange={e => set("service_date", e.target.value)}
              style={{ colorScheme: "light" }}
            />
          </div>

          <div className="field">
            <label>Notes <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <textarea
              placeholder="Anything worth remembering — brand used, condition noted, contractor name…"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              style={{ minHeight: 80 }}
            />
          </div>

          <div className="field">
            <label>Cost <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <input
              type="number"
              placeholder="0.00"
              value={form.cost}
              onChange={e => set("cost", e.target.value)}
              style={{ maxWidth: 130 }}
            />
          </div>

          {error && <div className="note warn">{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 2 }}
            >
              {saving ? <><div className="spinner" />Saving…</> : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
