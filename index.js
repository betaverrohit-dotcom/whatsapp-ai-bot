require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY;

const RAILRADAR_BASE = "https://api.railradar.in";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function getISTDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function bengaliToEnglishDigits(text = "") {
  const map = {
    "০": "0",
    "১": "1",
    "২": "2",
    "৩": "3",
    "৪": "4",
    "৫": "5",
    "৬": "6",
    "৭": "7",
    "৮": "8",
    "৯": "9"
  };

  return text.replace(/[০-৯]/g, d => map[d]);
}

function cleanText(text = "") {
  return bengaliToEnglishDigits(text)
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateDDMMYYYY(date) {
  const [y, m, d] = date.split("-");
  return `${d}-${m}-${y}`;
}

function timeToMinutes(time) {
  if (!time) return null;

  const match = String(time).match(/(\d{1,2}):(\d{2})/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(time) {
  if (!time) return "-";

  const match = String(time).match(/(\d{1,2}):(\d{2})/);

  if (!match) return time;

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/* =========================================================
   STATION ALIASES
========================================================= */

const STATIONS = {
  "শান্তিপুর": "STB",
  "শান্তিপুর স্টেশন": "STB",
  "shantipur": "STB",
  "shantipur station": "STB",
  "stb": "STB",

  "শিয়ালদা": "SDAH",
  "শিয়ালদা": "SDAH",
  "শিয়ালদহ": "SDAH",
  "শিয়ালদহ": "SDAH",
  "sealdah": "SDAH",
  "sealdah station": "SDAH",
  "sdah": "SDAH",

  "রানাঘাট": "RHA",
  "ranaghat": "RHA",
  "rha": "RHA",

  "কৃষ্ণনগর": "KNJ",
  "krishnanagar": "KNJ",
  "knj": "KNJ",

  "কল্যাণী": "KLYM",
  "kalyani": "KLYM",

  "নৈহাটি": "NH",
  "naihati": "NH",
  "nh": "NH",

  "বনগাঁ": "BNJ",
  "বনগাঁ জংশন": "BNJ",
  "bongaon": "BNJ",
  "bangaon": "BNJ",
  "bnj": "BNJ",

  "বারাসত": "BT",
  "barasat": "BT",

  "দমদম": "DDJ",
  "dum dum": "DDJ",
  "dumdum": "DDJ",
  "ddj": "DDJ",

  "কলকাতা": "KOAA",
  "kolkata": "KOAA"
};

function findStationCode(text) {
  const original = text || "";
  const normalized = cleanText(original);

  const keys = Object.keys(STATIONS).sort(
    (a, b) => b.length - a.length
  );

  for (const key of keys) {
    if (normalized.includes(cleanText(key))) {
      return STATIONS[key];
    }
  }

  const codeMatch = original.match(/\b[A-Za-z]{2,5}\b/);

  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();

    if (Object.values(STATIONS).includes(code)) {
      return code;
    }
  }

  return null;
}

/* =========================================================
   DATE DETECTION
========================================================= */

function detectDate(text) {
  const today = getISTDate();

  const normalized = bengaliToEnglishDigits(text);

  if (
    /আজ|আজকে|today/i.test(text) ||
    /\btoday\b/i.test(text)
  ) {
    return today;
  }

  if (/কাল|আগামীকাল|tomorrow/i.test(text)) {
    const d = new Date(`${today}T12:00:00+05:30`);
    d.setDate(d.getDate() + 1);

    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  }

  const dayMatch = normalized.match(
    /(?:^|\s)(\d{1,2})\s*(?:তারিখ|date)(?:\s|$)/i
  );

  if (dayMatch) {
    const day = Number(dayMatch[1]);

    if (day >= 1 && day <= 31) {
      const [, year, month] = today.match(
        /^(\d{4})-(\d{2})-\d{2}$/
      );

      const candidate = `${year}-${month}-${String(day).padStart(
        2,
        "0"
      )}`;

      return candidate;
    }
  }

  return today;
}

/* =========================================================
   TIME DETECTION
========================================================= */

function detectAfterHour(text) {
  const normalized = bengaliToEnglishDigits(
    String(text).toLowerCase()
  );

  if (
    normalized.includes("বারোটার পর") ||
    normalized.includes("বারোটার পরে") ||
    normalized.includes("12টার পর") ||
    normalized.includes("12টার পরে") ||
    normalized.includes("12 pm") ||
    normalized.includes("দুপুর 12")
  ) {
    return 12;
  }

  const hourMatch = normalized.match(
    /(\d{1,2})\s*(?:টার|টা|টায়|টা থেকে|টার পর|টা পর|pm|am)/i
  );

  if (hourMatch) {
    let hour = Number(hourMatch[1]);

    if (normalized.includes("pm") && hour < 12) {
      hour += 12;
    }

    return hour;
  }

  return null;
}

/* =========================================================
   TRAIN NUMBER
========================================================= */

function detectTrainNumber(text) {
  const normalized = bengaliToEnglishDigits(text);

  const matches = normalized.match(/\b\d{5}\b/g);

  if (!matches) return null;

  for (const number of matches) {
    if (!/^\d{5}$/.test(number)) continue;

    return number;
  }

  return null;
}

/* =========================================================
   RAILRADAR API
========================================================= */

async function railRadarGet(path, params = {}) {
  if (!RAILRADAR_API_KEY) {
    throw new Error("RAILRADAR_API_KEY is missing");
  }

  const response = await axios.get(
    `${RAILRADAR_BASE}${path}`,
    {
      params,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${RAILRADAR_API_KEY}`,
        Accept: "application/json"
      }
    }
  );

  return response.data;
}

/* =========================================================
   STATION SEARCH
========================================================= */

async function searchStation(query) {
  try {
    const data = await railRadarGet(
      "/v1/lookup/search/stations",
      {
        q: query,
        limit: 10
      }
    );

    return data;
  } catch (error) {
    console.error(
      "Station Search Error:",
      error.response?.data || error.message
    );

    return null;
  }
}

/* =========================================================
   RESOLVE STATION
========================================================= */

async function resolveStation(value) {
  if (!value) return null;

  const direct = findStationCode(value);

  if (direct) {
    return direct;
  }

  const result = await searchStation(value);

  const stations =
    result?.data?.stations ||
    result?.stations ||
    [];

  if (Array.isArray(stations) && stations.length > 0) {
    return (
      stations[0]?.code ||
      stations[0]?.stationCode ||
      null
    );
  }

  return null;
}

/* =========================================================
   TRAINS BETWEEN STATIONS
========================================================= */

async function getTrainsBetween(
  from,
  to,
  date,
  live = false
) {
  return await railRadarGet(
    `/v1/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
    {
      date,
      live: live ? "true" : "false"
    }
  );
}

/* =========================================================
   FORMAT TRAINS
========================================================= */

function formatBetweenResult(
  result,
  date,
  afterHour = null
) {
  const data = result?.data || result;

  const trains = Array.isArray(data?.trains)
    ? data.trains
    : [];

  if (trains.length === 0) {
    return (
      `🚆 ${formatDateDDMMYYYY(date)} তারিখে ` +
      `এই রুটে কোনো ট্রেন পাওয়া যায়নি।`
    );
  }

  let filtered = trains;

  if (afterHour !== null) {
    const minimum = afterHour * 60;

    filtered = trains.filter(train => {
      const departure =
        train?.from?.departure ||
        train?.departure ||
        null;

      const minutes = timeToMinutes(departure);

      return minutes !== null && minutes >= minimum;
    });
  }

  if (filtered.length === 0) {
    return (
      `🚆 ${formatDateDDMMYYYY(date)} তারিখে ` +
      `${afterHour}:00-এর পর এই রুটে কোনো নির্ধারিত ট্রেন পাওয়া যায়নি।`
    );
  }

  const fromName =
    data?.from?.name ||
    data?.from?.code ||
    "";

  const toName =
    data?.to?.name ||
    data?.to?.code ||
    "";

  let reply =
    `🚆 ${fromName} → ${toName}\n` +
    `📅 ${formatDateDDMMYYYY(date)}\n\n`;

  filtered.forEach((item, index) => {
    const train = item?.train || {};

    const departure =
      item?.from?.departure ||
      item?.departure ||
      "-";

    const arrival =
      item?.to?.arrival ||
      item?.arrival ||
      "-";

    const delay =
      item?.live?.delayMinutes;

    const platform =
      item?.live?.platform;

    reply +=
      `${index + 1}. 🚆 ${train.number || "-"} ${train.name || ""}\n` +
      `   ছাড়বে: ${formatTime(departure)}\n` +
      `   পৌঁছাবে: ${formatTime(arrival)}`;

    if (delay !== undefined && delay !== null) {
      reply += `\n   ⏱️ বিলম্ব: ${delay} মিনিট`;
    }

    if (platform) {
      reply += `\n   🚉 প্ল্যাটফর্ম: ${platform}`;
    }

    reply += "\n\n";
  });

  reply +=
    "ℹ️ সময়সূচি RailRadar railway data থেকে নেওয়া হয়েছে। " +
    "লাইভ পরিবর্তনের ক্ষেত্রে Live Status ব্যবহার করুন।";

  return reply.trim();
}

/* =========================================================
   LIVE TRAIN STATUS
========================================================= */

async function getLiveTrain(trainNumber) {
  return await railRadarGet(
    `/v1/trains/${encodeURIComponent(trainNumber)}/live`,
    {
      authoritative: "true"
    }
  );
}

function formatLiveStatus(result) {
  const data = result?.data || result;

  if (!data) {
    return "🚆 এই ট্রেনের live status পাওয়া যায়নি।";
  }

  const train =
    data.train ||
    {};

  const current =
    data.currentLocation ||
    {};

  const next =
    data.nextHalt ||
    {};

  const previous =
    data.previousHalt ||
    {};

  const delay =
    data.delayMinutes;

  let reply =
    `🚆 ${data.trainNumber || train.number || "-"} ${train.name || ""}\n\n`;

  reply +=
    `📍 Status: ${data.status || "অজানা"}\n`;

  if (delay !== undefined && delay !== null) {
    reply +=
      `⏱️ Delay: ${delay} মিনিট\n`;
  }

  if (current.stationCode) {
    reply +=
      `📍 বর্তমান স্টেশন: ${current.stationCode}\n`;
  }

  if (current.status) {
    reply +=
      `🚉 বর্তমান অবস্থা: ${current.status}\n`;
  }

  if (next.stationName || next.stationCode) {
    reply +=
      `➡️ পরবর্তী স্টেশন: ${
        next.stationName || next.stationCode
      }\n`;
  }

  if (previous.stationName || previous.stationCode) {
    reply +=
      `⬅️ আগের স্টেশন: ${
        previous.stationName || previous.stationCode
      }\n`;
  }

  if (data.lastUpdatedAt) {
    reply +=
      `🕒 Updated: ${data.lastUpdatedAt}\n`;
  }

  reply +=
    "\n🗺️ Live Map দেখতে ওয়েবসাইটের Live Map ব্যবহার করুন।";

  return reply.trim();
}

/* =========================================================
   PNR
========================================================= */

async function getPNR(pnr) {
  return await railRadarGet(
    `/v1/pnr/${encodeURIComponent(pnr)}`
  );
}

function findValue(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return obj[key];
    }
  }

  return null;
}

function formatPNR(result, pnr) {
  const data = result?.data || result;

  if (!data) {
    return `❌ PNR ${pnr}-এর তথ্য পাওয়া যায়নি।`;
  }

  const trainNumber = findValue(
    data,
    ["trainNumber", "trainNo", "number"]
  );

  const trainName = findValue(
    data,
    ["trainName", "name"]
  );

  const journeyDate = findValue(
    data,
    ["journeyDate", "date", "jdate"]
  );

  const from = findValue(
    data,
    ["from", "fromStation", "source"]
  );

  const to = findValue(
    data,
    ["to", "toStation", "destination"]
  );

  const chartStatus = findValue(
    data,
    ["chartStatus", "chartingStatus"]
  );

  const passengers =
    data.passengers ||
    data.passengerDetails ||
    data.bookingStatus ||
    [];

  let reply =
    `🎫 PNR Status\n` +
    `━━━━━━━━━━━━━━\n` +
    `PNR: ${pnr}\n`;

  if (trainNumber || trainName) {
    reply +=
      `🚆 Train: ${trainNumber || ""} ${trainName || ""}\n`;
  }

  if (journeyDate) {
    reply += `📅 Journey: ${journeyDate}\n`;
  }

  if (from || to) {
    reply +=
      `🛤️ Route: ${formatStationValue(from)} → ${formatStationValue(to)}\n`;
  }

  if (chartStatus) {
    reply +=
      `📋 Chart: ${chartStatus}\n`;
  }

  if (Array.isArray(passengers) && passengers.length > 0) {
    reply += "\n👤 Passenger Status:\n";

    passengers.forEach((p, i) => {
      const booking = findValue(
        p,
        [
          "bookingStatus",
          "booking",
          "bookingStatusText"
        ]
      );

      const current = findValue(
        p,
        [
          "currentStatus",
          "current",
          "currentStatusText",
          "status"
        ]
      );

      reply +=
        `${i + 1}. Booking: ${booking || "-"} | Current: ${current || "-"}\n`;
    });
  }

  return reply.trim();
}

function formatStationValue(value) {
  if (!value) return "-";

  if (typeof value === "string") {
    return value;
  }

  return (
    value.name ||
    value.stationName ||
    value.code ||
    value.stationCode ||
    "-"
  );
}

/* =========================================================
   ROUTE / MAP
========================================================= */

async function getTrainRoute(trainNumber) {
  return await railRadarGet(
    `/v1/trains/${encodeURIComponent(trainNumber)}/route`,
    {
      format: "geojson",
      stops: "true"
    }
  );
}

function buildMapData(liveResult, routeResult) {
  const live =
    liveResult?.data ||
    liveResult ||
    {};

  const route =
    routeResult?.data ||
    routeResult ||
    {};

  return {
    trainNumber:
      live.trainNumber ||
      route.trainNumber ||
      "",

    trainName:
      live.train?.name ||
      "",

    status:
      live.status ||
      "",

    delayMinutes:
      live.delayMinutes ??
      null,

    currentLocation:
      live.currentLocation ||
      null,

    nextHalt:
      live.nextHalt ||
      null,

    geojson:
      route.geojson ||
      null,

    stops:
      route.stops ||
      []
  };
}

/* =========================================================
   GEMINI GENERAL AI
========================================================= */

async function generateAIReply(userMessage) {
  if (!ai) {
    return (
      "নমস্কার! 🚆 Sealdah Train Service Bot-এ আপনাকে স্বাগতম।\n\n" +
      "ট্রেনের তথ্যের জন্য লিখুন:\n" +
      "• শান্তিপুর থেকে শিয়ালদা ট্রেন\n" +
      "• ২৯ তারিখ ১২টার পর শান্তিপুর থেকে শিয়ালদা\n" +
      "• Live 31530\n" +
      "• PNR 1234567890"
    );
  }

  const prompt = `
তুমি Sealdah Train Service WhatsApp Assistant।

ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
উত্তর ছোট ও WhatsApp-friendly রাখবে।

তুমি কখনো নিজে থেকে train timing, live status বা PNR information বানিয়ে বলবে না।
Railway data API থেকে না এলে নিশ্চিত তথ্য হিসেবে কিছু বলবে না।

সাধারণ greeting-এর সুন্দর উত্তর দাও।

User message:
${userMessage}
`;

  const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
  ];

  for (const model of models) {
    try {
      const response =
        await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel: "minimal"
            },
            maxOutputTokens: 300
          }
        });

      const text =
        response?.text ||
        response?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return text.trim();
      }
    } catch (error) {
      console.error(
        `Gemini Error (${model}):`,
        error?.message || error
      );
    }
  }

  return (
    "নমস্কার! 🚆\n" +
    "আপনি কী জানতে চান লিখুন।\n\n" +
    "যেমন:\n" +
    "• শান্তিপুর থেকে শিয়ালদা\n" +
    "• আজ ১২টার পর শান্তিপুর থেকে শিয়ালদা\n" +
    "• Live 31530\n" +
    "• PNR 1234567890"
  );
}

