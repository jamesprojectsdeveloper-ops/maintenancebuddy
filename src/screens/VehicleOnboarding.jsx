import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";

const SYSTEM_PROMPT = `You are a friendly vehicle maintenance assistant helping a new user set up their vehicle profile. Guide them through a natural conversation to collect vehicle details.

Rules:
1. Ask one focused question at a time — never bundle multiple questions
2. Be warm and brief (1-2 sentences max per message)
3. Acknowledge the user's answer before moving on
4. Skip irrelevant questions based on vehicle type:
   - Don't ask a sports car (Mustang, Corvette, Camaro, 370Z, etc.) about tow packages, bed covers, or lift kits
   - Don't ask a small sedan about 4WD/AWD unless the user mentions it
   - Don't ask about diesel-specific items unless it's a diesel truck/van
5. For last service questions: if the user doesn't know, that's perfectly fine — just note null for that field
6. You need to collect at minimum: year, make, model, current mileage
7. Ideally also collect: trim, drivetrain, oil brand/type, last oil change (mileage or approximate), tire brand, last tire rotation, accessories
8. Near the end, ask: "What would you like to call this vehicle? You can use something like 'My Truck' or 'Daily Driver' — or just skip and I'll use the year, make and model." If the user skips or says nothing, set nickname to null.

CRITICAL — Quick reply options:
- For ANY question about service history, last dates, mileage records, oil type/brand, tire brand, or anything the user might not remember: ALWAYS include "I don't know" as one of the quick-reply options. Make it easy to skip.
- For yes/no questions: include "Yes" and "No" (and "I don't know" if relevant)
- For oil type questions: include common options like "Conventional", "Synthetic", "I don't know"
- For drivetrain: include "FWD", "RWD", "AWD", "4WD", "I don't know"
- Keep the options array to 3–5 choices max

When you have enough information (at least year/make/model/mileage), respond with this exact JSON format and nothing else:
{"status":"complete","message":"<closing message>","vehicleData":{"nickname":"<string or null>","year":<number>,"make":"<string>","model":"<string>","trim":"<string or null>","drivetrain":"<2WD|4WD|AWD|null>","is_turbo":<boolean>,"current_mileage":<number>,"oil_brand":"<string or null>","oil_type":"<string or null>","oil_viscosity":"<string or null>","last_oil_change_mileage":<number or null>,"tire_brand":"<string or null>","tires_new":<true|false|null>,"last_rotation_mileage":<number or null>,"tires_remaining_miles":<number or null>,"accessories":[<array of strings>]}}

While still collecting info, respond with this exact JSON format:
{"status":"collecting","message":"<your message>","options":[<array of quick-reply strings, or empty array>]}

Always return valid JSON only — no other text.`;

