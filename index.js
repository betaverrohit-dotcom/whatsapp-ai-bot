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

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

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
  const map = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
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
   STATION ALIASES (For Text Search)
========================================================= */
const STATIONS = {
  "শান্তিপুর": "STB", "shantipur": "STB", "stb": "STB",
  "শিয়ালদা": "SDAH", "শিয়ালদা": "SDAH", "শিয়ালদহ": "SDAH", "sealdah": "SDAH", "sdah": "SDAH",
  "রানাঘাট": "RHA", "ranaghat": "RHA", "rha": "RHA",
  "কৃষ্ণনগর": "KNJ", "krishnanagar": "KNJ", "knj": "KNJ",
  "কল্যাণী": "KLYM", "kalyani": "KLYM",
  "নৈহাটি": "NH", "naihati": "NH", "nh": "NH",
  "বনগাঁ": "BNJ", "bongaon": "BNJ", "bnj": "BNJ",
  "বারাসত": "BT", "barasat": "BT",
  "দমদম": "DDJ", "dum dum": "DDJ", "ddj": "DDJ",
  "কলকাতা": "KOAA", "kolkata": "KOAA"
};

function findStationCode(text) {
  const original = text || "";
  const normalized = cleanText(original);
  const keys = Object.keys(STATIONS).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (normalized.includes(cleanText(key))) {
      return STATIONS[key];
    }
  }
  const codeMatch = original.match(/\b[A-Za-z]{2,5}\b/);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    if (Object.values(STATIONS).includes(code)) return code;
  }
  return null;
}

