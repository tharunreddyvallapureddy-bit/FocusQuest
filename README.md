## Focus Quest

Focus Quest is a **gamified digital wellbeing** ecosystem:

- **Chrome Extension** (React + Vite + Tailwind) that tracks browsing, adjusts HP/Coins, and can block distracting sites using Chrome Local Storage.
- **Mobile Companion App** (React Native + Expo + NativeWind) that shows your stats, goals, bounties, and lets you play logic games.

### Monorepo Layout

- `apps/`
  - `extension/` — Chrome extension (React + Vite + Tailwind, Manifest V3).
  - `mobile/` — React Native (Expo) companion app with NativeWind.
- `packages/`
  - `shared/` — Shared game rules and TypeScript types.


