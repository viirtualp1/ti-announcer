import fs from "fs/promises";

const APP_ID = 570;
const API_URL = `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=${APP_ID}&offset=0&count=10&l=russian`;
const DB_FILE = "./last_news.json";

const INTERNATION_EVENT_TYPE = 28;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

interface SteamEvent {
  clan_event_gid: string;
  event_type: number;
  announcement_body: {
    name: string;
    body: string;
  };
}

async function loadSeenNews(): Promise<string[]> {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveSeenNews(seenIds: string[]) {
  await fs.writeFile(DB_FILE, JSON.stringify(seenIds, null, 2));
}

async function sendTelegramAlert(gid: string) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error("Error: TELEGRAM_TOKEN or CHAT_ID is not set");
    return;
  }

  const link = `https://store.steampowered.com/news/app/${APP_ID}/view/${gid}`;
  const text =
    `🚨 *NEW ANNOUNCEMENT ABOUT INTERNATIONAL*\n\n` + `[OPEN](${link})`;

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
    const response = await fetch(API_URL);
    const data = await response.json();
    const events: SteamEvent[] = data.events || [];

    const seenIds = await loadSeenNews();
    let stateUpdated = false;

    for (const event of events) {
      if (event.event_type === INTERNATION_EVENT_TYPE) {
        const gid = event.clan_event_gid;

        if (!seenIds.includes(gid)) {
          await sendTelegramAlert(gid);
          seenIds.push(gid);
          stateUpdated = true;
        }
      }
    }

    if (stateUpdated) {
      await saveSeenNews(seenIds);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

checkForTickets();
