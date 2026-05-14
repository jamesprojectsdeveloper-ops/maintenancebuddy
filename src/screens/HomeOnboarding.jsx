import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";

const SYSTEM_PROMPT = `You are Buddy, a friendly and knowledgeable home maintenance expert helping a homeowner set up their maintenance profile. You know home systems deeply and ask smart follow-up questions based on what you learn.

CONVERSATION RULES:
1. Ask ONE question at a time. Never bundle questions.
2. Be warm, brief, and conversational. 1-2 sentences max.
3. Acknowledge what they said before moving on.
4. Ask smart follow-ups based on answers:
   - If they mention RO system: ask when they last changed the filters
   - If they mention pets: note it affects filter intervals
   - If HVAC is old: ask if they have noticed any issues
   - If they have a wood deck: ask when it was last stained or sealed
   - If they have a wood fence: ask its age and when last treated
   - If they have a fireplace: ask how often they use it
   - If they have a generator: ask if it is standby or portable
   - If they have a pool: ask if it is saltwater or chlorine
   - If they have irrigation: ask if it runs year-round or seasonally
5. Always offer "I don't know" as a valid answer.
6. Skip irrelevant questions: renters skip water heater age and roof; condos skip roof (HOA covers it).

COLLECT IN THIS ORDER:
1. What US state is the home in?
2. Do you own or rent?
3. Home type: single family, townhouse, condo, mobile, or other?
4. Year built (approximate) and square footage (approximate)?
5. HVAC type and age in years (central AC + gas furnace, heat pump, mini-split, window units, other)?
6. Air filter size and when last changed (1-inch standard, 4-inch media filter, or not sure)?
   - Follow up: Do you have pets? Do anyone in the home have allergies or asthma?
7. Roof type and age (asphalt shingles, metal, tile, flat)? [SKIP for condo/townhouse]
8. Water heater type and age (tank gas, tank electric, tankless)? [SKIP for renters]
9. Additional systems — ask about each: pool, hot tub, irrigation system, well water, septic system, fireplace, generator, sump pump, solar panels, EV charger, wood deck, wood fence, reverse osmosis water filter, water softener, whole-house water filter?
   - For EACH system mentioned, ask one smart follow-up question.
10. Finally, ask: "What would you like to call this home? Something like 'Main House' or 'Beach House' works great — or just skip and I'll label it by state." If the user skips or says nothing, set nickname to null.

CLIMATE ZONES:
- hot_humid: TX, FL, LA, MS, AL, GA, SC, NC, AR, TN, OK
- cold_winter: MN, WI, MI, IL, OH, PA, NY, MA, VT, NH, ME, ND, SD, NE, IA, IN, MO, KS, WY, CO, MT, ID, CT, NJ, DE, MD, VA, WV, RI, AK
- hot_dry: AZ, NV, NM
- mild: CA, OR, WA, HI, UT

WHEN COMPLETE — respond with this exact JSON:
{"status":"complete","message":"<warm closing message>","homeData":{"nickname":"<string or null>","state":"<2-letter>","climate_zone":"<hot_humid|cold_winter|hot_dry|mild|unknown>","own_or_rent":"<own|rent>","home_type":"<single_family|townhouse|condo|mobile|other>","year_built":<number|null>,"sqft":<number|null>,"hvac_type":"<string|null>","hvac_age_years":<number|null>,"air_filter_size":"<1_inch|4_inch|other|unknown>","air_filter_type":"<string|null>","last_filter_change_months_ago":<number|null>,"has_pets":<boolean>,"has_respiratory_sensitivities":<boolean>,"roof_type":"<string|null>","roof_age_years":<number|null>,"water_heater_type":"<string|null>","water_heater_age_years":<number|null>,"has_pool":<boolean>,"pool_type":"<saltwater|chlorine|unknown|null>","has_irrigation":<boolean>,"irrigation_seasonal":<boolean|null>,"has_well":<boolean>,"has_septic":<boolean>,"has_fireplace":<boolean>,"fireplace_use":"<occasional|regular|null>","has_generator":<boolean>,"generator_type":"<standby|portable|null>","has_sump_pump":<boolean>,"has_solar":<boolean>,"has_ev_charger":<boolean>,"has_deck":<boolean>,"deck_last_stained_years_ago":<number|null>,"has_wood_fence":<boolean>,"fence_age_years":<number|null>,"fence_last_treated_years_ago":<number|null>,"has_ro_system":<boolean>,"ro_last_filter_change_months_ago":<number|null>,"has_water_softener":<boolean>,"has_whole_house_filter":<boolean>,"extras":["<string>"]}}

WHILE COLLECTING:
{"status":"collecting","message":"<your message>","options":["<quick reply>","<quick reply>"]}

Return valid JSON only — no other text ever.`;