/* =========================================================
   SMART WHATSAPP PROCESSOR
========================================================= */

async function processUserMessage(userMessage) {
  const normalized = cleanText(userMessage);

  /* ---------------------------------
     PNR
  --------------------------------- */

  const pnrMatch = bengaliToEnglishDigits(
    userMessage
  ).match(/\b\d{10}\b/);

  if (
    pnrMatch &&
    (
      normalized.includes("pnr") ||
      normalized.includes("পিএনআর") ||
      normalized.includes("পিএনআর স্ট্যাটাস")
    )
  ) {
    try {
      const result = await getPNR(pnrMatch[0]);

      return formatPNR(
        result,
        pnrMatch[0]
      );
    } catch (error) {
      console.error(
        "PNR Error:",
        error.response?.data || error.message
      );

      return (
        `❌ PNR ${pnrMatch[0]}-এর তথ্য এখন পাওয়া যাচ্ছে না।\n` +
        `কিছুক্ষণ পরে আবার চেষ্টা করুন।`
      );
    }
  }

  /* ---------------------------------
     LIVE TRAIN
  --------------------------------- */

  const trainNumber =
    detectTrainNumber(userMessage);

  if (
    trainNumber &&
    (
      normalized.includes("live") ||
      normalized.includes("লাইভ") ||
      normalized.includes("running") ||
      normalized.includes("কোথায়") ||
      normalized.includes("কোথায়") ||
      normalized.includes("স্ট্যাটাস") ||
      normalized.includes("status")
    )
  ) {
    try {
      const result =
        await getLiveTrain(trainNumber);

      return formatLiveStatus(result);
    } catch (error) {
      console.error(
        "Live Train Error:",
        error.response?.data || error.message
      );

      return (
        `❌ ${trainNumber} ট্রেনের live status এখন পাওয়া যাচ্ছে না।\n` +
        `ট্রেন নম্বরটি ঠিক আছে কিনা দেখুন।`
      );
    }
  }

  /* ---------------------------------
     BETWEEN STATIONS
  --------------------------------- */

  const from =
    findStationCode(userMessage);

  let to = null;

  const routePatterns = [
    /থেকে\s+(.+?)(?:\s+যাওয়ার|\s+যাওয়ার|\s+যেতে|\s+ট্রেন|\s*$)/i,
    /থেকে\s+(.+?)\s+যাও/i,
    /from\s+(.+?)\s+to\s+(.+)/i
  ];

  for (const pattern of routePatterns) {
    const match = userMessage.match(pattern);

    if (match) {
      if (pattern.toString().includes("from")) {
        to = findStationCode(match[2]);
      } else {
        to = findStationCode(match[1]);
      }

      if (to) break;
    }
  }

  /* Known direct route detection */
  if (
    normalized.includes("শান্তিপুর") &&
    (
      normalized.includes("শিয়ালদা") ||
      normalized.includes("শিয়ালদা") ||
      normalized.includes("শিয়ালদহ") ||
      normalized.includes("শিয়ালদহ") ||
      normalized.includes("sealdah")
    )
  ) {
    return await handleBetween(
      "STB",
      "SDAH",
      userMessage
    );
  }

  if (from && to) {
    return await handleBetween(
      from,
      to,
      userMessage
    );
  }

  /* ---------------------------------
     Train number without explicit live
  --------------------------------- */

  if (
    trainNumber &&
    (
      normalized.includes("train") ||
      normalized.includes("ট্রেন") ||
      normalized.includes("সময়") ||
      normalized.includes("সময়") ||
      normalized.includes("schedule") ||
      normalized.includes("রুট")
    )
  ) {
    try {
      const result =
        await getLiveTrain(trainNumber);

      return formatLiveStatus(result);
    } catch (error) {
      console.error(
        "Train Error:",
        error.response?.data || error.message
      );

      return (
        `🚆 ${trainNumber} ট্রেনের তথ্য এখন পাওয়া যাচ্ছে না।`
      );
    }
  }

  /* ---------------------------------
     General AI
  --------------------------------- */

  return await generateAIReply(
    userMessage
  );
}

