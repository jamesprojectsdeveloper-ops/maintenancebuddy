import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const MESSAGES = [
  "Analyzing your home's systems and climate zone…",
  "Building a schedule based on your HVAC and filters…",
  "Checking seasonal tasks for your region…",
  "Applying safety-critical reminders…",
  "Finalizing your personalized home maintenance plan…",
];

export default function HomeGenerating({ session, homeData, onComplete }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(i => Math.min(i + 1, MESSAGES.length - 1));
    }, 1800);
    generateSchedule();
    return () => clearInterval(interval);
  }, []);

  const generateSchedule = async () => {
    try {
      const prompt = buildPrompt(homeData);

      const response = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          system: `You are a home maintenance expert generating a precise, personalized maintenance schedule. Use the exact intervals specified — do not deviate from these standards.

OUTPUT FORMAT — JSON array, each task has:
- name: string
- category: string (HVAC | Plumbing | Roof | Exterior | Safety | Electrical | Appliances | Pool | Water | Seasonal | Other)
- description: string (1 sentence — why it matters)
- interval_days: number (exact — see standards below)
- seasonal: string ("spring" | "summer" | "fall" | "winter" | "year_round")
- priority: string ("high" | "medium" | "low")
- is_safety_critical: boolean
- inspect_at_next_visit: boolean (true ONLY if system age is concerning or history unknown)
- months_until_first_due: number (MINIMUM 1 always)

ACCURATE INTERVALS — USE EXACTLY:

AIR FILTERS:
- 1-inch, no pets: interval_days=90
- 1-inch, with pets: interval_days=60
- 1-inch, with pets AND respiratory issues: interval_days=30
- 4-inch or 5-inch media filter: interval_days=180
- HEPA: interval_days=365

HVAC:
- AC professional tune-up: interval_days=365, seasonal=spring, months_until_first_due=2
- Furnace/heat professional tune-up: interval_days=365, seasonal=fall, months_until_first_due=5
- Condensate drain flush (hot_humid ONLY): interval_days=45, seasonal=summer, months_until_first_due=1
- Clean AC condenser coils: interval_days=365, seasonal=spring, months_until_first_due=2
- HVAC > 10 years: add inspect_at_next_visit=true efficiency assessment

WATER HEATER:
- Annual flush (tank only): interval_days=365, months_until_first_due=6
- Anode rod inspection: interval_days=730, months_until_first_due=8
- Tank > 8 years OR tankless > 15 years: inspect_at_next_visit=true, priority=high

SAFETY (always include all):
- Smoke detector test: interval_days=30, is_safety_critical=true, months_until_first_due=1
- Smoke detector battery: interval_days=365, is_safety_critical=true, months_until_first_due=6
- CO detector test (if gas): interval_days=30, is_safety_critical=true, months_until_first_due=1
- Fire extinguisher check: interval_days=365, is_safety_critical=true, months_until_first_due=4
- GFCI outlet test: interval_days=90, is_safety_critical=true, months_until_first_due=2
- Dryer vent cleaning: interval_days=365, is_safety_critical=true, months_until_first_due=4

ROOF (skip condo/townhouse):
- Shingle inspection: interval_days=365, seasonal=fall, months_until_first_due=5
- Gutter cleaning: interval_days=182, months_until_first_due=2
- Roof > 15 years (asphalt) or > 25 years (metal): inspect_at_next_visit=true

REVERSE OSMOSIS SYSTEM (generate ALL if user has RO):
- Sediment pre-filter replacement: interval_days=180, months_until_first_due based on last change (if unknown: months_until_first_due=2, inspect_at_next_visit=true)
- Carbon pre-filter replacement: interval_days=180, months_until_first_due based on last change
- RO membrane replacement: interval_days=730, months_until_first_due=6 (or based on last change)
- Post/polishing filter replacement: interval_days=365, months_until_first_due=6
- Annual system sanitization: interval_days=365, months_until_first_due=8

WATER SOFTENER:
- Salt check and refill: interval_days=60, months_until_first_due=1
- Annual resin cleaning: interval_days=365, months_until_first_due=6

WHOLE HOUSE FILTER:
- Filter cartridge replacement: interval_days=90, months_until_first_due=2

WOOD DECK:
- Annual inspection: interval_days=365, seasonal=spring, months_until_first_due=2
- Staining/sealing: interval_days=730, months_until_first_due based on last treatment (if unknown: 3)

WOOD FENCE:
- Annual inspection: interval_days=365, seasonal=spring, months_until_first_due=2
- Staining/sealing: interval_days=730, months_until_first_due based on last treatment

IRRIGATION:
- Spring startup and inspection: interval_days=365, seasonal=spring, months_until_first_due=2
- Fall winterization (cold climates): interval_days=365, seasonal=fall, months_until_first_due=5
- Head and filter inspection: interval_days=365, seasonal=summer, months_until_first_due=3

POOL:
- Chemical balance check: interval_days=7, months_until_first_due=1
- Filter cleaning: interval_days=30, months_until_first_due=1
- Annual equipment inspection: interval_days=365, months_until_first_due=2
- Saltwater cell cleaning (saltwater only): interval_days=90, months_until_first_due=2

FIREPLACE/CHIMNEY:
- Regular use: interval_days=365, seasonal=fall, months_until_first_due=5
- Occasional use: interval_days=730, months_until_first_due=5

GENERATOR:
- Monthly run test: interval_days=30, months_until_first_due=1
- Annual service: interval_days=365, months_until_first_due=6

SUMP PUMP:
- Quarterly test: interval_days=90, months_until_first_due=1
- Annual inspection: interval_days=365, months_until_first_due=3

CLIMATE-SPECIFIC:
- hot_humid: condensate drain is critical, add mold/humidity check interval_days=90 seasonal=summer
- cold_winter: pipe winterization reminder seasonal=fall months_until_first_due=5, ice dam prevention seasonal=winter
- hot_dry: exterior caulk/dry rot check interval_days=365
- mild (CA/OR/WA): wildfire smoke filter check interval_days=365 seasonal=summer

RULES:
- NEVER set months_until_first_due to 0
- Distribute tasks across 1-12 months — don't pile everything in month 1
- Generate tasks for EVERY system the user mentioned
- Maximum 20 tasks, maximum 4 inspect_at_next_visit tasks
- Return ONLY valid JSON array, no markdown`,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const raw = data.content?.[0]?.text || "[]";

      let tasks = [];
      try {
        tasks = JSON.parse(raw);
      } catch {
        tasks = JSON.parse(raw.replace(/```json|```/g, "").trim());
      }

      const now = new Date();

      await supabase.from("home_maintenance_tasks").delete().eq("home_id", homeData.id);

      const tasksToInsert = tasks.map(task => {
        let next_due_at = null;
        const monthsOut = Math.max(1, task.months_until_first_due || 1);
        if (!task.inspect_at_next_visit) {
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + Math.round(monthsOut * 30));
          next_due_at = dueDate.toISOString();
        }
        return {
          user_id: session.user.id,
          home_id: homeData.id,
          name: task.name,
          category: task.category || "Other",
          description: task.description,
          interval_days: task.interval_days || 365,
          seasonal: task.seasonal || "year_round",
          priority: task.priority || "medium",
          is_safety_critical: task.is_safety_critical || false,
          inspect_at_next_visit: task.inspect_at_next_visit || false,
          last_completed_at: null,
          next_due_at,
          status: "active",
        };
      });

      const { data: insertedTasks, error: insertError } = await supabase
        .from("home_maintenance_tasks")
        .insert(tasksToInsert)
        .select();

      if (insertError) throw insertError;

      try {
        await Promise.race([
          supabase.from("ai_schedule_generations").insert({
            asset_type: "home", user_id: session.user.id,
            trigger: "onboarding", prompt_context: homeData,
            tasks_generated: tasks.length, model_used: "claude-sonnet-4-5",
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
        ]);
      } catch { /* non-critical */ }

      onComplete(insertedTasks || tasksToInsert);

    } catch (err) {
      console.error(err);
      setError(`Something went wrong building your plan. ${err.message}`);
    }
  };

  if (error) {
    return (
      <div className="screen" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 20 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <p className="body" style={{ color: "var(--gray-300)" }}>{error}</p>
        <button className="btn btn-primary btn-sm" onClick={() => { setError(""); generateSchedule(); }}>Try again</button>
      </div>
    );
  }

  return (
    <div className="screen" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-mid) 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px", boxShadow: "0 0 48px rgba(255,122,53,0.35)",
          animation: "pulse 2s ease-in-out infinite"
        }}>
          <span style={{ fontSize: 36 }}>🏠</span>
        </div>
        <h2 className="headline" style={{ marginBottom: 12 }}>Building your plan</h2>
        <p className="body" style={{ color: "var(--teal-dim)", minHeight: 48, transition: "all 0.3s ease" }}>
          {MESSAGES[msgIndex]}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {MESSAGES.map((_, i) => (
          <div key={i} style={{
            width: i <= msgIndex ? 20 : 6, height: 6, borderRadius: 3,
            background: i <= msgIndex ? "var(--teal)" : "rgba(255,255,255,0.15)",
            transition: "all 0.3s ease"
          }} />
        ))}
      </div>
      <p className="caption" style={{ marginTop: 40 }}>This takes about 10–15 seconds</p>
    </div>
  );
}