export default function HomeOnboarding({ session, onComplete, onBack }) {
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
    const seed = [{ role: "user", content: "Hi, I want to set up my home." }];
    try {
      const resp = await callClaude(seed);
      const parsed = parseResponse(resp);
      setHistory([...seed, { role: "assistant", content: resp }]);
      addAIMessage(parsed);
    } catch {
      setMessages([{ role: "ai", text: "What US state is your home in?", options: ["TX", "FL", "CA", "NY", "Other"] }]);
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
      setCollected(parsed.homeData);
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
    const newHistory = [...history, { role: "user", content: userMsg }];
    setLoading(true);
    setError("");
    try {
      const resp = await callClaude(newHistory);
      const parsed = parseResponse(resp);
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
      const h = collected;
      const extras = [];
      if (h.has_pool) extras.push(h.pool_type === "saltwater" ? "saltwater pool" : "pool");
      if (h.has_irrigation) extras.push("irrigation system");
      if (h.has_well) extras.push("well water");
      if (h.has_septic) extras.push("septic system");
      if (h.has_fireplace) extras.push("fireplace");
      if (h.has_generator) extras.push(h.generator_type === "standby" ? "standby generator" : "portable generator");
      if (h.has_sump_pump) extras.push("sump pump");
      if (h.has_solar) extras.push("solar panels");
      if (h.has_ev_charger) extras.push("EV charger");
      if (h.has_deck) extras.push("wood deck");
      if (h.has_wood_fence) extras.push("wood fence");
      if (h.has_ro_system) extras.push("RO system");
      if (h.has_water_softener) extras.push("water softener");
      if (h.has_whole_house_filter) extras.push("whole house water filter");

      const { data: home, error: hErr } = await supabase.from("homes").insert({
        user_id: session.user.id,
        nickname: h.nickname || null,
        state: h.state || null,
        climate_zone: h.climate_zone || "unknown",
        own_or_rent: h.own_or_rent || "own",
        home_type: h.home_type || "single_family",
        year_built: h.year_built || null,
        sqft: h.sqft || null,
        hvac_type: h.hvac_type || null,
        hvac_age_years: h.hvac_age_years || null,
        air_filter_type: h.air_filter_size || h.air_filter_type || null,
        last_filter_change_months_ago: h.last_filter_change_months_ago || null,
        roof_type: h.roof_type || null,
        roof_age_years: h.roof_age_years || null,
        water_heater_type: h.water_heater_type || null,
        water_heater_age_years: h.water_heater_age_years || null,
        has_pool: h.has_pool || false,
        has_irrigation: h.has_irrigation || false,
        has_well: h.has_well || false,
        has_septic: h.has_septic || false,
        has_fireplace: h.has_fireplace || false,
        has_generator: h.has_generator || false,
        has_sump_pump: h.has_sump_pump || false,
        has_solar: h.has_solar || false,
        has_ev_charger: h.has_ev_charger || false,
        has_deck: h.has_deck || false,
        has_fence: h.has_wood_fence || false,
        extras: extras.filter(Boolean),
        notes: JSON.stringify({
          has_pets: h.has_pets,
          has_respiratory_sensitivities: h.has_respiratory_sensitivities,
          air_filter_size: h.air_filter_size,
          pool_type: h.pool_type,
          irrigation_seasonal: h.irrigation_seasonal,
          fireplace_use: h.fireplace_use,
          generator_type: h.generator_type,
          deck_last_stained_years_ago: h.deck_last_stained_years_ago,
          fence_age_years: h.fence_age_years,
          fence_last_treated_years_ago: h.fence_last_treated_years_ago,
          has_ro_system: h.has_ro_system,
          ro_last_filter_change_months_ago: h.ro_last_filter_change_months_ago,
          has_water_softener: h.has_water_softener,
          has_whole_house_filter: h.has_whole_house_filter,
        }),
      }).select().single();

      if (hErr) throw hErr;
      onComplete({ ...h, id: home.id, extras });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const isComplete = messages.some(m => m.complete);

  return (
    <div style={{ minHeight: "100vh", background: "var(--navy)", display: "flex", flexDirection: "column" }}>
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
          <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Add your home</div>
          <div className="caption">AI-assisted setup</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "20px",
        display: "flex", flexDirection: "column",
        maxWidth: 480, margin: "0 auto", width: "100%",
        paddingBottom: 140
      }}>
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
                        Ready to build your home maintenance plan
                      </div>
                    )}
                    {msg.options && msg.options.length > 0 && !isComplete && i === messages.length - 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        {msg.options.map((opt, oi) => (
                          <button
                            key={oi}
                            onClick={() => sendMessage(opt)}
                            disabled={loading}
                            style={{
                              background: "rgba(255,122,53,0.1)", border: "1px solid var(--teal)",
                              borderRadius: 999, color: "var(--teal-mid)", cursor: "pointer",
                              fontFamily: "var(--font-body)", fontSize: "0.8125rem",
                              padding: "6px 14px", transition: "all 0.15s ease",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--teal)"; e.currentTarget.style.color = "white"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,122,53,0.1)"; e.currentTarget.style.color = "var(--teal-mid)"; }}
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
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{
                width: 28, height: 28, background: "var(--teal)", borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontSize: 14, color: "white"
              }}>M</div>
              <div className="chat-bubble typing">
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--navy-mid)", borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))"
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {error && <div className="note warn" style={{ marginBottom: 8 }}>{error}</div>}
          {isComplete ? (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><div className="spinner" />Saving your home...</> : "Build my home maintenance plan →"}
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
                  fontSize: "0.9375rem", padding: "12px 16px", outline: "none"
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