/* =========================================================
   BETWEEN HANDLER
========================================================= */

async function handleBetween(
  from,
  to,
  userMessage
) {
  const date =
    detectDate(userMessage);

  const afterHour =
    detectAfterHour(userMessage);

  const isToday =
    date === getISTDate();

  try {
    const result =
      await getTrainsBetween(
        from,
        to,
        date,
        isToday
      );

    return formatBetweenResult(
      result,
      date,
      afterHour
    );
  } catch (error) {
    console.error(
      "Between Error:",
      error.response?.data || error.message
    );

    return (
      "❌ Railway data পাওয়া যাচ্ছে না।\n" +
      "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );
  }
}

/* =========================================================
   HOME PAGE
========================================================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>Sealdah Train Service AI Bot</title>

<link
rel="stylesheet"
href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
/>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  background:#080b14;
  color:#fff;
  font-family:Arial,Helvetica,sans-serif;
}

.container{
  max-width:1100px;
  margin:auto;
  padding:30px 20px;
}

.header{
  text-align:center;
  padding:20px 0 30px;
}

.header h1{
  margin:0;
  font-size:32px;
}

.header p{
  color:#9aa4b5;
}

.nav{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:25px;
  background:#101522;
  padding:10px;
  border-radius:12px;
}

.nav button{
  flex:1;
  min-width:130px;
  border:0;
  padding:14px;
  border-radius:8px;
  background:transparent;
  color:#aab4c5;
  font-size:16px;
  font-weight:bold;
  cursor:pointer;
}

.nav button:hover,
.nav button.active{
  background:#1d2637;
  color:#fff;
}

.card{
  background:#111725;
  border:1px solid #202a3b;
  border-radius:15px;
  padding:25px;
  margin-bottom:20px;
}

.card h2{
  margin-top:0;
}

input{
  width:100%;
  padding:14px;
  border-radius:8px;
  border:1px solid #303b50;
  background:#080c15;
  color:white;
  margin-bottom:12px;
  font-size:16px;
}

.action{
  width:100%;
  padding:14px;
  border:0;
  border-radius:8px;
  background:#2d6cdf;
  color:white;
  font-size:16px;
  font-weight:bold;
  cursor:pointer;
}

.result{
  margin-top:20px;
  background:#080c15;
  border-radius:10px;
  padding:18px;
  white-space:pre-wrap;
  line-height:1.6;
}

.section{
  display:none;
}

.section.active{
  display:block;
}

#map{
  height:550px;
  border-radius:12px;
  overflow:hidden;
}

.status{
  color:#70e1a1;
  font-weight:bold;
}

.footer{
  text-align:center;
  color:#667085;
  padding:30px 0;
  font-size:13px;
}

</style>
</head>

<body>

<div class="container">

<div class="header">

<h1>🚆 Sealdah Train Service AI Bot</h1>

<p>
Live railway information, PNR, trains between stations and live map
</p>

<p class="status">● System Online</p>

</div>

<div class="nav">

<button class="active" onclick="showSection('live',this)">
Live Status
</button>

<button onclick="showSection('pnr',this)">
PNR
</button>

<button onclick="showSection('between',this)">
Between
</button>

<button onclick="showSection('mapsection',this)">
Live Map
</button>

</div>


<div id="live" class="section active">

<div class="card">

<h2>🚆 Live Train Status</h2>

<input
id="liveTrain"
placeholder="Train Number e.g. 31530"
/>

<button
class="action"
onclick="getLiveStatus()">
Check Live Status
</button>

<div
id="liveResult"
class="result">
Train number দিয়ে Live Status দেখুন।
</div>

</div>

</div>


<div id="pnr" class="section">

<div class="card">

<h2>🎫 PNR Status</h2>

<input
id="pnrNumber"
maxlength="10"
placeholder="10 digit PNR"
/>

<button
class="action"
onclick="getPNR()">
Check PNR
</button>

<div
id="pnrResult"
class="result">
PNR number দিয়ে status দেখুন।
</div>

</div>

</div>


<div id="between" class="section">

<div class="card">

<h2>🚆 Trains Between Stations</h2>

<input
id="fromStation"
value="Shantipur"
placeholder="From station"
/>

<input
id="toStation"
value="Sealdah"
placeholder="To station"
/>

<input
id="journeyDate"
type="date"
/>

<button
class="action"
onclick="getBetween()">
Search Trains
</button>

<div
id="betweenResult"
class="result">
From এবং To station দিয়ে ট্রেন খুঁজুন।
</div>

</div>

</div>


<div id="mapsection" class="section">

<div class="card">

<h2>🗺️ Live Train Map</h2>

<input
id="mapTrain"
placeholder="Train Number e.g. 31530"
/>

<button
class="action"
onclick="loadMap()">
Show Live Map
</button>

<br><br>

<div id="map"></div>

<div
id="mapResult"
class="result">
Train number দিয়ে live map দেখুন।
</div>

</div>

</div>


<div class="footer">

Sealdah Train Service AI Bot<br>
Railway data powered by RailRadar

</div>

</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script>

let map = null;

function showSection(id,button){

  document
    .querySelectorAll(".section")
    .forEach(x => x.classList.remove("active"));

  document
    .getElementById(id)
    .classList.add("active");

  document
    .querySelectorAll(".nav button")
    .forEach(x => x.classList.remove("active"));

  button.classList.add("active");
}


function todayIST(){

  const now = new Date();

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:"Asia/Kolkata",
      year:"numeric",
      month:"2-digit",
      day:"2-digit"
    }
  ).format(now);
}


document.getElementById("journeyDate").value =
  todayIST();


async function getLiveStatus(){

  const train =
    document.getElementById("liveTrain").value.trim();

  const box =
    document.getElementById("liveResult");

  if(!train){

    box.textContent =
      "Train number দিন।";

    return;
  }

  box.textContent =
    "Loading live status...";

  try{

    const response =
      await fetch(
        "/api/live-status?train=" +
        encodeURIComponent(train)
      );

    const data =
      await response.json();

    box.textContent =
      data.message ||
      JSON.stringify(data,null,2);

  }catch(error){

    box.textContent =
      "Live status পাওয়া যাচ্ছে না।";

  }
}


async function getPNR(){

  const pnr =
    document.getElementById("pnrNumber").value.trim();

  const box =
    document.getElementById("pnrResult");

  if(!/^\\d{10}$/.test(pnr)){

    box.textContent =
      "সঠিক 10 digit PNR দিন।";

    return;
  }

  box.textContent =
    "Checking PNR...";

  try{

    const response =
      await fetch(
        "/api/pnr?pnr=" +
        encodeURIComponent(pnr)
      );

    const data =
      await response.json();

    box.textContent =
      data.message ||
      JSON.stringify(data,null,2);

  }catch(error){

    box.textContent =
      "PNR status পাওয়া যাচ্ছে না।";

  }
}


async function getBetween(){

  const from =
    document.getElementById("fromStation").value.trim();

  const to =
    document.getElementById("toStation").value.trim();

  const date =
    document.getElementById("journeyDate").value;

  const box =
    document.getElementById("betweenResult");

  if(!from || !to){

    box.textContent =
      "From এবং To station দিন।";

    return;
  }

  box.textContent =
    "Searching trains...";

  try{

    const url =
      "/api/between?from=" +
      encodeURIComponent(from) +
      "&to=" +
      encodeURIComponent(to) +
      "&date=" +
      encodeURIComponent(date);

    const response =
      await fetch(url);

    const data =
      await response.json();

    box.textContent =
      data.message ||
      JSON.stringify(data,null,2);

  }catch(error){

    box.textContent =
      "Train data পাওয়া যাচ্ছে না।";

  }
}


async function loadMap(){

  const train =
    document.getElementById("mapTrain").value.trim();

  const box =
    document.getElementById("mapResult");

  if(!train){

    box.textContent =
      "Train number দিন।";

    return;
  }

  box.textContent =
    "Loading live map...";

  try{

    const response =
      await fetch(
        "/api/map?train=" +
        encodeURIComponent(train)
      );

    const data =
      await response.json();

    if(data.error){

      box.textContent =
        data.error;

      return;
    }

    if(!map){

      map =
        L.map("map").setView(
          [22.57,88.36],
          8
        );

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            "&copy; OpenStreetMap contributors"
        }
      ).addTo(map);
    }

    map.eachLayer(layer => {

      if(
        layer instanceof L.Marker ||
        layer instanceof L.Polyline ||
        layer instanceof L.GeoJSON
      ){

        map.removeLayer(layer);

      }

    });

    if(data.geojson){

      const route =
        L.geoJSON(
          data.geojson
        ).addTo(map);

      map.fitBounds(
        route.getBounds()
      );
    }

    const stops =
      data.stops || [];

    const currentCode =
      data.currentLocation?.stationCode;

    let currentStop = null;

    stops.forEach(stop => {

      if(
        stop.code === currentCode
      ){

        currentStop = stop;

      }

    });

    if(currentStop){

      L.marker([
        currentStop.lat,
        currentStop.lng
      ])
      .addTo(map)
      .bindPopup(
        "🚆 " +
        data.trainNumber +
        "<br>" +
        (data.trainName || "") +
        "<br>📍 " +
        currentStop.name
      )
      .openPopup();

      map.setView(
        [
          currentStop.lat,
          currentStop.lng
        ],
        11
      );

    }

    box.textContent =
      "🚆 " +
      data.trainNumber +
      " " +
      (data.trainName || "") +
      "\\n" +
      "Status: " +
      (data.status || "-") +
      "\\n" +
      "Delay: " +
      (
        data.delayMinutes ??
        0
      ) +
      " মিনিট";

  }catch(error){

    console.error(error);

    box.textContent =
      "Live map এখন পাওয়া যাচ্ছে না।";

  }
}

</script>

</body>
</html>
  `);
});

/* =========================================================
   HEALTH API
========================================================= */

app.get("/api", (req, res) => {

  res.json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    whatsapp: !!WHATSAPP_TOKEN,
    gemini: !!GEMINI_API_KEY,
    railradar: !!RAILRADAR_API_KEY,
    features: [
      "Live Status",
      "PNR",
      "Between Stations",
      "Live Map"
    ]
  });

});

