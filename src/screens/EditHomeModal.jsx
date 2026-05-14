import { useState } from "react";
import { supabase } from "../supabaseClient";

const HOME_TYPES = ["single_family", "townhouse", "condo", "mobile", "other"];
const HOME_TYPE_LABELS = {
  single_family: "Single family", townhouse: "Townhouse", condo: "Condo",
  mobile: "Mobile home", other: "Other",
};
const HVAC_TYPES = [
  "Central AC + gas furnace", "Central AC + electric furnace", "Heat pump",
  "Mini-split", "Window units", "Boiler", "Other",
];
const WATER_HEATER_TYPES = ["Tank gas", "Tank electric", "Tankless gas", "Tankless electric", "Not sure"];

export default function EditHomeModal({ session, homeData, onSaved, onClose }) {
  const [form, setForm] = useState({
    nickname:            homeData?.nickname || "",
    home_type:           homeData?.home_type || "single_family",
    year_built:          homeData?.year_built || "",
    sqft:                homeData?.sqft || "",
    state:               homeData?.state || "",
    hvac_type:           homeData?.hvac_type || "",
    hvac_age_years:      homeData?.hvac_age_years || "",
    water_heater_type:   homeData?.water_heater_type || "",
    water_heater_age_years: homeData?.water_heater_age_years || "",
    own_or_rent:         homeData?.own_or_rent || "own",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { data: updated, error: err } = await supabase.from("homes").update({
        nickname:              form.nickname.trim() || null,
        home_type:             form.home_type || null,
        year_built:            parseInt(form.year_built) || null,
        sqft:                  parseInt(form.sqft) || null,
        state:                 form.state.trim().toUpperCase().slice(0, 2) || null,
        hvac_type:             form.hvac_type || null,
        hvac_age_years:        parseInt(form.hvac_age_years) || null,
        water_heater_type:     form.water_heater_type || null,
        water_heater_age_years: parseInt(form.water_heater_age_years) || null,
        own_or_rent:           form.own_or_rent || null,
      }).eq("id", homeData.id).select().single();
      if (err) throw err;
      onSaved(updated);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Edit home</h3>
          <p className="caption" style={{ marginTop: 4 }}>Update your home details</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Nickname */}
          <div className="field">
            <label>Nickname <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <input type="text" placeholder="e.g. Main House, Beach House"
              value={form.nickname} onChange={e => set("nickname", e.target.value)} />
          </div>

          {/* Home type */}
          <div className="field">
            <label>Home type</label>
            <div className="chip-group">
              {HOME_TYPES.map(t => (
                <button key={t} className={`chip ${form.home_type === t ? "selected" : ""}`}
                  onClick={() => set("home_type", t)}>{HOME_TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>

          {/* Own / rent */}
          <div className="field">
            <label>Ownership</label>
            <div className="chip-group">
              {[["own", "Own"], ["rent", "Rent"]].map(([val, label]) => (
                <button key={val} className={`chip ${form.own_or_rent === val ? "selected" : ""}`}
                  onClick={() => set("own_or_rent", val)}>{label}</button>
              ))}
            </div>
          </div>

          {/* Year / sqft / state */}
          <div className="field-row">
            <div className="field">
              <label>Year built</label>
              <input type="number" placeholder="1998" value={form.year_built}
                onChange={e => set("year_built", e.target.value)} />
            </div>
            <div className="field">
              <label>State</label>
              <input type="text" placeholder="TX" maxLength={2} value={form.state}
                onChange={e => set("state", e.target.value)} style={{ maxWidth: 70 }} />
            </div>
          </div>

          <div className="field">
            <label>Square footage <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></label>
            <input type="number" placeholder="2100" value={form.sqft}
              onChange={e => set("sqft", e.target.value)} />
          </div>

          {/* HVAC */}
          <div style={{ borderTop: "1px solid #ECEEF2", paddingTop: 16 }}>
            <p className="caption" style={{ marginBottom: 12 }}>HVAC</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label>HVAC type</label>
                <div className="chip-group">
                  {HVAC_TYPES.map(t => (
                    <button key={t} className={`chip ${form.hvac_type === t ? "selected" : ""}`}
                      onClick={() => set("hvac_type", t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>HVAC age <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(years, optional)</span></label>
                <input type="number" placeholder="8" value={form.hvac_age_years}
                  onChange={e => set("hvac_age_years", e.target.value)} style={{ maxWidth: 100 }} />
              </div>
            </div>
          </div>

          {/* Water heater */}
          <div style={{ borderTop: "1px solid #ECEEF2", paddingTop: 16 }}>
            <p className="caption" style={{ marginBottom: 12 }}>WATER HEATER</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label>Water heater type</label>
                <div className="chip-group">
                  {WATER_HEATER_TYPES.map(t => (
                    <button key={t} className={`chip ${form.water_heater_type === t ? "selected" : ""}`}
                      onClick={() => set("water_heater_type", t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Water heater age <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(years, optional)</span></label>
                <input type="number" placeholder="6" value={form.water_heater_age_years}
                  onChange={e => set("water_heater_age_years", e.target.value)} style={{ maxWidth: 100 }} />
              </div>
            </div>
          </div>

          {error && <div className="note warn">{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
              {saving ? <><div className="spinner" />Saving…</> : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
