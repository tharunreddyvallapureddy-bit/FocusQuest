## Focus Quest: Gamified Productivity Ecosystem (Firebase Architecture)

Focus Quest is a **Productivity RPG platform** designed to modify user browsing behavior using operant conditioning, transforming focus time into Health Points (HP), Experience Points (XP), and Gold currency.

---

### 🌐 System Architecture

- **Chrome Browser Extension** (React + Vite + Tailwind CSS, Manifest V3): Side Panel RPG HUD, declarativeNetRequest domain blocking, and offline local storage fallback.
- **Mobile & Web App** (React Native + Expo / Next.js): Analytics, inventory, and GitHub bounty board.
- **Firebase Backend** (Firebase Authentication + Cloud Firestore): Realtime synchronization of player vitals (`hp`, `xp`, `gold`, `level`, `avatarSeed`, `focusMode`).

---

### 🎮 RPG Economy & Mathematical Models

1. **Health Points (HP)**:
   - **Base Pool**: 300 HP.
   - **Distraction Decay**: -50 HP per 30 minutes (1800s) spent on blacklisted sites.
   - **Focus Heal**: +50 HP per 30 minutes spent on whitelisted sites.
   - **Zero HP State**: Triggers "Fainted" condition where distracting sites are hard-blocked via Chrome DNR rules.

2. **Mastery Experience Points (XP)**:
   - **Level Curve**: $\text{Level} = \lfloor 0.05 \times \sqrt{\text{XP}} \rfloor + 1$. Quadratic progression rewards consistency over spikes.

3. **Gold Currency & Valuation**:
   - **Real-World Metric**: 100 Gold $\approx$ 0.5 INR valuation.

4. **DiceBear Adventurer Avatars**:
   - Dynamic avatar rendering using seed strings: `https://api.dicebear.com/7.x/adventurer/svg?seed=...`

---

### 🗄️ Firestore Database Schema

#### `profiles` (Collection)
```json
{
  "userId": "string (PK)",
  "username": "string",
  "avatarSeed": "string",
  "xp": "number",
  "hp": "number",
  "maxHp": "number",
  "gold": "number",
  "level": "number",
  "isDead": "boolean",
  "focusMode": "boolean",
  "updatedAt": "timestamp"
}
```

#### `activity_logs` (Collection)
```json
{
  "userId": "string",
  "domain": "string",
  "category": "educational | distracting | neutral",
  "durationSeconds": "number",
  "createdAt": "timestamp"
}
```

---

### 🚀 Local Development Setup

1. **Install Dependencies**:
   ```bash
   cd apps/extension
   npm install
   ```

2. **Build Extension**:
   ```bash
   npm run build
   ```

3. **Load in Chrome**:
   - Navigate to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select `apps/extension/dist`
