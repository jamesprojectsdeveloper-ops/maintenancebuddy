# MaintenanceBuddy

A vehicle maintenance tracking app with AI-powered scheduling. Users add their vehicle through a natural conversation with Claude, which generates a personalized maintenance plan based on actual service history.

## Tech Stack

- **Frontend**: React 18 + Vite 5 (mobile-first, dark theme)
- **Auth + DB**: Supabase
- **AI**: Anthropic Claude (proxied through Vite dev server)

## Project Structure

```
src/
  App.jsx                    — Root: auth, routing, data loading
  supabaseClient.js          — Supabase client (uses VITE_ env vars)
  App.css                    — Global design tokens + component styles
  screens/
    Welcome.jsx              — Landing page + sign-up/sign-in
    AssetSelect.jsx          — "What would you like to track?"
    VehicleOnboarding.jsx    — AI chat-based vehicle setup
    Generating.jsx           — Claude generates maintenance schedule
    Dashboard.jsx            — Main dashboard with task list
    ServiceLogModal.jsx      — Log a completed service
    EditVehicleModal.jsx     — Edit vehicle details
```

## Key Features

1. **Login → Dashboard shortcut**: On auth, checks for existing vehicle. If found, loads directly to dashboard (skips onboarding).
2. **AI-led onboarding**: Claude asks smart contextual questions — no tow package for a Mustang, etc.
3. **Actual interval tracking**: Uses real service history (not arbitrary guesses). Unknown services are flagged as "Inspect at next visit".
4. **Service logging**: Log date, mileage, product brand, condition notes. Automatically resets the task interval.
5. **Edit vehicle**: Edit all vehicle details from the dashboard.
6. **Anthropic proxy**: API calls go through Vite's proxy (`/api/anthropic`) so the API key stays server-side.

## Environment Variables

Set in `.replit` under `[userenv.shared]`:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `ANTHROPIC_KEY` | Your Anthropic API key (server-side only, not VITE_ prefixed) |

## Supabase Setup

Run `supabase-setup.sql` in your Supabase SQL Editor to create all required tables with RLS policies.

Required tables: `profiles`, `vehicles`, `mileage_logs`, `maintenance_tasks`, `service_logs`, `ai_schedule_generations`

## Development

```bash
npm run dev    # starts on port 5000
```

## User Preferences

- Mobile-first design, max-width 480px
- Dark navy color scheme with teal accents
- No hardcoded API keys in source files
