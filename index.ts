import fs from "fs";

const APP_ID = 570;
const API_URL = `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=${APP_ID}&offset=0&count=10&l=english`;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const INTERNATIONAL_EVENT_TYPE = 28;
const TIME_WINDOW_SECONDS = 17 * 60; // fallback for first run (no state yet)
const HEARTBEAT_INTERVAL_SECONDS = 24 * 60 * 60;
const STATE_FILE = "state.json";

interface SteamEvent {
  clan_event_gid: string;
  event_type: number;
  announcement_body: {
    headline: string;
    body: string;
    posttime: number;
  };
}

interface TelegramMessageOptions {
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

interface AppState {
  lastSeenTime: number | null; // unix seconds of the latest processed event
  lastHeartbeat: number | null; // unix seconds of the last heartbeat message
}

function loadState(): AppState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as AppState;
    }
  } catch {
    // corrupted file — start fresh
  }
  return { lastSeenTime: null, lastHeartbeat: null };
}

function saveState(state: AppState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function sendTelegramMessage(options: TelegramMessageOptions) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.warn("[Telegram] TELEGRAM_TOKEN or CHAT_ID is not set — skipping.");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: options.text,
      parse_mode: options.parseMode ?? "Markdown",
      // disable link previews so heartbeat/error messages stay compact
      link_preview_options: { is_disabled: true },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[Telegram] Failed: ${response.status} — ${body}`);
  }
}

async function sendErrorAlert(stage: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[Error] ${stage}: ${msg}`);
  try {
    await sendTelegramMessage({
      text: `⚠️ *TI Announcer — Error*\n\n*Stage:* \`${stage}\`\n*Details:* \`${msg}\``,
    });
  } catch (telegramError) {
    console.error(
      "[Error] Could not send error alert to Telegram:",
      telegramError,
    );
  }
}

async function sendTicketAlert(title: string, gid: string) {
  const link = `https://store.steampowered.com/news/app/${APP_ID}/view/${gid}`;
  await sendTelegramMessage({
    text:
      `🚨 *TI 2026 TICKETS ALERT?*\n\n` +
      `*Title:* ${title}\n\n` +
      `[Open in Steam](${link})`,
  });
}

async function sendHeartbeat(): Promise<void> {
  const now = new Date().toUTCString();
  await sendTelegramMessage({
    text: `💚 *TI Announcer — Heartbeat*\n\nBot is alive and polling every 15 minutes\\.\n\n_${now}_`,
    parseMode: "MarkdownV2",
  });
}

async function checkForTickets(): Promise<void> {
  let state: AppState;
  try {
    state = loadState();
    console.log("[State] Loaded:", JSON.stringify(state));
  } catch (error) {
    await sendErrorAlert("load_state", error);
    state = { lastSeenTime: null, lastHeartbeat: null };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  let events: SteamEvent[] = [];
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { events?: SteamEvent[] };
    events = data.events ?? [];
    if (events.length === 0) {
      throw new Error("Response returned an empty events array");
    }

    console.log(`[Steam] Fetched ${events.length} events.`);
  } catch (error) {
    await sendErrorAlert("fetch_steam_api", error);
    process.exit(1);
  }

  try {
    // Sort ascending by posttime so we process oldest-first and update
    // lastSeenTime correctly in case multiple new events arrive at once.
    const tiEvents = events
      .filter((e) => e.event_type === INTERNATIONAL_EVENT_TYPE)
      .sort(
        (a, b) => a.announcement_body.posttime - b.announcement_body.posttime,
      );

    for (const event of tiEvents) {
      const title = event.announcement_body?.headline ?? "";
      const posttime = Number(event.announcement_body?.posttime);
      const gid = event.clan_event_gid;

      if (!posttime) {
        continue;
      }

      // On the very first run (no state) fall back to the time-window guard.
      // On subsequent runs, alert on anything newer than what we last saw.
      const isNew =
        state.lastSeenTime === null
          ? nowSeconds - posttime <= TIME_WINDOW_SECONDS
          : posttime > state.lastSeenTime;

      if (isNew) {
        console.log(`[Event] New event found: "${title}" (gid=${gid})`);
        await sendTicketAlert(title, gid);
        state.lastSeenTime = posttime;
      }
    }
  } catch (error) {
    await sendErrorAlert("process_events", error);
  }

  const shouldHeartbeat =
    state.lastHeartbeat === null ||
    nowSeconds - state.lastHeartbeat >= HEARTBEAT_INTERVAL_SECONDS;

  if (shouldHeartbeat) {
    try {
      await sendHeartbeat();
      state.lastHeartbeat = nowSeconds;
      console.log("[Heartbeat] Sent.");
    } catch (error) {
      await sendErrorAlert("send_heartbeat", error);
    }
  }

  try {
    saveState(state);
    console.log("[State] Saved:", JSON.stringify(state));
  } catch (error) {
    await sendErrorAlert("save_state", error);
  }
}

checkForTickets();
