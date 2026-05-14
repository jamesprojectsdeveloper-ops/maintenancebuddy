import { useState } from "react";
import { supabase } from "../supabaseClient";

const EyeIcon = ({ open }) => open ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function Welcome({ onAuth }) {
  const [mode, setMode] = useState("landing"); // landing | signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setShowPassword(false);
    setResetSent(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from("profiles").upsert({ id: data.user.id, full_name: name, email });
      onAuth(data.session);
    }
    setLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    onAuth(data.session);
    setLoading(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setResetSent(true);
  };

  // ── Landing ──────────────────────────────────────────────────────────────────
  if (mode === "landing") {
    return (
      <div className="screen" style={{ justifyContent: "center", gap: 0 }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, background: "var(--teal)",
            borderRadius: 14, display: "flex", alignItems: "center",
            justifyContent: "center", marginBottom: 24,
            boxShadow: "0 0 40px rgba(255,122,53,0.35)"
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "white" }}>M</span>
          </div>
          <h1 className="display" style={{ marginBottom: 16 }}>
            Maintenance<br />
            <em style={{ color: "var(--teal-mid)" }}>Buddy</em>
          </h1>
          <p className="body" style={{ color: "var(--gray-300)", maxWidth: 300 }}>
            Your home and car have been trying to tell you something. Now you'll finally hear it.
          </p>
        </div>
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <button className="btn btn-primary" onClick={() => switchMode("signup")}>
            Get started — it's free
          </button>
          <button className="btn btn-ghost" onClick={() => switchMode("signin")}>
            I already have an account
          </button>
        </div>
        <p className="fade-up caption" style={{ textAlign: "center" }}>
          Free forever. No credit card. No hidden features.
        </p>
      </div>
    );
  }

  // ── Forgot password ──────────────────────────────────────────────────────────
  if (mode === "forgot") {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <button
          onClick={() => switchMode("signin")}
          style={{ background: "none", border: "none", color: "var(--teal-dim)", cursor: "pointer",
            fontFamily: "var(--font-body)", fontSize: "0.875rem", marginBottom: 32, alignSelf: "flex-start",
            display: "flex", alignItems: "center", gap: 6 }}
        >← Back to sign in</button>

        <div className="fade-up" style={{ marginBottom: 32 }}>
          <h2 className="headline" style={{ marginBottom: 8 }}>Reset your password</h2>
          <p className="caption">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        {resetSent ? (
          <div className="fade-up" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginBottom: 8, color: "var(--white)" }}>
              Check your inbox
            </h3>
            <p className="body" style={{ color: "var(--gray-300)", marginBottom: 24 }}>
              We sent a reset link to <strong style={{ color: "var(--white)" }}>{email}</strong>. It may take a minute or two to arrive.
            </p>
            <button
              onClick={() => switchMode("signin")}
              style={{ background: "none", border: "none", color: "var(--teal-dim)", cursor: "pointer",
                fontFamily: "var(--font-body)", fontSize: "0.875rem" }}
            >Back to sign in</button>
          </div>
        ) : (
          <form className="fade-up" onSubmit={handleForgotPassword}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="field">
              <label>Email address</label>
              <input
                type="email" placeholder="you@email.com"
                value={email} onChange={e => setEmail(e.target.value)} required
              />
            </div>

            {error && <div className="note warn">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? <><div className="spinner" />Sending…</> : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    );
  }

  // ── Sign in / Sign up ────────────────────────────────────────────────────────
  return (
    <div className="screen" style={{ justifyContent: "center" }}>
      <button
        onClick={() => switchMode("landing")}
        style={{ background: "none", border: "none", color: "var(--teal-dim)", cursor: "pointer",
          fontFamily: "var(--font-body)", fontSize: "0.875rem", marginBottom: 32, alignSelf: "flex-start",
          display: "flex", alignItems: "center", gap: 6 }}
      >← Back</button>

      <div className="fade-up" style={{ marginBottom: 32 }}>
        <h2 className="headline" style={{ marginBottom: 8 }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="caption">
          {mode === "signup" ? "Takes about 30 seconds." : "Sign in to your MaintenanceBuddy account."}
        </p>
      </div>

      <form
        className="fade-up"
        onSubmit={mode === "signup" ? handleSignUp : handleSignIn}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {mode === "signup" && (
          <div className="field">
            <label>Your name</label>
            <input
              type="text" placeholder="First name"
              value={name} onChange={e => setName(e.target.value)} required
            />
          </div>
        )}

        <div className="field">
          <label>Email address</label>
          <input
            type="email" placeholder="you@email.com"
            value={email} onChange={e => setEmail(e.target.value)} required
          />
        </div>

        <div className="field">
          <label>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              value={password} onChange={e => setPassword(e.target.value)} required
              minLength={8}
              style={{ paddingRight: 44, width: "100%", boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: showPassword ? "var(--teal-mid)" : "var(--gray-400)",
                display: "flex", alignItems: "center", padding: 4,
                transition: "color 0.15s ease",
                WebkitTapHighlightColor: "transparent",
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => switchMode("forgot")}
            style={{ background: "none", border: "none", color: "var(--teal-dim)", cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: "0.8rem", textAlign: "right",
              padding: 0, marginTop: -8, alignSelf: "flex-end",
              transition: "color 0.15s ease" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--teal-mid)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--teal-dim)"}
          >
            Forgot password?
          </button>
        )}

        {error && <div className="note warn">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? <><div className="spinner" />{mode === "signup" ? "Creating account…" : "Signing in…"}</> : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        className="fade-up"
        onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
        style={{ background: "none", border: "none", color: "var(--teal-dim)", cursor: "pointer",
          fontFamily: "var(--font-body)", fontSize: "0.875rem", marginTop: 24, textAlign: "center" }}
      >
        {mode === "signup" ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
      </button>
    </div>
  );
}
