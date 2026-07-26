// Focus Quest - Real-time Background Distraction Blocker & Redemption Engine
// Features: Shadow DOM isolated full-screen overlay when HP <= 0 on distracting sites.

function injectShadowOverlay() {
  if (document.getElementById("focus-quest-shadow-root")) return;

  const container = document.createElement("div");
  container.id = "focus-quest-shadow-root";
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.zIndex = "2147483647"; // Maximum possible z-index

  const shadow = container.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .overlay {
      position: fixed;
      inset: 0;
      background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #f8fafc;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 1rem;
    }
    .panel {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(244, 63, 94, 0.4);
      box-shadow: 0 0 30px rgba(244, 63, 94, 0.25);
      border-radius: 1rem;
      padding: 2rem;
      max-width: 360px;
      width: 100%;
      text-align: center;
      backdrop-filter: blur(12px);
    }
    .skull {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    .title {
      font-size: 1.5rem;
      font-weight: 900;
      color: #fb7185;
      letter-spacing: 0.1em;
      margin: 0 0 0.5rem 0;
    }
    .subtitle {
      font-size: 0.85rem;
      color: #94a3b8;
      margin-bottom: 1.25rem;
      line-height: 1.4;
    }
    .math-box {
      background: #020617;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .equation {
      font-family: monospace;
      font-size: 1.25rem;
      font-weight: bold;
      color: #34d399;
      margin-bottom: 0.75rem;
    }
    .input-row {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
    }
    input {
      width: 80px;
      padding: 0.4rem;
      border-radius: 0.5rem;
      border: 1px solid #475569;
      background: #0f172a;
      color: #34d399;
      font-family: monospace;
      font-size: 1.1rem;
      font-weight: bold;
      text-align: center;
      outline: none;
    }
    input:focus {
      border-color: #10b981;
    }
    button {
      padding: 0.4rem 1rem;
      border-radius: 0.5rem;
      border: none;
      background: linear-gradient(135deg, #10b981, #059669);
      color: #020617;
      font-size: 0.85rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    .msg {
      font-size: 0.8rem;
      font-weight: bold;
      margin-top: 0.5rem;
      min-height: 1.2rem;
    }
  `;

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const panel = document.createElement("div");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="skull">💀</div>
    <h1 class="title">HERO FAINTED</h1>
    <p class="subtitle">Your HP dropped to 0 due to distraction. Complete the Speed Math challenge to resurrect (+100 HP) and unblock access!</p>
    <div class="math-box">
      <div className="equation" id="eq">Solving Math...</div>
      <form id="math-form" class="input-row">
        <input type="number" id="ans" required autofocus autocomplete="off" />
        <button type="submit">Resurrect</button>
      </form>
      <div id="msg" class="msg"></div>
    </div>
  `;

  let a = Math.floor(Math.random() * 12) + 3;
  let b = Math.floor(Math.random() * 12) + 3;

  shadow.appendChild(style);
  shadow.appendChild(overlay);
  overlay.appendChild(panel);
  document.documentElement.appendChild(container);

  const eqEl = shadow.getElementById("eq");
  const formEl = shadow.getElementById("math-form");
  const ansEl = shadow.getElementById("ans");
  const msgEl = shadow.getElementById("msg");

  if (eqEl) eqEl.textContent = `${a} + ${b} = ?`;

  formEl?.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = Number(ansEl ? ansEl.value : 0);
    if (val === a + b) {
      if (msgEl) {
        msgEl.textContent = "🎉 Correct! Hero Resurrected!";
        msgEl.style.color = "#34d399";
      }

      chrome.storage.local.get(["playerState"], (result) => {
        const player = result.playerState || {};
        const revived = { ...player, hp: 100, isDead: false };
        chrome.storage.local.set({ playerState: revived }, () => {
          setTimeout(() => {
            container.remove();
            window.location.reload();
          }, 600);
        });
      });
    } else {
      if (msgEl) {
        msgEl.textContent = "❌ Incorrect. Try again.";
        msgEl.style.color = "#fb7185";
      }
      a = Math.floor(Math.random() * 12) + 3;
      b = Math.floor(Math.random() * 12) + 3;
      if (eqEl) eqEl.textContent = `${a} + ${b} = ?`;
      if (ansEl) ansEl.value = "";
    }
  });
}

function checkVerificationState() {
  try {
    const hostname = window.location.hostname.toLowerCase();
    chrome.storage.local.get(
      ["playerState", "blacklist"],
      ({ playerState, blacklist }) => {
        if (!playerState) return;

        const defaultBlacklist = [
          "youtube.com",
          "youtu.be",
          "instagram.com",
          "tiktok.com",
          "netflix.com",
          "reddit.com",
          "twitter.com",
          "x.com",
          "twitch.tv",
          "facebook.com",
        ];

        const list = blacklist || defaultBlacklist;
        const isDistracting = list.some((domain) =>
          hostname.includes(domain.toLowerCase())
        );

        if (isDistracting && playerState.isDead && playerState.focusMode) {
          injectShadowOverlay();
        }
      }
    );
  } catch (e) {
    // Ignore context errors
  }
}

// Perform verification on initial load & DOM changes
checkVerificationState();
const observer = new MutationObserver(() => checkVerificationState());
observer.observe(document.documentElement || document, {
  childList: true,
  subtree: true,
});
