const C = {
  bg:           "#F5F7FA",
  card:         "#FFFFFF",
  border:       "#ECEEF2",
  textPrimary:  "#1A1D23",
  textSecondary:"#8E95A3",
  orange:       "#FF7A35",
  orangeLight:  "#FFF0E8",
};

export default function AssetSelect({ session, profile, onSelect, onBack }) {
  const getUserName = () => {
    if (profile?.full_name) return profile.full_name.split(" ")[0];
    const raw = session?.user?.user_metadata?.name
      || session?.user?.email?.split("@")[0]
      || "there";
    const first = raw.replace(/[._]/g, " ").split(" ")[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  };

  const name = getUserName();

  const cardBase = {
    background: C.card,
    border: `1.5px solid ${C.border}`,
    borderRadius: 16,
    padding: "22px 18px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 16,
    transition: "border-color 0.18s ease, box-shadow 0.18s ease",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      flexDirection: "column",
      padding: "64px 20px 32px",
      maxWidth: 480,
      margin: "0 auto",
      boxSizing: "border-box",
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          color: C.textSecondary, fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: "0.875rem", fontWeight: 500, padding: "0 0 24px 0",
          alignSelf: "flex-start",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      )}
      {/* Greeting */}
      <div style={{ marginBottom: 40 }}>
        <p style={{
          fontSize: "0.8rem", fontWeight: 600, color: C.orange,
          textTransform: "uppercase", letterSpacing: "0.07em",
          marginBottom: 8, fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Hey {name} 👋
        </p>
        <h1 style={{
          fontSize: "1.75rem", fontWeight: 800, color: C.textPrimary,
          marginBottom: 10, lineHeight: 1.2,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          What would you like to track?
        </h1>
        <p style={{ fontSize: "0.9rem", color: C.textSecondary, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          You can add more assets any time.
        </p>
      </div>

      {/* Asset cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Vehicle */}
        <button
          onClick={() => onSelect("vehicle")}
          style={cardBase}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = C.orange;
            e.currentTarget.style.boxShadow = `0 0 0 3px ${C.orangeLight}`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
          }}
          onTouchStart={e => {
            e.currentTarget.style.borderColor = C.orange;
            e.currentTarget.style.boxShadow = `0 0 0 3px ${C.orangeLight}`;
          }}
          onTouchEnd={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: "#EEF4FF",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>🚗</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: C.textPrimary, marginBottom: 3 }}>
              Add a vehicle
            </div>
            <div style={{ fontSize: "0.82rem", color: C.textSecondary }}>
              Car, truck, SUV — any make and model
            </div>
          </div>
          <span style={{ color: C.orange, fontSize: "1.1rem", flexShrink: 0 }}>→</span>
        </button>

        {/* Home */}
        <button
          onClick={() => onSelect("home")}
          style={cardBase}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = C.orange;
            e.currentTarget.style.boxShadow = `0 0 0 3px ${C.orangeLight}`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
          }}
          onTouchStart={e => {
            e.currentTarget.style.borderColor = C.orange;
            e.currentTarget.style.boxShadow = `0 0 0 3px ${C.orangeLight}`;
          }}
          onTouchEnd={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: "#FFF0E8",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>🏠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: C.textPrimary, marginBottom: 3 }}>
              Add a home
            </div>
            <div style={{ fontSize: "0.82rem", color: C.textSecondary }}>
              House, condo, townhouse — climate-aware scheduling
            </div>
          </div>
          <span style={{ color: C.orange, fontSize: "1.1rem", flexShrink: 0 }}>→</span>
        </button>
      </div>
    </div>
  );
}