/* =========================================================
   GPS LOCATION DATA (Sealdah Division)
========================================================= */
const STATION_COORDS = [
  // MAIN LINE
  { name: "শিয়ালদা (Sealdah)", lat: 22.5675, lon: 88.3714, code: "SDAH" },
  { name: "বিধাননগর রোড (Bidhannagar Road)", lat: 22.5934, lon: 88.3912, code: "BNXR" },
  { name: "দমদম জংশন (Dum Dum Jn)", lat: 22.6225, lon: 88.3953, code: "DDJ" },
  { name: "বেলঘড়িয়া (Belgharia)", lat: 22.6468, lon: 88.3846, code: "BLH" },
  { name: "আগরপাড়া (Agarpara)", lat: 22.6685, lon: 88.3775, code: "AGP" },
  { name: "সোদপুর (Sodepur)", lat: 22.6953, lon: 88.3736, code: "SEP" },
  { name: "খড়দহ (Khardaha)", lat: 22.7231, lon: 88.3732, code: "KDH" },
  { name: "টিটাগড় (Titagarh)", lat: 22.7423, lon: 88.3719, code: "TGH" },
  { name: "ব্যারাকপুর (Barrackpore)", lat: 22.7629, lon: 88.3719, code: "BP" },
  { name: "পলতা (Palta)", lat: 22.7831, lon: 88.3697, code: "PTF" },
  { name: "ইছাপুর (Ichhapur)", lat: 22.8055, lon: 88.3683, code: "IP" },
  { name: "শ্যামনগর (Shyamnagar)", lat: 22.8336, lon: 88.3768, code: "SNR" },
  { name: "জগদ্দল (Jagaddal)", lat: 22.8530, lon: 88.3857, code: "JGDL" },
  { name: "কাঁচরাপাড়া (Kankinara)", lat: 22.8711, lon: 88.3976, code: "KNR" },
  { name: "নৈহাটি জংশন (Naihati Jn)", lat: 22.8986, lon: 88.4182, code: "NH" },
  { name: "হালিশহর (Halisahar)", lat: 22.9298, lon: 88.4172, code: "HLR" },
  { name: "কাঁচরাপাড়া (Kanchrapara)", lat: 22.9463, lon: 88.4312, code: "KPA" },
  { name: "কল্যাণী (Kalyani)", lat: 22.9750, lon: 88.4344, code: "KYI" },
  { name: "মদনপুর (Madanpur)", lat: 23.0182, lon: 88.4831, code: "MPJ" },
  { name: "শিমুরালি (Simurali)", lat: 23.0483, lon: 88.5135, code: "SMX" },
  { name: "চাকদহ (Chakdaha)", lat: 23.0815, lon: 88.5256, code: "CDH" },
  { name: "পায়রাডাঙ্গা (Payradanga)", lat: 23.1251, lon: 88.5491, code: "PDX" },
  { name: "রানাঘাট জংশন (Ranaghat Jn)", lat: 23.1764, lon: 88.5828, code: "RHA" },
  { name: "কালিনারায়ণপুর (Kalinarayanpur)", lat: 23.2198, lon: 88.5615, code: "KLNP" },
  { name: "হবিবপুর (Habibpur)", lat: 23.2372, lon: 88.5303, code: "HBE" },
  { name: "ফুলিয়া (Phulia)", lat: 23.2393, lon: 88.4907, code: "FLU" },
  { name: "শান্তিপুর (Shantipur)", lat: 23.2458, lon: 88.4326, code: "STB" },
  { name: "বাদকুল্লা (Badkulla)", lat: 23.2928, lon: 88.5312, code: "BDZ" },
  { name: "কৃষ্ণনগর (Krishnanagar)", lat: 23.4013, lon: 88.4998, code: "KNJ" },
  { name: "বেথুয়াডহরি (Bethuadahari)", lat: 23.5936, lon: 88.3842, code: "BTY" },
  { name: "বেলডাঙ্গা (Beldanga)", lat: 23.9318, lon: 88.2464, code: "BEB" },
  { name: "বহরমপুর কোর্ট (Berhampore Court)", lat: 24.0954, lon: 88.2589, code: "BPC" },
  { name: "মুর্শিদাবাদ (Murshidabad)", lat: 24.1843, lon: 88.2709, code: "MBB" },
  { name: "লালগোলা (Lalgola)", lat: 24.4175, lon: 88.2464, code: "LGL" },
  // BONGAON LINE
  { name: "দমদম ক্যান্টনমেন্ট (Dum Dum Cantt)", lat: 22.6358, lon: 88.4125, code: "DDC" },
  { name: "বিরাটি (Birati)", lat: 22.6653, lon: 88.4342, code: "BBT" },
  { name: "নিউ ব্যারাকপুর (New Barrackpore)", lat: 22.6841, lon: 88.4485, code: "NBE" },
  { name: "মধ্যমগ্রাম (Madhyamgram)", lat: 22.6999, lon: 88.4623, code: "MMG" },
  { name: "হৃদয়পুর (Hridaypur)", lat: 22.7089, lon: 88.4721, code: "HHR" },
  { name: "বারাসত জংশন (Barasat Jn)", lat: 22.7214, lon: 88.4804, code: "BT" },
  { name: "বামনগাছি (Bamangachhi)", lat: 22.7533, lon: 88.5134, code: "BMG" },
  { name: "দত্তপুকুর (Dattapukur)", lat: 22.7756, lon: 88.5412, code: "DTK" },
  { name: "অশোকনগর রোড (Ashoknagar Road)", lat: 22.8239, lon: 88.6186, code: "ASKR" },
  { name: "হাবরা (Habra)", lat: 22.8360, lon: 88.6323, code: "HB" },
  { name: "মছলন্দপুর (Machhalandapur)", lat: 22.8791, lon: 88.7047, code: "MSL" },
  { name: "গোবরডাঙ্গা (Gobardanga)", lat: 22.8845, lon: 88.7618, code: "GBG" },
  { name: "ঠাকুরনগর (Thakurnagar)", lat: 22.8988, lon: 88.7909, code: "TKNR" },
  { name: "চাঁদপাড়া (Chandpara)", lat: 22.9467, lon: 88.8268, code: "CDP" },
  { name: "বনগাঁ জংশন (Bongaon Jn)", lat: 23.0478, lon: 88.8256, code: "BNJ" },
  { name: "বসিরহাট (Basirhat)", lat: 22.6631, lon: 88.8893, code: "BSHT" },
  { name: "হাসনাবাদ (Hasnabad)", lat: 22.5855, lon: 88.8989, code: "HNB" },
  // SOUTH LINE
  { name: "পার্ক সার্কাস (Park Circus)", lat: 22.5445, lon: 88.3712, code: "PQS" },
  { name: "বালিগঞ্জ জংশন (Ballygunge Jn)", lat: 22.5270, lon: 88.3653, code: "BLN" },
  { name: "ঢাকুরিয়া (Dhakuria)", lat: 22.5134, lon: 88.3664, code: "DHK" },
  { name: "যাদবপুর (Jadavpur)", lat: 22.4975, lon: 88.3725, code: "JDP" },
  { name: "বাঘাযতীন (Baghajatin)", lat: 22.4815, lon: 88.3794, code: "BGJT" },
  { name: "নিউ গড়িয়া (New Garia)", lat: 22.4697, lon: 88.3888, code: "NGRI" },
  { name: "গড়িয়া (Garia)", lat: 22.4646, lon: 88.3879, code: "GIA" },
  { name: "নরেন্দ্রপুর (Narendrapur)", lat: 22.4419, lon: 88.3976, code: "NRPR" },
  { name: "সোনারপুর জংশন (Sonarpur Jn)", lat: 22.4227, lon: 88.4168, code: "SPR" },
  { name: "সুভাষ গ্রাম (Subhas Gram)", lat: 22.3962, lon: 88.4239, code: "MAK" },
  { name: "বারুইপুর জংশন (Baruipur Jn)", lat: 22.3618, lon: 88.4316, code: "BRP" },
  { name: "ডায়মন্ড হারবার (Diamond Harbour)", lat: 22.1884, lon: 88.1925, code: "DH" },
  { name: "জয়নগর মজিলপুর (Jaynagar Majilpur)", lat: 22.1764, lon: 88.4206, code: "JNM" },
  { name: "কাকদ্বীপ (Kakdwip)", lat: 21.8797, lon: 88.1887, code: "KWDP" },
  { name: "নামখানা (Namkhana)", lat: 21.7656, lon: 88.2323, code: "NMKA" },
  { name: "ক্যানিং (Canning)", lat: 22.3117, lon: 88.6586, code: "CG" },
  { name: "মাজেরহাট (Majerhat)", lat: 22.5165, lon: 88.3183, code: "MJT" },
  { name: "বজবজ (Budge Budge)", lat: 22.4831, lon: 88.1812, code: "BGB" }
];