export default function VehicleOnboarding({ session, onComplete, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [collected, setCollected] = useState(null);
  const [history, setHistory] = useState([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startConversation();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const startConversation = async () => {
    setLoading(true);
    const seed = [{ role: "user", content: "Hi, I want to set up my vehicle." }];
    try {
      const resp = await callClaude(seed);
      const parsed = parseResponse(resp);
      // Store both the user seed AND the assistant's first reply in history
      setHistory([...seed, { role: "assistant", content: resp }]);
      addAIMessage(parsed);
    } catch {
      setMessages([{ role: "ai", text: "What's the year, make, and model of your vehicle?", options: [] }]);
      setHistory(seed);
    }
    setLoading(false);
  };

  const callClaude = async (msgs) => {
    const res = await fetch("/api/anthropic/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: msgs,
      }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  };

  const parseResponse = (text) => {
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch {
      return { status: "collecting", message: text, options: [] };
    }
  };

  const addAIMessage = (parsed) => {
    if (parsed.status === "complete") {
      setCollected(parsed.vehicleData);
      setMessages(prev => [...prev, {
        role: "ai",
        text: parsed.message || "Great! I have everything I need.",
        options: [],
        complete: true
      }]);
    } else {
      setMessages(prev => [...prev, {
        role: "ai",
        text: parsed.message || "",
        options: parsed.options || [],
      }]);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading || saving) return;
    const userMsg = text.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);

    // history already contains all prior turns including the last assistant reply
    const newHistory = [...history, { role: "user", content: userMsg }];

    setLoading(true);
    setError("");
    try {
      const resp = await callClaude(newHistory);
      const parsed = parseResponse(resp);
      // Append the assistant reply so next turn has correct context
      setHistory([...newHistory, { role: "assistant", content: resp }]);
      addAIMessage(parsed);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!collected) return;
    setSaving(true);
    setError("");
    try {
      const v = collected;
      const { data: vehicle, error: vErr } = await supabase.from("vehicles").insert({
        user_id: session.user.id,
        nickname: v.nickname || null,
        make: v.make,
        model: v.model,
        trim: v.trim || null,
        year: v.year,
        drivetrain: v.drivetrain || null,
        is_turbo: v.is_turbo || false,
        current_mileage: v.current_mileage,
        oil_brand: v.oil_brand || null,
        oil_type: v.oil_type || null,
        oil_viscosity: v.oil_viscosity || null,
        tire_brand: v.tire_brand || null,
        tires_installed_at_mileage: v.tires_new ? v.current_mileage : null,
        accessories: (v.accessories || []).filter(a => a !== "None"),
        using_defaults: !v.oil_brand || !v.tire_brand,
        avg_miles_per_month: null,
        mileage_log_count: 0,
      }).select().single();

      if (vErr) throw vErr;

      await supabase.from("mileage_logs").insert({
        vehicle_id: vehicle.id,
        user_id: session.user.id,
        mileage: v.current_mileage,
        source: "onboarding",
      });

      onComplete({ ...v, id: vehicle.id });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const isComplete = messages.some(m => m.complete);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--navy)",
      display: "flex", flexDirection: "column"
    }}>
      {/* Header */}
      <div style={{
        background: "var(--navy-mid)", borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 10
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "var(--teal-dim)",
          cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "0.875rem",
          display: "flex", alignItems: "center", gap: 4, padding: 0
        }}>← Back</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Add your vehicle</div>
          <div className="caption">AI-assisted setup</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto", padding: "20px",
          display: "flex", flexDirection: "column",
          maxWidth: 480, margin: "0 auto", width: "100%",
          paddingBottom: 140
        }}
      >
        <div className="chat-container">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "ai" ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, background: "var(--teal)", borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-display)", fontSize: 14, color: "white", marginTop: 2
                  }}>M</div>
                  <div>
                    <div className="chat-bubble ai" style={{ animationDelay: `${i * 0.05}s` }}>
                      {msg.text}
                    </div>
                    {msg.complete && (
                      <div className="note info" style={{ marginTop: 8, maxWidth: 280 }}>
                        Ready to build your maintenance plan
                      </div>
                    )}
                    {/* Quick reply options */}
                    {msg.options && msg.options.length > 0 && !isComplete && i === messages.length - 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        {msg.options.map((opt, oi) => (
                          <button
                            key={oi}
                            onClick={() => sendMessage(opt)}
                            disabled={loading}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--teal)"; e.currentTarget.style.color = "white"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,122,53,0.1)"; e.currentTarget.style.color = "var(--teal-mid)"; }}
                            onMouseDown={e => { e.currentTarget.style.transform = "scale(0.95)"; }}
                            onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                            onTouchStart={e => { e.currentTarget.style.background = "var(--teal)"; e.currentTarget.style.color = "white"; }}
                            onTouchEnd={e => { e.currentTarget.style.background = "rgba(255,122,53,0.1)"; e.currentTarget.style.color = "var(--teal-mid)"; }}
                            style={{
                              background: "rgba(255,122,53,0.1)", border: "1px solid var(--teal)",
                              borderRadius: 999, color: "var(--teal-mid)", cursor: "pointer",
                              fontFamily: "var(--font-body)", fontSize: "0.8125rem",
                              padding: "6px 14px", transition: "background 0.15s ease, color 0.15s ease, transform 0.12s ease",
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >{opt}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div className="chat-bubble user" style={{ animationDelay: `${i * 0.05}s` }}>
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{
                width: 28, height: 28, background: "var(--teal)", borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontSize: 14, color: "white"
              }}>M</div>
              <div className="chat-bubble typing">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--navy-mid)", borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))"
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {error && (
            <div className="note warn" style={{ marginBottom: 8 }}>{error}</div>
          )}

          {isComplete ? (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <><div className="spinner" />Saving your vehicle...</>
              ) : "Build my maintenance plan →"}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                placeholder="Type your answer…"
                disabled={loading}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.05)",
                  border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12,
                  color: "var(--white)", fontFamily: "var(--font-body)",
                  fontSize: "0.9375rem", padding: "12px 16px",
                  outline: "none"
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  background: input.trim() ? "var(--teal)" : "rgba(255,255,255,0.08)",
                  border: "none", borderRadius: 12, width: 48, height: 48,
                  color: "white", cursor: input.trim() ? "pointer" : "not-allowed",
                  fontSize: "1.1rem", flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease"
                }}
              >
                {loading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : "↑"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