function buildPrompt(h) {
  let extraDetail = {};
  try { if (h.notes) extraDetail = JSON.parse(h.notes); } catch { /* ignore */ }
  const hasGas = h.hvac_type?.toLowerCase().includes("gas") ||
    h.water_heater_type?.toLowerCase().includes("gas") ||
    (h.extras || []).some(e => e.includes("fireplace"));
  const extras = h.extras || [];

  return `Home profile:
State: ${h.state || "unknown"}
Climate zone: ${h.climate_zone || "unknown"}
Own or rent: ${h.own_or_rent || "own"}
Home type: ${h.home_type || "single_family"}
Year built: ${h.year_built || "unknown"}
Square footage: ${h.sqft ? `${h.sqft} sq ft` : "unknown"}

HVAC: ${h.hvac_type || "unknown"}, age: ${h.hvac_age_years != null ? `${h.hvac_age_years} years` : "unknown"}
Air filter size: ${extraDetail.air_filter_size || h.air_filter_type || "unknown"}
Last filter change: ${h.last_filter_change_months_ago != null ? `${h.last_filter_change_months_ago} months ago` : "unknown"}
Pets in home: ${extraDetail.has_pets ? "yes" : "no"}
Respiratory sensitivities: ${extraDetail.has_respiratory_sensitivities ? "yes" : "no"}
Gas appliances: ${hasGas ? "yes" : "no"}

Roof: ${h.roof_type || "unknown"}, age: ${h.roof_age_years != null ? `${h.roof_age_years} years` : "unknown"}
Water heater: ${h.water_heater_type || "unknown"}, age: ${h.water_heater_age_years != null ? `${h.water_heater_age_years} years` : "unknown"}

Additional systems:
${extras.length > 0 ? extras.map(e => `- ${e}`).join("\n") : "- none"}

${extraDetail.has_ro_system ? `RO System: last filter change ${extraDetail.ro_last_filter_change_months_ago != null ? `${extraDetail.ro_last_filter_change_months_ago} months ago` : "unknown"}` : ""}
${extraDetail.deck_last_stained_years_ago != null ? `Deck last stained: ${extraDetail.deck_last_stained_years_ago} years ago` : ""}
${extraDetail.fence_age_years != null ? `Fence age: ${extraDetail.fence_age_years} years` : ""}
${extraDetail.fence_last_treated_years_ago != null ? `Fence last treated: ${extraDetail.fence_last_treated_years_ago} years ago` : ""}
${extraDetail.fireplace_use ? `Fireplace use: ${extraDetail.fireplace_use}` : ""}
${extraDetail.generator_type ? `Generator type: ${extraDetail.generator_type}` : ""}
${extraDetail.pool_type ? `Pool type: ${extraDetail.pool_type}` : ""}
${extraDetail.irrigation_seasonal != null ? `Irrigation: ${extraDetail.irrigation_seasonal ? "seasonal" : "year-round"}` : ""}

Current month: ${new Date().toLocaleString("default", { month: "long" })}
Current season: ${["winter","winter","spring","spring","summer","summer","summer","summer","fall","fall","fall","winter"][new Date().getMonth()]}

IMPORTANT: Generate tasks for EVERY system listed. Do not skip any extras. This is a brand new home setup — months_until_first_due must be >= 1 for all tasks.`;
}