function getNearestStation(userLat, userLon) {
  let nearest = null;
  let minDistance = Infinity;

  for (const station of STATION_COORDS) {
    const R = 6371; // Earth radius in km
    const dLat = (station.lat - userLat) * (Math.PI / 180);
    const dLon = (station.lon - userLon) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(userLat * (Math.PI / 180)) * Math.cos(station.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance < minDistance) {
      minDistance = distance;
      nearest = station;
    }
  }
  return { station: nearest, distance: minDistance.toFixed(2) };
}

/* =========================================================
   DATE & TIME DETECTION
========================================================= */
function detectDate(text) {
  const today = getISTDate();
  const normalized = bengaliToEnglishDigits(text);
  if (/আজ|আজকে|today/i.test(text) || /\btoday\b/i.test(text)) return today;
  if (/কাল|আগামীকাল|tomorrow/i.test(text)) {
    const d = new Date(`${today}T12:00:00+05:30`);
    d.setDate(d.getDate() + 1);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  const dayMatch = normalized.match(/(?:^|\s)(\d{1,2})\s*(?:তারিখ|date)(?:\s|$)/i);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      const [, year, month] = today.match(/^(\d{4})-(\d{2})-\d{2}$/);
      return `${year}-${month}-${String(day).padStart(2, "0")}`;
    }
  }
  return today;
}

function detectAfterHour(text) {
  const normalized = bengaliToEnglishDigits(String(text).toLowerCase());
  if (normalized.includes("বারোটার পর") || normalized.includes("12টার পর") || normalized.includes("12 pm") || normalized.includes("দুপুর 12")) {
    return 12;
  }
  const hourMatch = normalized.match(/(\d{1,2})\s*(?:টার|টা|টায়|টা থেকে|টার পর|টা পর|pm|am)/i);
  if (hourMatch) {
    let hour = Number(hourMatch[1]);
    if (normalized.includes("pm") && hour < 12) hour += 12;
    return hour;
  }
  return null;
}

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
   RAILRADAR API & FORMATTING
========================================================= */
async function railRadarGet(path, params = {}) {
  if (!RAILRADAR_API_KEY) throw new Error("RAILRADAR_API_KEY is missing");
  const response = await axios.get(`${RAILRADAR_BASE}${path}`, {
    params, timeout: 15000,
    headers: { Authorization: `Bearer ${RAILRADAR_API_KEY}`, Accept: "application/json" }
  });
  return response.data;
}

async function searchStation(query) {
  try {
    return await railRadarGet("/v1/lookup/search/stations", { q: query, limit: 10 });
  } catch (error) { return null; }
}