/* =========================================================
   API: LIVE STATUS
========================================================= */

app.get("/api/live-status", async (req, res) => {

  const train =
    bengaliToEnglishDigits(
      req.query.train || ""
    ).replace(/\D/g, "");

  if (!/^\d{5}$/.test(train)) {

    return res.status(400).json({
      error: true,
      message: "সঠিক 5 digit train number দিন।"
    });

  }

  try {

    const result =
      await getLiveTrain(train);

    return res.json({
      success: true,
      message: formatLiveStatus(result),
      data: result
    });

  } catch (error) {

    console.error(
      "API Live Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      error: true,
      message:
        "এই ট্রেনের Live Status এখন পাওয়া যাচ্ছে না।"
    });

  }

});

/* =========================================================
   API: PNR
========================================================= */

app.get("/api/pnr", async (req, res) => {

  const pnr =
    bengaliToEnglishDigits(
      req.query.pnr || ""
    ).replace(/\D/g, "");

  if (!/^\d{10}$/.test(pnr)) {

    return res.status(400).json({
      error: true,
      message: "সঠিক 10 digit PNR দিন।"
    });

  }

  try {

    const result =
      await getPNR(pnr);

    return res.json({
      success: true,
      message: formatPNR(
        result,
        pnr
      ),
      data: result
    });

  } catch (error) {

    console.error(
      "API PNR Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      error: true,
      message:
        "PNR status এখন পাওয়া যাচ্ছে না।"
    });

  }

});

