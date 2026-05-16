import fs from "fs/promises";

const APP_ID = 570;
const API_URL = `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=${APP_ID}&offset=0&count=10&l=russian`;

const DB_FILE = "./last_news.json";

const TELEGRAM_TOKEN = "8847430512:AAGD3RBhybSeJb-YLp-vxoL0J_ax6Z9VNzs";
const CHAT_ID = "344165905";

const STEAM_EVENT_TYPE_THE_INTERNATIONAL = 28;

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

async function sendTelegramAlert(title: string, gid: string) {
  const link = `https://store.steampowered.com/news/app/${APP_ID}/view/${gid}`;

  const text =
    `🚨 *TICKETS FOR THE INTERNATIONAL 2026?*\n\n` +
    `*Title:* ${title}\n\n` +
    `[Open announcement](${link})`;

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: "Markdown",
      }),
    });

    console.log(`Уведомление отправлено: ${title}`);
  } catch (err) {
    console.error("Ошибка отправки в Telegram:", err);
  }
}

async function checkForTickets() {
  console.log("Проверяем Steam Events API...");

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const events: SteamEvent[] = data.events || [];

    const seenIds = await loadSeenNews();
    let stateUpdated = false;

    for (const event of events) {
      if (event.event_type === STEAM_EVENT_TYPE_THE_INTERNATIONAL) {
        const gid = event.clan_event_gid;

        if (!seenIds.includes(gid)) {
          const title = event.announcement_body?.name || "";
          await sendTelegramAlert(title, gid);
          seenIds.push(gid);
          stateUpdated = true;
        }
      }
    }

    if (stateUpdated) {
      await saveSeenNews(seenIds);
    }
  } catch (error) {
    console.error("Ошибка при запросе к Steam API:", error);
  }
}

setInterval(checkForTickets, 5 * 60 * 1000);
checkForTickets();