async function resolveStation(value) {
  if (!value) return null;
  const direct = findStationCode(value);
  if (direct) return direct;
  const result = await searchStation(value);
  const stations = result?.data?.stations || result?.stations || [];
  if (Array.isArray(stations) && stations.length > 0) {
    return stations[0]?.code || stations[0]?.stationCode || null;
  }
  return null;
}

async function getTrainsBetween(from, to, date, live = false) {
  return await railRadarGet(`/v1/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, {
    date, live: live ? "true" : "false"
  });
}

function formatBetweenResult(result, date, afterHour = null) {
  const data = result?.data || result;
  const trains = Array.isArray(data?.trains) ? data.trains : [];
  if (trains.length === 0) return `🚆 ${formatDateDDMMYYYY(date)} তারিখে এই রুটে কোনো ট্রেন পাওয়া যায়নি।`;

  let filtered = trains;
  if (afterHour !== null) {
    const minimum = afterHour * 60;
    filtered = trains.filter(train => {
      const departure = train?.from?.departure || train?.departure || null;
      const minutes = timeToMinutes(departure);
      return minutes !== null && minutes >= minimum;
    });
  }
  if (filtered.length === 0) return `🚆 ${formatDateDDMMYYYY(date)} তারিখে ${afterHour}:00-এর পর এই রুটে কোনো ট্রেন পাওয়া যায়নি।`;

  const fromName = data?.from?.name || data?.from?.code || "";
  const toName = data?.to?.name || data?.to?.code || "";
  let reply = `🚆 ${fromName} → ${toName}\n📅 ${formatDateDDMMYYYY(date)}\n\n`;

  filtered.forEach((item, index) => {
    const train = item?.train || {};
    const departure = item?.from?.departure || item?.departure || "-";
    const arrival = item?.to?.arrival || item?.arrival || "-";
    const delay = item?.live?.delayMinutes;
    const platform = item?.live?.platform;

    reply += `${index + 1}. 🚆 ${train.number || "-"} ${train.name || ""}\n   ছাড়বে: ${formatTime(departure)}\n   পৌঁছাবে: ${formatTime(arrival)}`;
    if (delay !== undefined && delay !== null) reply += `\n   ⏱️ বিলম্ব: ${delay} মিনিট`;
    if (platform) reply += `\n   🚉 প্ল্যাটফর্ম: ${platform}`;
    reply += "\n\n";
  });
  return reply.trim();
}

async function getLiveTrain(trainNumber) {
  return await railRadarGet(`/v1/trains/${encodeURIComponent(trainNumber)}/live`, { authoritative: "true" });
}

function formatLiveStatus(result) {
  const data = result?.data || result;
  if (!data) return "🚆 এই ট্রেনের live status পাওয়া যায়নি।";
  
  const train = data.train || {};
  const current = data.currentLocation || {};
  const next = data.nextHalt || {};
  const previous = data.previousHalt || {};
  const delay = data.delayMinutes;

  let reply = `🚆 ${data.trainNumber || train.number || "-"} ${train.name || ""}\n\n📍 Status: ${data.status || "অজানা"}\n`;
  if (delay !== undefined && delay !== null) reply += `⏱️ Delay: ${delay} মিনিট\n`;
  if (current.stationCode) reply += `📍 বর্তমান স্টেশন: ${current.stationCode}\n`;
  if (current.status) reply += `🚉 বর্তমান অবস্থা: ${current.status}\n`;
  if (next.stationName || next.stationCode) reply += `➡️ পরবর্তী স্টেশন: ${next.stationName || next.stationCode}\n`;
  if (previous.stationName || previous.stationCode) reply += `⬅️ আগের স্টেশন: ${previous.stationName || previous.stationCode}\n`;
  if (data.lastUpdatedAt) reply += `🕒 Updated: ${data.lastUpdatedAt}\n`;
  
  return reply.trim();
}

async function getPNR(pnr) {
  return await railRadarGet(`/v1/pnr/${encodeURIComponent(pnr)}`);
}

function findValue(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return null;
}

function formatStationValue(value) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  return value.name || value.stationName || value.code || value.stationCode || "-";
}

function formatPNR(result, pnr) {
  const data = result?.data || result;
  if (!data) return `❌ PNR ${pnr}-এর তথ্য পাওয়া যায়নি।`;

  const trainNumber = findValue(data, ["trainNumber", "trainNo", "number"]);
  const trainName = findValue(data, ["trainName", "name"]);
  const journeyDate = findValue(data, ["journeyDate", "date", "jdate"]);
  const from = findValue(data, ["from", "fromStation", "source"]);
  const to = findValue(data, ["to", "toStation", "destination"]);
  const chartStatus = findValue(data, ["chartStatus", "chartingStatus"]);
  const passengers = data.passengers || data.passengerDetails || data.bookingStatus || [];

  let reply = `🎫 PNR Status\n━━━━━━━━━━━━━━\nPNR: ${pnr}\n`;
  if (trainNumber || trainName) reply += `🚆 Train: ${trainNumber || ""} ${trainName || ""}\n`;
  if (journeyDate) reply += `📅 Journey: ${journeyDate}\n`;
  if (from || to) reply += `🛤️ Route: ${formatStationValue(from)} → ${formatStationValue(to)}\n`;
  if (chartStatus) reply += `📋 Chart: ${chartStatus}\n`;

  if (Array.isArray(passengers) && passengers.length > 0) {
    reply += "\n👤 Passenger Status:\n";
    passengers.forEach((p, i) => {
      const booking = findValue(p, ["bookingStatus", "booking", "bookingStatusText"]);
      const current = findValue(p, ["currentStatus", "current", "currentStatusText", "status"]);
      reply += `${i + 1}. Booking: ${booking || "-"} | Current: ${current || "-"}\n`;
    });
  }
  return reply.trim();
}

async function getTrainRoute(trainNumber) {
  return await railRadarGet(`/v1/trains/${encodeURIComponent(trainNumber)}/route`, { format: "geojson", stops: "true" });
}

function buildMapData(liveResult, routeResult) {
  const live = liveResult?.data || liveResult || {};
  const route = routeResult?.data || routeResult || {};
  return {
    trainNumber: live.trainNumber || route.trainNumber || "",
    trainName: live.train?.name || "",
    status: live.status || "",
    delayMinutes: live.delayMinutes ?? null,
    currentLocation: live.currentLocation || null,
    nextHalt: live.nextHalt || null,
    geojson: route.geojson || null,
    stops: route.stops || []
  };
}

/* =========================================================
   GEMINI AI & BOT PROCESSOR
========================================================= */
async function generateAIReply(userMessage) {
  if (!ai) return "নমস্কার! 🚆 Sealdah Train Bot-এ আপনাকে স্বাগতম। ট্রেনের তথ্যের জন্য লিখুন: শান্তিপুর থেকে শিয়ালদা, Live 31530 বা PNR 1234567890";
  const prompt = `তুমি Sealdah Train Service WhatsApp Assistant। ব্যবহারকারী বাংলায় লিখলে বাংলায়, ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে। উত্তর ছোট ও WhatsApp-friendly রাখবে। নিজে থেকে train timing বা status বানাবে না। User message: ${userMessage}`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite", // or gemini-1.5-flash
      contents: prompt,
      config: { maxOutputTokens: 300 }
    });
    const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text.trim();
  } catch (error) {
    console.error("Gemini Error:", error?.message);
  }
  return "নমস্কার! 🚆 আপনি কী জানতে চান লিখুন। (যেমন: Live 31530, PNR 1234567890)";
}

async function handleBetween(from, to, userMessage) {
  const date = detectDate(userMessage);
  const afterHour = detectAfterHour(userMessage);
  const isToday = date === getISTDate();
  try {
    const result = await getTrainsBetween(from, to, date, isToday);
    return formatBetweenResult(result, date, afterHour);
  } catch (error) {
    return "❌ Railway data পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  }
}

async function processUserMessage(userMessage) {
  const normalized = cleanText(userMessage);

  // 1. PNR Check
  const pnrMatch = bengaliToEnglishDigits(userMessage).match(/\b\d{10}\b/);
  if (pnrMatch && (normalized.includes("pnr") || normalized.includes("পিএনআর"))) {
    try { return formatPNR(await getPNR(pnrMatch[0]), pnrMatch[0]); }
    catch (error) { return `❌ PNR ${pnrMatch[0]}-এর তথ্য এখন পাওয়া যাচ্ছে না।`; }
  }

  // 2. Live Train Status
  const trainNumber = detectTrainNumber(userMessage);
  if (trainNumber && (normalized.includes("live") || normalized.includes("কোথায়") || normalized.includes("status"))) {
    try { return formatLiveStatus(await getLiveTrain(trainNumber)); } 
    catch (error) { return `❌ ${trainNumber} ট্রেনের live status পাওয়া যাচ্ছে না।`; }
  }

  // 3. Between Stations Route Match
  const from = findStationCode(userMessage);
  let to = null;
  const routePatterns = [/থেকে\s+(.+?)(?:\s+যাওয়ার|\s+যেতে|\s+ট্রেন|\s*$)/i, /থেকে\s+(.+?)\s+যাও/i, /from\s+(.+?)\s+to\s+(.+)/i];
  
  for (const pattern of routePatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      to = pattern.toString().includes("from") ? findStationCode(match[2]) : findStationCode(match[1]);
      if (to) break;
    }
  }

  if (normalized.includes("শান্তিপুর") && (normalized.includes("শিয়ালদা") || normalized.includes("sealdah"))) {
    return await handleBetween("STB", "SDAH", userMessage);
  }
  if (from && to) return await handleBetween(from, to, userMessage);

  // 4. Just Train Number
  if (trainNumber && (normalized.includes("train") || normalized.includes("ট্রেন") || normalized.includes("সময়"))) {
    try { return formatLiveStatus(await getLiveTrain(trainNumber)); } 
    catch (error) { return `🚆 ${trainNumber} ট্রেনের তথ্য এখন পাওয়া যাচ্ছে না।`; }
  }

  // 5. General AI Fallback
  return await generateAIReply(userMessage);
}

/* =========================================================
   SEND WHATSAPP MESSAGE FUNCTION
========================================================= */
async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
      text: { preview_url: false, body: text }
    }, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    });
    console.log("WhatsApp message sent successfully");
  } catch (error) {
    console.error("WhatsApp Send Error:", error.response?.data || error.message);
  }
}

/* =========================================================
   WHATSAPP WEBHOOK ROUTES
========================================================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WhatsApp Webhook Verified!");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Always respond 200 to WhatsApp immediately
  
  try {
    const entry = req.body?.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    let reply = "";

    // If User Sends Location (GPS Tracking)
    if (message.type === "location") {
      const lat = message.location.latitude;
      const lon = message.location.longitude;
      const nearest = getNearestStation(lat, lon);
      
      if (nearest.station) {
        reply = `📍 আমরা আপনার লোকেশন ট্র্যাক করেছি।\n\nআপনি বর্তমানে **${nearest.station.name}** স্টেশনের কাছাকাছি আছেন (দূরত্ব: ${nearest.distance} কিমি)।\n\nপরবর্তী ট্রেনের স্ট্যাটাস জানতে লিখুন:\n"Live [ট্রেন নম্বর]"`;
      } else {
        reply = "দুঃখিত, আপনার কাছাকাছি কোনো স্টেশনের তথ্য আমাদের ডেটাবেসে নেই।";
      }
    } 
    // If User Sends Text (NLP & Command processing)
    else if (message.type === "text") {
      const userMessage = message.text?.body?.trim();
      if (userMessage) reply = await processUserMessage(userMessage);
    } 
    // Fallback for Images/Audio/Documents
    else {
      reply = "দুঃখিত, আমি শুধুমাত্র Text Message এবং Current Location 📍 গ্রহণ করতে পারি।";
    }

    if (reply) await sendWhatsAppMessage(from, reply);

  } catch (error) {
    console.error("Webhook Error:", error?.response?.data || error?.message);
  }
});

/* =========================================================
   FRONTEND & API ROUTES
========================================================= */
app.get("/", (req, res) => {
  res.send(`<h2>🚆 Sealdah Train Service Bot Running!</h2><p>Server is Active.</p>`);
});

app.get("/api/live-status", async (req, res) => {
  const train = req.query.train?.replace(/\D/g, "");
  if (!/^\d{5}$/.test(train)) return res.status(400).json({ error: true, message: "Invalid Train Number" });
  try { res.json({ success: true, message: formatLiveStatus(await getLiveTrain(train)) }); } 
  catch (error) { res.status(500).json({ error: true }); }
});

app.get("/api/pnr", async (req, res) => {
  const pnr = req.query.pnr?.replace(/\D/g, "");
  if (!/^\d{10}$/.test(pnr)) return res.status(400).json({ error: true, message: "Invalid PNR" });
  try { res.json({ success: true, message: formatPNR(await getPNR(pnr), pnr) }); } 
  catch (error) { res.status(500).json({ error: true }); }
});

/* =========================================================
   START SERVER
========================================================= */
app.listen(PORT, () => {
  console.log("================================");
  console.log("🚆 Sealdah Train Bot Running!");
  console.log(`Port: ${PORT}`);
  console.log("================================");
});