/* =========================================================
   API: BETWEEN
========================================================= */

app.get("/api/between", async (req, res) => {

  const fromInput =
    req.query.from || "";

  const toInput =
    req.query.to || "";

  const date =
    req.query.date ||
    getISTDate();

  try {

    const from =
      await resolveStation(
        fromInput
      );

    const to =
      await resolveStation(
        toInput
      );

    if (!from || !to) {

      return res.status(400).json({
        error: true,
        message:
          "Station পাওয়া যায়নি। Station name বা code ব্যবহার করুন।"
      });

    }

    const result =
      await getTrainsBetween(
        from,
        to,
        date,
        date === getISTDate()
      );

    return res.json({
      success: true,
      from,
      to,
      date,
      message:
        formatBetweenResult(
          result,
          date,
          null
        ),
      data: result
    });

  } catch (error) {

    console.error(
      "API Between Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      error: true,
      message:
        "Train data এখন পাওয়া যাচ্ছে না।"
    });

  }

});

/* =========================================================
   API: MAP
========================================================= */

app.get("/api/map", async (req, res) => {

  const train =
    bengaliToEnglishDigits(
      req.query.train || ""
    ).replace(/\D/g, "");

  if (!/^\d{5}$/.test(train)) {

    return res.status(400).json({
      error:
        "সঠিক 5 digit train number দিন।"
    });

  }

  try {

    const [
      liveResult,
      routeResult
    ] = await Promise.all([
      getLiveTrain(train),
      getTrainRoute(train)
    ]);

    return res.json(
      buildMapData(
        liveResult,
        routeResult
      )
    );

  } catch (error) {

    console.error(
      "Map Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      error:
        "এই ট্রেনের Live Map এখন পাওয়া যাচ্ছে না।"
    });

  }

});

