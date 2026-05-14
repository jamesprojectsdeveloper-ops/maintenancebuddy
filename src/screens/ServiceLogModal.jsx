import { useState } from "react";
import { supabase } from "../supabaseClient";

const taskWantsProductField = (taskName) =>
  /oil|tire|tyre|rotation/i.test(taskName);

export default function ServiceLogModal({ session, vehicleData, task, currentMileage, onSaved, onClose }) {
  const today = new Date().toISOString().split("T")[0];
  const showProduct = taskWantsProductField(task.name);

  const [form, setForm] = useState({
    service_date: today,
    mileage_at_service: currentMileage || "",
    product_brand: "",
    notes: "",
    cost: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Post-save mileage prompt
  const [showMileagePrompt, setShowMileagePrompt] = useState(false);
  const [showMileageInput, setShowMileageInput] = useState(false);
  const [savedMileage, setSavedMileage] = useState(null);
  const [newMileageValue, setNewMileageValue] = useState("");
  const [updatingMileage, setUpdatingMileage] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.service_date || !form.mileage_at_service) {
      setError("Please enter the date and mileage.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const mileage = parseInt(form.mileage_at_service);

      try {
        await supabase.from("service_logs").insert({
          vehicle_id: vehicleData.id,
          user_id: session.user.id,
          task_name: task.name,
          task_id: task.id || null,
          service_date: form.service_date,
          mileage_at_service: mileage,
          product_brand: form.product_brand || null,
          condition_notes: form.notes || null,
          cost: form.cost ? parseFloat(form.cost) : null,
        });
      } catch {
        // service_logs table may not exist — continue
      }

      if (task.id && task.interval_miles) {
        const next_due_miles = mileage + task.interval_miles;
        const avgMilesPerMonth = 1200;
        const monthsUntilDue = (next_due_miles - mileage) / avgMilesPerMonth;
        const dueDate = new Date(form.service_date);
        dueDate.setDate(dueDate.getDate() + Math.round(monthsUntilDue * 30));
        await supabase.from("maintenance_tasks").update({
          last_completed_miles: mileage,
          next_due_miles,
          next_due_at: dueDate.toISOString(),
        }).eq("id", task.id);
      } else if (task.id && task.interval_days) {
        const dueDate = new Date(form.service_date);
        dueDate.setDate(dueDate.getDate() + task.interval_days);
        await supabase.from("maintenance_tasks").update({
          last_completed_miles: mileage,
          next_due_at: dueDate.toISOString(),
        }).eq("id", task.id);
      } else if (task.id) {
        await supabase.from("maintenance_tasks").update({
          last_completed_miles: mileage,
        }).eq("id", task.id);
      }

      setSaving(false);

      if (mileage > currentMileage) {
        // Mileage went up — auto-update silently
        await supabase.from("vehicles").update({
          current_mileage: mileage,
          mileage_updated_at: new Date().toISOString(),
        }).eq("id", vehicleData.id);
        await supabase.from("mileage_logs").insert({
          vehicle_id: vehicleData.id,
          user_id: session.user.id,
          mileage,
          source: "service_log",
        });
        onSaved(mileage, true);
      } else {
        // Odometer didn't go up — ask if they need to update it
        setSavedMileage(mileage);
        setShowMileagePrompt(true);
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleUpdateMileage = async () => {
    const mileage = parseInt(newMileageValue);
    if (!mileage || mileage < 1) return;
    setUpdatingMileage(true);
    await supabase.from("vehicles").update({
      current_mileage: mileage,
      mileage_updated_at: new Date().toISOString(),
    }).eq("id", vehicleData.id);
    await supabase.from("mileage_logs").insert({
      vehicle_id: vehicleData.id,
      user_id: session.user.id,
      mileage,
      source: "service_log",
    });
    setUpdatingMileage(false);
    onSaved(mileage, true);
  };

  const handleSkipMileage = () => {
    onSaved(savedMileage, false);
  };

  // ── Mileage prompt step ───────────────────────────────────────────────────────
  if (showMileagePrompt) {
    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleSkipMileage()}>
        <div className="modal-sheet" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          <div className="modal-handle" />

          {!showMileageInput ? (
            <div style={{ padding: "8px 0 4px" }}>
              <p style={{ margin: "0 0 20px", fontSize: "1rem", fontWeight: 600, color: "#1A1D23", lineHeight: 1.4 }}>
                ✅ Log saved — do you need to update your mileage?
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleSkipMileage}
                  style={{
                    flex: 1, padding: "12px", border: "1px solid #ECEEF2", borderRadius: 12,
                    background: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600,
                    color: "#8E95A3", fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  No
                </button>
                <button
                  onClick={() => {
                    setNewMileageValue(String(savedMileage || currentMileage || ""));
                    setShowMileageInput(true);
                  }}
                  style={{
                    flex: 2, padding: "12px", border: "none", borderRadius: 12,
                    background: "#FF7A35", color: "white", cursor: "pointer",
                    fontSize: "0.875rem", fontWeight: 700,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Yes, update
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: "8px 0 4px" }}>
              <p style={{ margin: "0 0 14px", fontSize: "1rem", fontWeight: 600, color: "#1A1D23" }}>
                Current mileage
              </p>
              <div className="field" style={{ marginBottom: 16 }}>
                <input
                  type="number"
                  placeholder={String(savedMileage || currentMileage)}
                  value={newMileageValue}
                  onChange={e => setNewMileageValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleUpdateMileage()}
                  autoFocus
                  style={{ fontSize: "1.1rem", fontWeight: 600 }}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowMileageInput(false)}
                  style={{
                    flex: 1, padding: "12px", border: "1px solid #ECEEF2", borderRadius: 12,
                    background: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600,
                    color: "#8E95A3", fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleUpdateMileage}
                  disabled={!newMileageValue || updatingMileage}
                  style={{
                    flex: 2, padding: "12px", border: "none", borderRadius: 12,
                    background: "#FF7A35", color: "white", cursor: "pointer",
                    fontSize: "0.875rem", fontWeight: 700,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    opacity: !newMileageValue || updatingMileage ? 0.55 : 1,
                  }}
                >
                  {updatingMileage ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Log form ──────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />

        <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 20 }}>{task.name}</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={form.service_date}
                onChange={e => set("service_date", e.target.value)}
                style={{ colorScheme: "light" }}
              />
            </div>
            <div className="field">
              <label>Mileage</label>
              <input
                type="number"
                placeholder={String(currentMileage)}
                value={form.mileage_at_service}
                onChange={e => set("mileage_at_service", e.target.value)}
              />
            </div>
          </div>

          {showProduct && (
            <div className="field">
              <label>Product used <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text"
                placeholder={/oil/i.test(task.name) ? "e.g. Mobil 1 5W-30 Full Synthetic" : "e.g. Michelin Defender2"}
                value={form.product_brand}
                onChange={e => set("product_brand", e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label>Notes <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <textarea
              placeholder="Anything worth remembering…"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              style={{ minHeight: 72 }}
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
