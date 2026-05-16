const APP_ID = 570;
const API_URL = `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=${APP_ID}&offset=0&count=10&l=english`;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

interface SteamEvent {
  clan_event_gid: string;
  event_type: number;
  announcement_body: {
    headline: string;
    body: string;
    posttime: number;
  };
}

async function sendTelegramAlert(title: string, gid: string) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    return;
  }

  const link = `https://store.steampowered.com/news/app/${APP_ID}/view/${gid}`;
  const text =
    `🚨 *TI 2026 TICKETS ALERT?*\n\n` +
    `*Title:* ${title}\n\n` +
    `[Open in Steam](${link})`;

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

    const nowSeconds = Math.floor(Date.now() / 1000);
    const TIME_WINDOW_SECONDS = 17 * 60;

    for (const event of events) {
      if (event.event_type === 28) {
        const title = event.announcement_body?.headline || "";
        const posttime = Number(event.announcement_body?.posttime);

        if (!posttime) {
          continue;
        }

        const isRecent = nowSeconds - posttime <= TIME_WINDOW_SECONDS;

        if (isRecent) {
          await sendTelegramAlert(title, event.clan_event_gid);
        }
      }
    }
  } catch (error) {
    process.exit(1);
  }
}

checkForTickets();
