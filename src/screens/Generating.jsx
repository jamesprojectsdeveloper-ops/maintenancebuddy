import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const MESSAGES = [
  "Pulling manufacturer schedule for your vehicle…",
  "Calculating intervals based on your mileage…",
  "Checking oil and tire specs…",
  "Applying your actual service history…",
  "Building your personalized maintenance plan…",
];

export default function Generating({ session, vehicleData, onComplete }) {
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
      const prompt = buildPrompt(vehicleData);

      const response = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          system: `You are a vehicle maintenance expert. Given vehicle details including actual service history, return a JSON array of maintenance tasks.

Each task must have these exact fields:
- name: string (task name)
- category: string (Engine | Tires | Brakes | Fluids | Filters | Electrical | Inspection)
- description: string (1 sentence explaining why this matters)
- interval_type: string ("mileage" | "time" | "both")
- interval_miles: number or null
- interval_days: number or null
- priority: string ("high" | "medium" | "low")
- is_safety_critical: boolean
- last_completed_miles: number or null (use actual service history if provided; null if unknown)
- inspect_at_next_visit: boolean (true if user doesn't know when this was last done — don't estimate, flag for inspection)
- using_conservative_default: boolean

IMPORTANT: If the user doesn't know when they last had a specific service done, set last_completed_miles to null and inspect_at_next_visit to true. Do NOT make up a number.

INSPECT LIMIT: Maximum 4 inspect_at_next_visit tasks total. Only mark as inspect if the system is genuinely unknown or of concerning age. If mileage history is available, calculate actual intervals instead of defaulting to inspect. Prefer scheduling tasks with real intervals over marking them inspect.

Return ONLY valid JSON array, no other text, no markdown.`,
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
      const currentMiles = parseInt(vehicleData.current_mileage);
      const avgMilesPerMonth = 1200;

      const tasksToInsert = tasks.map(task => {
        let next_due_miles = null;
        let next_due_at = null;

        if (task.inspect_at_next_visit) {
          next_due_at = null;
          next_due_miles = null;
        } else if (task.interval_miles && task.last_completed_miles) {
          next_due_miles = task.last_completed_miles + task.interval_miles;
          const milesUntilDue = next_due_miles - currentMiles;
          const monthsUntilDue = milesUntilDue / avgMilesPerMonth;
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + Math.round(monthsUntilDue * 30));
          next_due_at = dueDate.toISOString();
        } else if (task.interval_days) {
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + task.interval_days);
          next_due_at = dueDate.toISOString();
        }

        return {
          asset_type: "vehicle",
          vehicle_id: vehicleData.id,
          user_id: session.user.id,
          name: task.name,
          category: task.category,
          description: task.description,
          priority: task.priority,
          is_safety_critical: task.is_safety_critical,
          interval_type: task.interval_type,
          interval_miles: task.interval_miles || null,
          interval_days: task.interval_days || null,
          last_completed_miles: task.last_completed_miles || null,
          next_due_miles,
          next_due_at,
          using_conservative_default: task.using_conservative_default || false,
          status: "active",
          // inspect_at_next_visit stored locally only (run SQL migration to persist)
          _inspect: task.inspect_at_next_visit || false,
        };
      });

      // Strip local-only fields before inserting to Supabase
      const dbTasks = tasksToInsert.map(({ _inspect, ...rest }) => rest);

      // Remove any existing tasks for this vehicle before inserting the fresh batch
      await supabase
        .from("maintenance_tasks")
        .delete()
        .eq("vehicle_id", vehicleData.id)
        .eq("status", "active");

      const { data: insertedTasks, error: insertError } = await supabase
        .from("maintenance_tasks")
        .insert(dbTasks)
        .select();

      if (insertError) throw insertError;

      try {
        await supabase.from("ai_schedule_generations").insert({
          asset_type: "vehicle",
          vehicle_id: vehicleData.id,
          user_id: session.user.id,
          trigger: "onboarding",
          prompt_context: vehicleData,
          tasks_generated: tasks.length,
          model_used: "claude-sonnet-4-5",
        });
      } catch {
        // non-critical
      }

      // Merge real DB ids back with the local inspect flag
      const finalTasks = (insertedTasks || dbTasks).map((t, i) => ({
        ...t,
        inspect_at_next_visit: tasksToInsert[i]?._inspect || t.inspect_at_next_visit || false,
      }));
      onComplete(finalTasks);

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
        <button className="btn btn-primary btn-sm" onClick={() => { setError(""); generateSchedule(); }}>
          Try again
        </button>
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
          margin: "0 auto 24px", boxShadow: "0 0 48px rgba(15,110,86,0.5)",
          animation: "pulse 2s ease-in-out infinite"
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "white" }}>M</span>
        </div>

        <h2 className="headline" style={{ marginBottom: 12 }}>Building your plan</h2>
        <p className="body" style={{ color: "var(--teal-dim)", minHeight: 48, transition: "all 0.3s ease" }}>
          {MESSAGES[msgIndex]}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {MESSAGES.map((_, i) => (
          <div key={i} style={{
            width: i <= msgIndex ? 20 : 6, height: 6,
            borderRadius: 3,
            background: i <= msgIndex ? "var(--teal)" : "rgba(255,255,255,0.15)",
            transition: "all 0.3s ease"
          }} />
        ))}
      </div>

      <p className="caption" style={{ marginTop: 40 }}>
        This takes about 10–15 seconds
      </p>
    </div>
  );
}

