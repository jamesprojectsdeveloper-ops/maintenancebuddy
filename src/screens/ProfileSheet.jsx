import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import EditVehicleModal from "./EditVehicleModal";
import EditHomeModal from "./EditHomeModal";

const C = {
  bg: "#F5F7FA",
  card: "#FFFFFF",
  border: "#ECEEF2",
  textPrimary: "#1A1D23",
  textSecondary: "#8E95A3",
  orange: "#FF7A35",
  green: "#4CAF82",
  red: "#EF4444",
  redLight: "#FEE2E2",
  blue: "#3B82F6",
  blueLight: "#EFF6FF",
};

export default function ProfileSheet({
  session,
  profile,
  onClose,
  onSignOut,
  onProfileSaved,
  onVehicleUpdated,
  onHomeUpdated,
  onVehicleDeleted,
  onHomeDeleted,
}) {
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [vehicles, setVehicles] = useState([]);
  const [homes, setHomes] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [editingHome, setEditingHome] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Sharing
  const [suggestion, setSuggestion] = useState("");
  const [suggestionSent, setSuggestionSent] = useState(false);

  const [sharingAsset, setSharingAsset] = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSent, setShareSent] = useState(false);

  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [cancellingShare, setCancellingShare] = useState(null);
  const [leavingShare, setLeavingShare] = useState(null);

  const bodyFont = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  useEffect(() => {
    if (tab === "assets") loadAssets();
  }, [tab]);

  const loadAssets = async () => {
    setLoadingAssets(true);

    const [vRes, hRes, sharesOutRes, sharesInRes] = await Promise.all([
      supabase.from("vehicles").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }),
      supabase.from("homes").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }),
      supabase.from("asset_shares").select("*").eq("owner_user_id", session.user.id).eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("asset_shares").select("*").eq("shared_with_user_id", session.user.id).eq("status", "accepted").order("created_at", { ascending: false }),
    ]);

    setVehicles(vRes.data || []);
    setHomes(hRes.data || []);

    // Outgoing pending invites — enrich with asset names
    const outgoing = sharesOutRes.data || [];
    if (outgoing.length) {
      const vIds = outgoing.filter(s => s.asset_type === "vehicle").map(s => s.asset_id);
      const hIds = outgoing.filter(s => s.asset_type === "home").map(s => s.asset_id);
      const [vNamesRes, hNamesRes] = await Promise.all([
        vIds.length ? supabase.from("vehicles").select("id, nickname, year, make, model").in("id", vIds) : { data: [] },
        hIds.length ? supabase.from("homes").select("id, nickname, home_type").in("id", hIds) : { data: [] },
      ]);
      const nameMap = {};
      (vNamesRes.data || []).forEach(v => { nameMap[v.id] = v.nickname || `${v.year} ${v.make} ${v.model}`; });
      (hNamesRes.data || []).forEach(h => { nameMap[h.id] = h.nickname || (h.home_type === "condo" ? "Condo" : h.home_type === "townhouse" ? "Townhouse" : "Home"); });
      setPendingOutgoing(outgoing.map(s => ({ ...s, assetLabel: nameMap[s.asset_id] || "Asset" })));
    } else {
      setPendingOutgoing([]);
    }

    // Incoming accepted shares — enrich with asset names + owner name
    const incoming = sharesInRes.data || [];
    if (incoming.length) {
      const vIds = incoming.filter(s => s.asset_type === "vehicle").map(s => s.asset_id);
      const hIds = incoming.filter(s => s.asset_type === "home").map(s => s.asset_id);
      const [vRes2, hRes2] = await Promise.all([
        vIds.length ? supabase.from("vehicles").select("id, nickname, year, make, model").in("id", vIds) : { data: [] },
        hIds.length ? supabase.from("homes").select("id, nickname, home_type").in("id", hIds) : { data: [] },
      ]);
      const nameMap = {};
      (vRes2.data || []).forEach(v => { nameMap[v.id] = v.nickname || `${v.year} ${v.make} ${v.model}`; });
      (hRes2.data || []).forEach(h => { nameMap[h.id] = h.nickname || (h.home_type === "condo" ? "Condo" : "Home"); });
      setSharedWithMe(incoming.map(s => ({
        ...s,
        assetLabel: nameMap[s.asset_id] || "Asset",
        ownerName: s.owner_name || "Someone",
        emoji: s.asset_type === "vehicle" ? "🚗" : "🏠",
      })));
    } else {
      setSharedWithMe([]);
    }

    setLoadingAssets(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .upsert({
          id: session.user.id,
          full_name: name.trim(),
          email: session.user.email,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (data && onProfileSaved) onProfileSaved(data);
    } catch { /* ignore */ }
    setSaving(false);
    onClose();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    onSignOut?.();
  };

  const handleDeleteVehicle = async (vehicleId) => {
    setDeleting(vehicleId);
    setDeleteError(null);
    await supabase.from("ai_schedule_generations").delete().eq("vehicle_id", vehicleId);
    const { data: tasks } = await supabase.from("maintenance_tasks").select("id").eq("vehicle_id", vehicleId);
    if (tasks?.length) {
      await supabase.from("service_logs").delete().in("task_id", tasks.map(t => t.id));
    }
    await supabase.from("service_logs").delete().eq("vehicle_id", vehicleId);
    await supabase.from("maintenance_tasks").delete().eq("vehicle_id", vehicleId);
    await supabase.from("mileage_logs").delete().eq("vehicle_id", vehicleId);
    await supabase.from("asset_shares").delete().eq("asset_type", "vehicle").eq("asset_id", vehicleId);
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
    if (error) {
      setDeleteError("Could not delete — please try again.");
      setDeleting(null);
      return;
    }
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    onVehicleDeleted?.(vehicleId);
    setDeleting(null);
    setConfirmDelete(null);
  };

  const handleDeleteHome = async (homeId) => {
    setDeleting(homeId);
    setDeleteError(null);
    await supabase.from("ai_schedule_generations").delete().eq("home_id", homeId);
    const { data: tasks } = await supabase.from("home_maintenance_tasks").select("id").eq("home_id", homeId);
    if (tasks?.length) {
      await supabase.from("home_service_logs").delete().in("task_id", tasks.map(t => t.id));
    }
    await supabase.from("home_maintenance_tasks").delete().eq("home_id", homeId);
    await supabase.from("asset_shares").delete().eq("asset_type", "home").eq("asset_id", homeId);
    const { error } = await supabase.from("homes").delete().eq("id", homeId);
    if (error) {
      setDeleteError("Could not delete — please try again.");
      setDeleting(null);
      return;
    }
    setHomes(prev => prev.filter(h => h.id !== homeId));
    onHomeDeleted?.(homeId);
    setDeleting(null);
    setConfirmDelete(null);
  };

  const handleShare = async () => {
    if (!shareEmail.trim() || !sharingAsset) return;
    setShareLoading(true);
    setShareError("");

    const email = shareEmail.trim().toLowerCase();

    if (email === session.user.email.toLowerCase()) {
      setShareError("You can't share with yourself.");
      setShareLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("asset_shares")
      .select("id, status")
      .eq("asset_type", sharingAsset.type)
      .eq("asset_id", sharingAsset.id)
      .eq("invite_email", email)
      .maybeSingle();

    if (existing) {
      setShareError(existing.status === "accepted" ? "Already shared with this person." : "Invite already pending for this email.");
      setShareLoading(false);
      return;
    }

    const ownerDisplayName = profile?.full_name?.split(" ")[0]
      || session.user.user_metadata?.name?.split(" ")[0]
      || session.user.email?.split("@")[0]
      || null;

    const basePayload = {
      asset_type: sharingAsset.type,
      asset_id: sharingAsset.id,
      owner_user_id: session.user.id,
      invite_email: email,
      status: "pending",
    };

    // Try with owner_name first; fall back without it if the column doesn't exist yet.
    let { error } = await supabase.from("asset_shares").insert({ ...basePayload, owner_name: ownerDisplayName });
    if (error?.message?.includes("owner_name")) {
      ({ error } = await supabase.from("asset_shares").insert(basePayload));
    }

    if (error) {
      setShareError(error.message || "Something went wrong. Please try again.");
      setShareLoading(false);
      return;
    }

    setShareSent(true);
    setShareLoading(false);
    setTimeout(() => loadAssets(), 400);
  };

  const handleCancelInvite = async (shareId) => {
    setCancellingShare(shareId);
    await supabase.from("asset_shares").delete().eq("id", shareId);
    setPendingOutgoing(prev => prev.filter(s => s.id !== shareId));
    setCancellingShare(null);
  };

  const handleLeave = async (share) => {
    setLeavingShare(share.id);
    await supabase.from("asset_shares").delete().eq("id", share.id);
    setSharedWithMe(prev => prev.filter(s => s.id !== share.id));
    if (share.asset_type === "vehicle") {
      onVehicleDeleted?.(share.asset_id);
    } else {
      onHomeDeleted?.(share.asset_id);
    }
    setLeavingShare(null);
  };

  const openShare = (type, id, label) => {
    setSharingAsset({ type, id, label });
    setShareEmail("");
    setShareError("");
    setShareSent(false);
  };

  const closeShare = () => {
    setSharingAsset(null);
    setShareEmail("");
    setShareError("");
    setShareSent(false);
  };

  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.textSecondary, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );

  const AssetRow = ({ emoji, label, sublabel, onEdit, onDelete, onShare, isConfirming, isDel }) => (
    <div style={{
      border: `1px solid ${isConfirming ? "#FCA5A5" : C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      background: isConfirming ? C.redLight : C.card,
      transition: "all 0.2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </div>
          {sublabel && (
            <div style={{ fontSize: "0.75rem", color: C.textSecondary }}>{sublabel}</div>
          )}
        </div>
        {!isConfirming && (
          <div style={{ display: "flex", gap: 5 }}>
            {onShare && (
              <button onClick={onShare} style={{
                padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8,
                background: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                color: C.blue, ...bodyFont,
              }}>
                Share
              </button>
            )}
            <button onClick={onEdit} style={{
              padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8,
              background: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
              color: C.textPrimary, ...bodyFont,
            }}>
              Edit
            </button>
            <button onClick={onDelete} style={{
              padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8,
              background: "none", cursor: "pointer", fontSize: "0.78rem", color: C.red, ...bodyFont,
            }}>
              🗑
            </button>
          </div>
        )}
      </div>
      {isConfirming && (
        <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #FCA5A5" }}>
          <p style={{ margin: "0 0 10px", fontSize: "0.82rem", color: C.red, fontWeight: 500 }}>
            Remove <strong>{label}</strong> and all its maintenance history? This can't be undone.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setConfirmDelete(null); setDeleteError(null); }}
              style={{ flex: 1, padding: "8px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: C.textPrimary, ...bodyFont }}
            >
              Keep it
            </button>
            <button
              onClick={emoji === "🚗" ? () => handleDeleteVehicle(confirmDelete.id) : () => handleDeleteHome(confirmDelete.id)}
              disabled={isDel}
              style={{ flex: 1, padding: "8px", border: "none", borderRadius: 8, background: C.red, cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: "white", ...bodyFont }}
            >
              {isDel ? "Removing…" : "Yes, remove"}
            </button>
          </div>
          {deleteError && (
            <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: C.red, textAlign: "center" }}>{deleteError}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-sheet" style={{ ...bodyFont }}>
          <div className="modal-handle" />

          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 10, padding: 4, marginBottom: 20 }}>
            {[{ id: "profile", label: "Profile" }, { id: "assets", label: "Manage assets" }].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer", ...bodyFont,
                  background: tab === t.id ? C.card : "none",
                  fontWeight: tab === t.id ? 600 : 400,
                  fontSize: "0.875rem",
                  color: tab === t.id ? C.textPrimary : C.textSecondary,
                  boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Profile tab ── */}
          {tab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>Your profile</h3>
                <p style={{ fontSize: "0.8rem", color: C.textSecondary, margin: 0 }}>{session?.user?.email}</p>
              </div>
              <div className="field">
                <label>First name</label>
                <input
                  type="text"
                  placeholder="e.g. James"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
              </div>

              {/* Feedback section */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                <h4 style={{ margin: "0 0 4px", fontSize: "0.9rem", fontWeight: 600, color: C.textPrimary }}>
                  Send a suggestion
                </h4>
                <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: C.textSecondary }}>
                  Ideas, feature requests, anything — straight to the developer.
                </p>
                {suggestionSent ? (
                  <div style={{ textAlign: "center", padding: "14px 0" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🙏</div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary }}>Thanks for the feedback!</div>
                    <button
                      onClick={() => { setSuggestionSent(false); setSuggestion(""); }}
                      style={{ marginTop: 10, padding: "6px 18px", border: `1px solid ${C.border}`, borderRadius: 8, background: "none", cursor: "pointer", fontSize: "0.8rem", color: C.textSecondary, ...bodyFont }}
                    >
                      Send another
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea
                      placeholder="e.g. I'd love to track tire rotations by mileage…"
                      value={suggestion}
                      onChange={(e) => setSuggestion(e.target.value)}
                      rows={3}
                      style={{
                        width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`,
                        borderRadius: 10, fontSize: "0.875rem", color: C.textPrimary,
                        background: C.bg, resize: "none", outline: "none",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        boxSizing: "border-box", lineHeight: 1.5,
                      }}
                    />
                    <button
                      onClick={() => {
                        if (!suggestion.trim()) return;
                        const subject = encodeURIComponent("MaintenanceBuddy Suggestion");
                        const body = encodeURIComponent(`From: ${session?.user?.email || "a user"}\n\n${suggestion.trim()}`);
                        window.open(`mailto:jamesprojectsdeveloper@gmail.com?subject=${subject}&body=${body}`, "_blank");
                        setSuggestionSent(true);
                      }}
                      disabled={!suggestion.trim()}
                      style={{
                        width: "100%", padding: "11px", border: "none", borderRadius: 10,
                        background: suggestion.trim() ? C.orange : C.border,
                        color: suggestion.trim() ? "white" : C.textSecondary,
                        fontWeight: 700, fontSize: "0.875rem", cursor: suggestion.trim() ? "pointer" : "default",
                        transition: "all 0.15s ease", ...bodyFont,
                      }}
                    >
                      Send feedback
                    </button>
                  </div>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()} style={{ width: "100%" }}>
                  {saving ? <><div className="spinner" />Saving…</> : "Save changes"}
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  style={{ width: "100%", padding: "12px", border: `1px solid ${C.border}`, borderRadius: 12, background: "none", cursor: "pointer", ...bodyFont, fontSize: "0.9rem", fontWeight: 600, color: C.red }}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
                <button onClick={onClose} style={{ width: "100%", padding: "10px", border: "none", background: "none", cursor: "pointer", ...bodyFont, fontSize: "0.875rem", color: C.textSecondary }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Assets tab ── */}
          {tab === "assets" && (
            <div>
              {loadingAssets ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: C.textSecondary, fontSize: "0.875rem" }}>Loading…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* My assets */}
                  {(vehicles.length > 0 || homes.length > 0) && (
                    <div>
                      <SectionLabel>My assets</SectionLabel>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {vehicles.map((v) => {
                          const label = v.nickname || `${v.year} ${v.make} ${v.model}`;
                          const sublabel = `${v.year} ${v.make} ${v.model}${v.current_mileage ? ` · ${parseInt(v.current_mileage).toLocaleString()} mi` : ""}`;
                          const isConfirming = confirmDelete?.id === v.id;
                          return (
                            <AssetRow
                              key={v.id}
                              emoji="🚗"
                              label={label}
                              sublabel={v.nickname ? sublabel : undefined}
                              onShare={() => openShare("vehicle", v.id, label)}
                              onEdit={() => setEditingVehicle(v)}
                              onDelete={() => setConfirmDelete({ type: "vehicle", id: v.id, label })}
                              isConfirming={isConfirming}
                              isDel={deleting === v.id}
                            />
                          );
                        })}
                        {homes.map((h) => {
                          const label = h.nickname || (h.home_type === "condo" ? "Condo" : h.home_type === "townhouse" ? "Townhouse" : "Home");
                          const sublabel = [h.city, h.state].filter(Boolean).join(", ") || h.home_type || "";
                          const isConfirming = confirmDelete?.id === h.id;
                          return (
                            <AssetRow
                              key={h.id}
                              emoji="🏠"
                              label={label}
                              sublabel={sublabel || undefined}
                              onShare={() => openShare("home", h.id, label)}
                              onEdit={() => setEditingHome(h)}
                              onDelete={() => setConfirmDelete({ type: "home", id: h.id, label })}
                              isConfirming={isConfirming}
                              isDel={deleting === h.id}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pending outgoing invites */}
                  {pendingOutgoing.length > 0 && (
                    <div>
                      <SectionLabel>Pending invites</SectionLabel>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pendingOutgoing.map(s => (
                          <div key={s.id} style={{
                            border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px",
                            background: C.card, display: "flex", alignItems: "center", gap: 10,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.assetLabel}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: C.textSecondary, marginTop: 2 }}>
                                Invited {s.invite_email}
                              </div>
                            </div>
                            <div style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "#FEF3C7", color: "#92400E" }}>
                              Pending
                            </div>
                            <button
                              onClick={() => handleCancelInvite(s.id)}
                              disabled={cancellingShare === s.id}
                              style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "none", cursor: "pointer", fontSize: "0.78rem", color: C.red, ...bodyFont }}
                            >
                              {cancellingShare === s.id ? "…" : "Cancel"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shared with me */}
                  {sharedWithMe.length > 0 && (
                    <div>
                      <SectionLabel>Shared with me</SectionLabel>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {sharedWithMe.map(s => (
                          <div key={s.id} style={{
                            border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px",
                            background: C.card, display: "flex", alignItems: "center", gap: 10,
                          }}>
                            <span style={{ fontSize: 20, flexShrink: 0 }}>{s.emoji}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.assetLabel}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: C.textSecondary, marginTop: 2 }}>
                                Shared by {s.ownerName}
                              </div>
                            </div>
                            <button
                              onClick={() => handleLeave(s)}
                              disabled={leavingShare === s.id}
                              style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "none", cursor: "pointer", fontSize: "0.78rem", color: C.red, fontWeight: 600, ...bodyFont }}
                            >
                              {leavingShare === s.id ? "Leaving…" : "Leave"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {vehicles.length === 0 && homes.length === 0 && sharedWithMe.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px 0", color: C.textSecondary, fontSize: "0.875rem" }}>
                      No assets added yet.
                    </div>
                  )}
                </div>
              )}
              <button onClick={onClose} style={{ width: "100%", marginTop: 16, padding: "10px", border: "none", background: "none", cursor: "pointer", ...bodyFont, fontSize: "0.875rem", color: C.textSecondary }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Share modal ── */}
      {sharingAsset && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={(e) => e.target === e.currentTarget && !shareLoading && closeShare()}
        >
          <div style={{ background: "white", borderRadius: "20px 20px 0 0", padding: "8px 20px 32px", width: "100%", maxWidth: 480, ...bodyFont }}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "12px auto 20px" }} />
            <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 700, color: C.textPrimary }}>
              Share {sharingAsset.label}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "0.82rem", color: C.textSecondary }}>
              They'll get full access to view and log maintenance.
            </p>

            {shareSent ? (
              <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: C.textPrimary, marginBottom: 6 }}>Invite sent!</div>
                <div style={{ fontSize: "0.82rem", color: C.textSecondary }}>They'll see it next time they sign in.</div>
                <button
                  onClick={closeShare}
                  style={{ marginTop: 20, padding: "11px 32px", border: "none", borderRadius: 12, background: C.orange, color: "white", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", ...bodyFont }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="field" style={{ marginBottom: shareError ? 8 : 16 }}>
                  <label>Email address</label>
                  <input
                    type="email"
                    placeholder="family@example.com"
                    value={shareEmail}
                    onChange={e => { setShareEmail(e.target.value); setShareError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleShare()}
                    autoFocus
                  />
                </div>
                {shareError && (
                  <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: C.red }}>{shareError}</p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={closeShare}
                    style={{ flex: 1, padding: "12px", border: `1px solid ${C.border}`, borderRadius: 12, background: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem", color: C.textPrimary, ...bodyFont }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={!shareEmail.trim() || shareLoading}
                    style={{ flex: 2, padding: "12px", border: "none", borderRadius: 12, background: C.orange, color: "white", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", opacity: !shareEmail.trim() || shareLoading ? 0.55 : 1, ...bodyFont }}
                  >
                    {shareLoading ? "Sending…" : "Send invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit sub-modals */}
      {editingVehicle && (
        <EditVehicleModal
          session={session}
          vehicleData={editingVehicle}
          onSaved={(updated) => {
            setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
            setEditingVehicle(null);
            onVehicleUpdated?.(updated);
          }}
          onClose={() => setEditingVehicle(null)}
        />
      )}
      {editingHome && (
        <EditHomeModal
          session={session}
          homeData={editingHome}
          onSaved={(updated) => {
            setHomes(prev => prev.map(h => h.id === updated.id ? updated : h));
            setEditingHome(null);
            onHomeUpdated?.(updated);
          }}
          onClose={() => setEditingHome(null)}
        />
      )}
    </>
  );
}
