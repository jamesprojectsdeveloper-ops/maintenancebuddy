import { useState } from "react";
import { supabase } from "../supabaseClient";

const OIL_TYPES = ["Full synthetic", "Synthetic blend", "Conventional", "High-mileage synthetic", "Not sure"];
const OIL_BRANDS = ["Mobil 1", "Castrol", "Valvoline", "Pennzoil", "Shell Rotella", "Royal Purple", "Quaker State", "Not sure"];
const TIRE_BRANDS = ["Michelin", "Goodyear", "Bridgestone", "Continental", "Pirelli", "BFGoodrich", "Cooper", "Firestone", "Yokohama", "Not sure"];
const DRIVETRAINS = ["2WD", "4WD", "AWD"];

export default function EditVehicleModal({ session, vehicleData, profile, onSaved, onProfileSaved, onClose }) {
  const [form, setForm] = useState({
    nickname: vehicleData?.nickname || "",
    full_name: profile?.full_name || "",
    year: vehicleData?.year || "",
    make: vehicleData?.make || "",
    model: vehicleData?.model || "",
    trim: vehicleData?.trim || "",
    drivetrain: vehicleData?.drivetrain || "",
    is_turbo: vehicleData?.is_turbo || false,
    current_mileage: vehicleData?.current_mileage || "",
    oil_brand: vehicleData?.oil_brand || "",
    oil_type: vehicleData?.oil_type || "",
    oil_viscosity: vehicleData?.oil_viscosity || "",
    tire_brand: vehicleData?.tire_brand || "",
    tire_size: vehicleData?.tire_size || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.make || !form.model || !form.year) {
      setError("Make, model, and year are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const [{ data: updated, error: updateErr }] = await Promise.all([
        supabase.from("vehicles").update({
          nickname: form.nickname.trim() || null,
          year: parseInt(form.year),
          make: form.make,
          model: form.model,
          trim: form.trim || null,
          drivetrain: form.drivetrain || null,
          is_turbo: form.is_turbo,
          current_mileage: parseInt(form.current_mileage) || vehicleData.current_mileage,
          oil_brand: form.oil_brand || null,
          oil_type: form.oil_type || null,
          oil_viscosity: form.oil_viscosity || null,
          tire_brand: form.tire_brand || null,
          tire_size: form.tire_size || null,
          using_defaults: (!form.oil_brand || form.oil_brand === "Not sure") || (!form.tire_brand || form.tire_brand === "Not sure"),
          mileage_updated_at: new Date().toISOString(),
        }).eq("id", vehicleData.id).select().single(),
        form.full_name.trim()
          ? supabase.from("profiles").upsert({
              id: session.user.id,
              full_name: form.full_name.trim(),
              email: session.user.email,
            })
          : Promise.resolve({}),
      ]);

      if (updateErr) throw updateErr;

      const newMileage = parseInt(form.current_mileage);
      if (newMileage && newMileage !== parseInt(vehicleData.current_mileage)) {
        await supabase.from("mileage_logs").insert({
          vehicle_id: vehicleData.id,
          user_id: session.user.id,
          mileage: newMileage,
          source: "manual_edit",
        });
      }

      if (form.full_name.trim() && onProfileSaved) {
        onProfileSaved({ id: session.user.id, full_name: form.full_name.trim(), email: session.user.email });
      }

      onSaved(updated);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Edit vehicle</h3>
          <p className="caption" style={{ marginTop: 4 }}>Update your vehicle details</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Nickname */}
          <div className="field">
            <label>Nickname <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <input type="text" placeholder="e.g. My Truck, Daily Driver"
              value={form.nickname} onChange={e => set("nickname", e.target.value)} />
          </div>

          {/* Your name */}
          <div className="field">
            <label>Your first name</label>
            <input type="text" placeholder="e.g. James" value={form.full_name}
              onChange={e => set("full_name", e.target.value)} />
          </div>

          {/* Basic info */}
          <div className="field-row">
            <div className="field">
              <label>Year</label>
              <input type="number" placeholder="2020" value={form.year} onChange={e => set("year", e.target.value)} />
            </div>
            <div className="field">
              <label>Make</label>
              <input type="text" placeholder="Ford" value={form.make} onChange={e => set("make", e.target.value)} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Model</label>
              <input type="text" placeholder="F-150" value={form.model} onChange={e => set("model", e.target.value)} />
            </div>
            <div className="field">
              <label>Trim <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
              <input type="text" placeholder="XLT" value={form.trim} onChange={e => set("trim", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Current mileage</label>
            <input type="number" placeholder="87500" value={form.current_mileage}
              onChange={e => set("current_mileage", e.target.value)} />
          </div>

          <div className="field">
            <label>Drivetrain</label>
            <div className="chip-group">
              {DRIVETRAINS.map(d => (
                <button key={d} className={`chip ${form.drivetrain === d ? "selected" : ""}`}
                  onClick={() => set("drivetrain", d)}>{d}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Turbocharged?</label>
            <div className="chip-group">
              {[["Yes", true], ["No", false]].map(([label, val]) => (
                <button key={label}
                  className={`chip ${form.is_turbo === val ? "selected" : ""}`}
                  onClick={() => set("is_turbo", val)}>{label}</button>
              ))}
            </div>
          </div>

          {/* Oil */}
          <div style={{ borderTop: "1px solid #ECEEF2", paddingTop: 16 }}>
            <p className="caption" style={{ marginBottom: 12 }}>OIL DETAILS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label>Oil brand</label>
                <div className="chip-group">
                  {OIL_BRANDS.map(b => (
                    <button key={b} className={`chip ${form.oil_brand === b ? "selected" : ""} ${b === "Not sure" ? "skip" : ""}`}
                      onClick={() => set("oil_brand", b)}>{b}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Oil type</label>
                <div className="chip-group">
                  {OIL_TYPES.map(t => (
                    <button key={t} className={`chip ${form.oil_type === t ? "selected" : ""} ${t === "Not sure" ? "skip" : ""}`}
                      onClick={() => set("oil_type", t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Viscosity <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
                <input type="text" placeholder="e.g. 5W-30" value={form.oil_viscosity}
                  onChange={e => set("oil_viscosity", e.target.value)} style={{ maxWidth: 140 }} />
              </div>
            </div>
          </div>

          {/* Tires */}
          <div style={{ borderTop: "1px solid #ECEEF2", paddingTop: 16 }}>
            <p className="caption" style={{ marginBottom: 12 }}>TIRE DETAILS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label>Tire brand</label>
                <div className="chip-group">
                  {TIRE_BRANDS.map(b => (
                    <button key={b} className={`chip ${form.tire_brand === b ? "selected" : ""} ${b === "Not sure" ? "skip" : ""}`}
                      onClick={() => set("tire_brand", b)}>{b}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Tire size <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
                <input type="text" placeholder="e.g. 265/70R17" value={form.tire_size}
                  onChange={e => set("tire_size", e.target.value)} style={{ maxWidth: 160 }} />
              </div>
            </div>
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
              {saving ? <><div className="spinner" />Saving…</> : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