/* =========================================================
   PRIVACY
========================================================= */

app.get("/privacy", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Privacy Policy</title>
</head>
<body
style="
font-family:Arial;
padding:40px;
max-width:800px;
margin:auto;
">

<h1>Privacy Policy</h1>

<p>
Sealdah Train Service AI Bot processes WhatsApp
messages only for providing railway information
and automated assistance.
</p>

<p>
Railway queries may be processed through
RailRadar and general conversational queries
may be processed through Google Gemini.
</p>

<p>
The service does not intentionally sell or publish
user messages.
</p>

</body>
</html>
  `);

});

/* =========================================================
   WHATSAPP VERIFY
========================================================= */

app.get("/webhook", (req, res) => {

  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {

    console.log(
      "WhatsApp Webhook Verified"
    );

    return res
      .status(200)
      .send(challenge);
  }

  return res.sendStatus(403);

});

/* =========================================================
   SEND WHATSAPP MESSAGE
========================================================= */

async function sendWhatsAppMessage(
  to,
  text
) {

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    const response =
      await axios.post(
        url,
        {
          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to,

          type:
            "text",

          text: {
            preview_url:
              false,

            body:
              text
          }
        },
        {
          headers: {
            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    console.log(
      "WhatsApp message sent successfully:",
      response.data?.messages?.[0]?.id ||
      "OK"
    );

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data ||
      error.message
    );

  }

}

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  try {

    console.log(
      "========== NEW WHATSAPP WEBHOOK =========="
    );

    const entry =
      req.body?.entry?.[0];

    const change =
      entry?.changes?.[0];

    const value =
      change?.value;

    const messages =
      value?.messages;

    if (
      !messages ||
      messages.length === 0
    ) {

      console.log(
        "Webhook received but no incoming message."
      );

      return;
    }

    const message =
      messages[0];

    const from =
      message.from;

    console.log(
      "ACTUAL SENDER NUMBER:",
      from
    );

    console.log(
      "BUSINESS PHONE NUMBER ID:",
      value?.metadata?.phone_number_id
    );

    if (message.type !== "text") {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"
      );

      return;
    }

    const userMessage =
      message.text?.body?.trim();

    if (!userMessage) {
      return;
    }

    console.log(
      "USER MESSAGE:",
      userMessage
    );

    const reply =
      await processUserMessage(
        userMessage
      );

    console.log(
      "FINAL REPLY:",
      reply
    );

    console.log(
      "Sending WhatsApp reply to:",
      from
    );

    await sendWhatsAppMessage(
      from,
      reply
    );

    console.log(
      "Reply completed for:",
      from
    );

    console.log(
      "=========================================="
    );

  } catch (error) {

    console.error(
      "Webhook Error:",
      error?.response?.data ||
      error?.message ||
      error
    );

  }

});

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "================================"
    );

    console.log(
      "🚆 Sealdah Train Service AI Bot"
    );

    console.log(
      "================================"
    );

    console.log(
      "Server running on port:",
      PORT
    );

    console.log(
      "WhatsApp:",
      WHATSAPP_TOKEN
        ? "OK"
        : "MISSING"
    );

    console.log(
      "Gemini:",
      GEMINI_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "RailRadar:",
      RAILRADAR_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "================================"
    );

  }
);
