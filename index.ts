import fs from "fs/promises";

const APP_ID = 570;
const API_URL = `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=${APP_ID}&offset=0&count=10&l=english`;
const DB_FILE = "./state.json";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const HEARTBEAT_INTERVAL = 24 * 60 * 60; // 24 hours

async function loadState() {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { lastHeartbeat: 0, seenIds: [] };
  }
}

async function saveState(state: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2));
  console.log(`[State] Saved: ${JSON.stringify(state)}`);
}

async function sendTelegramAlert(text: string) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error("[Error]: TELEGRAM_TOKEN or CHAT_ID is not set");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
      parse_mode: "Markdown",
    }),
  });
}

async function checkForTickets() {
  try {
    const state = await loadState();
    console.log(`[State] Loaded: ${JSON.stringify(state)}`);
    let stateUpdated = false;

    const response = await fetch(API_URL);
    const data = await response.json();
    const events = data.events || [];
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (nowSeconds - state.lastHeartbeat >= HEARTBEAT_INTERVAL) {
      await sendTelegramAlert(`💓 Script TI 2026 is running`);
      state.lastHeartbeat = nowSeconds;
      stateUpdated = true;
      console.log("[Heartbeat] sent to Telegram");
    }

    for (const event of events) {
      if (event.event_type === 28) {
        const gid = event.clan_event_gid;

        if (!state.seenIds.includes(gid)) {
          const title = event.announcement_body?.name || "No title";
          const link = `https://store.steampowered.com/news/app/${APP_ID}/view/${gid}`;

          await sendTelegramAlert(
            `🚨 *NEW THE INTERNATIONAL NEWS!*\n\n*Title:* ${title}\n\n[Open in Steam](${link})`,
          );

          state.seenIds.push(gid);
          if (state.seenIds.length > 20) {
            state.seenIds.shift();
          }

          stateUpdated = true;
        }
      }
    }

    if (stateUpdated) {
      await saveState(state);
    } else {
      console.log("[State] No changes, not updated");
    }
  } catch (error) {
    console.error("[Error]:", error);
    process.exit(1);
  }
}

checkForTickets();
