// Focus Quest - Content Script Blocker
// When HP hits 0 (playerState.isDead = true), show a full-screen
// "YOU DIED" overlay and require the user to beat a small
// Speed Math game to revive (HP = 20) and remove the block.

function injectOverlay() {
  if (document.getElementById("focus-quest-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "focus-quest-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "999999";
  overlay.style.background = "linear-gradient(135deg,#020617,#0f172a)";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.color = "#e5e7eb";
  overlay.style.fontFamily =
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const panel = document.createElement("div");
  panel.style.background = "#020617dd";
  panel.style.border = "1px solid #1f2937";
  panel.style.borderRadius = "0.75rem";
  panel.style.padding = "1.5rem";
  panel.style.minWidth = "260px";
  panel.style.boxShadow = "0 25px 50px -12px rgba(0,0,0,0.8)";

  const title = document.createElement("h1");
  title.textContent = "YOU DIED";
  title.style.fontSize = "1.8rem";
  title.style.letterSpacing = "0.25em";
  title.style.textAlign = "center";
  title.style.marginBottom = "0.75rem";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Your focus dropped to 0 HP.";
  subtitle.style.opacity = "0.8";
  subtitle.style.marginBottom = "1rem";
  subtitle.style.textAlign = "center";

  const instructions = document.createElement("p");
  instructions.textContent =
    "Win this Speed Math challenge to revive (HP = 20) and unblock distracting sites.";
  instructions.style.fontSize = "0.85rem";
  instructions.style.opacity = "0.8";
  instructions.style.marginBottom = "1rem";
  instructions.style.textAlign = "center";

  // Simple speed math game: a + b = ?
  const form = document.createElement("form");
  form.style.display = "flex";
  form.style.alignItems = "center";
  form.style.justifyContent = "center";
  form.style.gap = "0.5rem";
  form.style.marginBottom = "0.75rem";

  let a = 2;
  let b = 2;

  function newProblem() {
    a = Math.floor(Math.random() * 9) + 1;
    b = Math.floor(Math.random() * 9) + 1;
    question.textContent = `${a} + ${b} =`;
    input.value = "";
    message.textContent = "";
  }

  const question = document.createElement("span");
  question.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco";
  question.style.fontSize = "1.1rem";
  question.style.minWidth = "80px";

  const input = document.createElement("input");
  input.type = "number";
  input.style.width = "70px";
  input.style.padding = "0.25rem 0.5rem";
  input.style.borderRadius = "0.375rem";
  input.style.border = "1px solid #4b5563";
  input.style.background = "#020617";
  input.style.color = "#e5e7eb";

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Answer";
  button.style.padding = "0.3rem 0.75rem";
  button.style.borderRadius = "0.375rem";
  button.style.border = "none";
  button.style.background = "#10b981";
  button.style.color = "#0b1120";
  button.style.fontSize = "0.8rem";
  button.style.cursor = "pointer";

  form.appendChild(question);
  form.appendChild(input);
  form.appendChild(button);

  const message = document.createElement("div");
  message.style.fontSize = "0.8rem";
  message.style.textAlign = "center";
  message.style.minHeight = "1.2rem";

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const expected = a + b;
    const val = Number(input.value);
    if (val === expected) {
      message.textContent = "Correct! You are revived with 20 HP.";
      message.style.color = "#6ee7b7";

      chrome.storage.local.get(["playerState"], (result) => {
        const player =
          result.playerState || {
            hp: 0,
            maxHp: 100,
            coins: 0,
            level: 1,
            intellectXp: 0,
            isDead: true,
          };
        const revived = { ...player, hp: 20, isDead: false };
        chrome.storage.local.set({ playerState: revived }, () => {
          setTimeout(() => {
            overlay.remove();
            window.location.reload();
          }, 600);
        });
      });
    } else {
      message.textContent = "Not quite. Try another one.";
      message.style.color = "#fca5a5";
      newProblem();
    }
  });

  newProblem();

  panel.appendChild(title);
  panel.appendChild(subtitle);
  panel.appendChild(instructions);
  panel.appendChild(form);
  panel.appendChild(message);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function checkBlockState() {
  chrome.storage.local.get(["playerState"], (result) => {
    if (chrome.runtime.lastError) return;
    const player = result.playerState;
    if (player && player.isDead) {
      injectOverlay();
    }
  });
}

// Initial check and observe SPA navigations
checkBlockState();

const observer = new MutationObserver(() => {
  checkBlockState();
});

observer.observe(document.documentElement || document, {
  childList: true,
  subtree: true,
});