function buildPrompt(v) {
  const serviceHistory = [];
  if (v.last_oil_change_mileage) {
    serviceHistory.push(`Last oil change: at ${v.last_oil_change_mileage.toLocaleString()} miles (${parseInt(v.current_mileage) - parseInt(v.last_oil_change_mileage)} miles ago)`);
  } else {
    serviceHistory.push("Last oil change: UNKNOWN — flag as inspect_at_next_visit");
  }

  if (v.last_rotation_mileage && typeof v.last_rotation_mileage === "number") {
    serviceHistory.push(`Last tire rotation: at ${v.last_rotation_mileage.toLocaleString()} miles`);
  } else if (v.last_rotation_mileage && typeof v.last_rotation_mileage === "string") {
    serviceHistory.push(`Last tire rotation: ${v.last_rotation_mileage}`);
  } else {
    serviceHistory.push("Last tire rotation: UNKNOWN — flag as inspect_at_next_visit");
  }

  return `Vehicle: ${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}
Drivetrain: ${v.drivetrain || "unknown"}
Turbocharged: ${v.is_turbo ? "yes" : "no"}
Current mileage: ${v.current_mileage}
Oil: ${v.oil_brand || "unknown brand"} ${v.oil_type || ""}${v.oil_viscosity ? " " + v.oil_viscosity : ""}
Tires: ${v.tire_brand || "unknown brand"}, are they new (within 2 years): ${v.tires_new ?? "unknown"}
${v.tires_remaining_miles ? `Estimated tire miles remaining: ${v.tires_remaining_miles}` : ""}
Accessories: ${v.accessories?.filter(a => a !== "None").join(", ") || "none"}

Service history:
${serviceHistory.join("\n")}

Generate a complete maintenance schedule for this vehicle. For each item, use the actual service history above to set last_completed_miles. If the history says UNKNOWN for an item, set last_completed_miles to null and inspect_at_next_visit to true — do NOT guess.

Include: oil change, tire rotation, tire replacement estimate, cabin air filter, engine air filter, spark plugs, brake fluid flush, coolant flush, transmission fluid, differential fluid (if applicable for drivetrain), transfer case fluid (if 4WD/AWD), battery check, and any manufacturer-recommended services.

Do NOT include wiper blade replacement — drivers replace those on-demand when visibility is poor, not on a schedule.`;
}
