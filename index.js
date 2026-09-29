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
  if (!date) return "";
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
   ULTIMATE DEEP SEARCH ALGORITHM (FINAL FIX FOR PNR)
========================================================= */
function deepSearch(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;

  // 1. Check direct keys first
  for (let k of keys) {
    if (obj.hasOwnProperty(k)) {
      let val = obj[k];
      if (val !== null && val !== undefined && val !== "") {
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          return String(val);
        } else if (typeof val === 'object' && !Array.isArray(val)) {
          if (val.name) return String(val.name);
          if (val.stationName) return String(val.stationName);
          if (val.code) return String(val.code);
          if (val.status) return String(val.status);
          for (let innerK in val) {
              if (typeof val[innerK] === 'string') return String(val[innerK]);
          }
        }
      }
    }
  }

  // 2. Recursively check nested objects
  for (let k in obj) {
    if (obj[k] !== null && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      let res = deepSearch(obj[k], keys);
      if (res) return res;
    }
  }

  return null;
}

function findData(obj, keys) {
    let result = deepSearch(obj, keys);
    if (result !== null && result !== undefined && result !== "") {
        if (result.toLowerCase() === "false") return "Not Prepared";
        if (result.toLowerCase() === "true") return "Prepared";
        return String(result).trim();
    }
    return "-";
}

function findPassengersArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const knownKeys = ['passengers', 'passengerDetails', 'passengerList', 'passengerInfo', 'psgnInfoList', 'passenger'];
  for (let k of knownKeys) {
    if (Array.isArray(obj[k]) && obj[k].length > 0) return obj[k];
  }
  
  let found = [];
  function searchArr(o) {
    if (!o || typeof o !== 'object') return;
    for (let k in o) {
      if (Array.isArray(o[k]) && o[k].length > 0) {
        let first = o[k][0];
        if (first && typeof first === 'object' && (first.bookingStatus || first.currentStatus || first.coach || first.berth || first.currentCoach || first.seatNo || first.status)) {
           found = o[k]; return;
        }
      } else if (typeof o[k] === 'object' && !Array.isArray(o[k])) {
        searchArr(o[k]);
      }
    }
  }
  searchArr(obj);
  return found;
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
  { name: "দমদম ক্যান্টনমেন্ট (Dum Dum Cantt)", lat: 22.6358, lon: 88.4125, code: "DDC" },
  { name: "বিরাটি (Birati)", lat: 22.6653, lon: 88.4342, code: "BBT" },
  { name: "নিউ ব্যারাকপুর (New Barrackpore)", lat: 22.6841, lon: 88.4485, code: "NBE" },
  { name: "মধ্যমগ্রাম (Madhyamgram)", lat: 22.6999, lon: 88.4623, code: "MMG" },
  { name: "হৃদয়পুর (Hridaypur)", lat: 22.7089, lon: 88.4721, code: "HHR" },
  { name: "বারাসত জংশন (Barasat Jn)", lat: 22.7214, lon: 88.4804, code: "BT" },
  { name: "বনগাঁ জংশন (Bongaon Jn)", lat: 23.0478, lon: 88.8256, code: "BNJ" },
  { name: "বালিগঞ্জ জংশন (Ballygunge Jn)", lat: 22.5270, lon: 88.3653, code: "BLN" },
  { name: "যাদবপুর (Jadavpur)", lat: 22.4975, lon: 88.3725, code: "JDP" },
  { name: "সোনারপুর জংশন (Sonarpur Jn)", lat: 22.4227, lon: 88.4168, code: "SPR" },
  { name: "বারুইপুর জংশন (Baruipur Jn)", lat: 22.3618, lon: 88.4316, code: "BRP" },
  { name: "ডায়মন্ড হারবার (Diamond Harbour)", lat: 22.1884, lon: 88.1925, code: "DH" }
];

function getNearestStation(userLat, userLon) {
  let nearest = null;
  let minDistance = Infinity;
  for (const station of STATION_COORDS) {
    const R = 6371; 
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
  if (normalized.includes("বারোটার পর") || normalized.includes("12টার পর") || normalized.includes("12 pm") || normalized.includes("দুপুর 12")) return 12;
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
  try { return await railRadarGet("/v1/lookup/search/stations", { q: query, limit: 10 }); } 
  catch (error) { return null; }
}

async function resolveStation(value) {
  if (!value) return null;
  const direct = findStationCode(value);
  if (direct) return direct;
  const result = await searchStation(value);
  const stations = result?.data?.stations || result?.stations || [];
  if (Array.isArray(stations) && stations.length > 0) return stations[0]?.code || stations[0]?.stationCode || null;
  return null;
}

async function getTrainsBetween(from, to, date, live = false) {
  return await railRadarGet(`/v1/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, { date, live: live ? "true" : "false" });
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

/* =========================================================
   PNR FORMATTER (100% FIXED USING DEEP SEARCH)
========================================================= */
function formatPNR(result, pnr) {
  let data = result?.data || result || {};
  if (data.pnrInfo) data = data.pnrInfo;
  if (data.pnr && typeof data.pnr === 'object') data = data.pnr;

  if (!data || Object.keys(data).length === 0) return `❌ PNR ${pnr}-এর তথ্য সার্ভার থেকে পাওয়া যাচ্ছে না।`;

  let tNumber = findData(data, ['trainNumber', 'trainNo', 'trainCode', 'number']);
  let tName = findData(data, ['trainName', 'name']);
  let jDate = findData(data, ['journeyDate', 'doj', 'jdate', 'travelDate', 'date']);
  
  let from = findData(data, ['boardingStation', 'boardingInfo', 'boardName', 'board', 'sourceStation', 'source', 'fromStation', 'from']);
  let to = findData(data, ['reservationUpto', 'destinationInfo', 'destName', 'destinationStation', 'destination', 'toStation', 'to']);
  
  let boardTime = findData(data, ['boardTime', 'departureTime', 'departure', 'trainBoardTime', 'scheduledDeparture', 'time']);
  let trainClass = findData(data, ['journeyClass', 'class', 'trainClass', 'bookingClass', 'quota']);
  let chartStatus = findData(data, ['chartStatus', 'chartingStatus', 'chartPrepared', 'chart']);

  if (tNumber === tName) tName = "-"; // Remove duplicate if API sends same string for both

  let reply = `🎫 *PNR Status*\n━━━━━━━━━━━━━━\n📌 *PNR:* ${pnr}\n`;
  
  if (tNumber !== "-" || tName !== "-") reply += `🚆 *ট্রেন:* ${tNumber !== "-" ? tNumber : ""} ${tName !== "-" ? tName : ""}\n`;
  if (from !== "-" || to !== "-") reply += `🛤️ *রুট:* ${from} ➡ ${to}\n`;
  if (jDate !== "-") reply += `📅 *তারিখ:* ${jDate}\n`;
  if (boardTime !== "-") reply += `⏰ *ছাড়ার সময়:* ${boardTime}\n`;
  if (trainClass !== "-") reply += `💺 *ক্লাস:* ${trainClass}\n`;
  if (chartStatus !== "-") reply += `📋 *চার্ট:* ${chartStatus}\n`;

  let passengers = findPassengersArray(data);

  if (passengers.length > 0) {
    reply += "\n👥 *প্যাসেঞ্জার স্ট্যাটাস:*\n";
    
    passengers.forEach((p, i) => {
      let bStatus = findData(p, ['bookingStatus', 'bookingStatusText', 'bookingStatusIndex', 'bkgStatus', 'booking']);
      let cStatus = findData(p, ['currentStatus', 'currentStatusText', 'currentStatusIndex', 'curStatus']);
      
      // Fallback for generic 'status' key
      if (bStatus === "-") bStatus = findData(p, ['status']);
      if (cStatus === "-") cStatus = findData(p, ['status']);
      
      let coach = findData(p, ['currentCoach', 'coach', 'coachNo', 'currentCoachId', 'bookingCoachId', 'allotCoach']);
      let berth = findData(p, ['currentBerthNo', 'berthNo', 'berth', 'seatNo', 'bookingBerthNo', 'allotBerth', 'seatNumber']);
      let berthType = findData(p, ['currentBerthCode', 'berthCode', 'berthType', 'coachPosition', 'seatType']);
      
      let passengerInfo = `বুকিং: ${bStatus} | বর্তমান: ${cStatus}`;
      
      // Append Coach & Seat if found
      if (coach !== "-" || berth !== "-") {
         let seatText = [];
         if (coach !== "-") seatText.push(`কোচ: ${coach}`);
         if (berth !== "-") seatText.push(`সিট: ${berth}${berthType !== "-" ? " (" + berthType + ")" : ""}`);
         
         passengerInfo = `বুকিং: ${bStatus} | বর্তমান: ${cStatus} [${seatText.join(", ")}]`;
      }
      
      reply += `*${i + 1}.* ${passengerInfo}\n`;
    });
  } else {
    reply += "\n👥 *প্যাসেঞ্জার স্ট্যাটাস:* পাওয়া যায়নি।\n";
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
      model: "gemini-3.5-flash-lite",
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
  let from = null;
  let to = null;

  const bMatch = userMessage.match(/(.+?)\s+থেকে\s+(.+)/);
  if (bMatch) {
    from = findStationCode(bMatch[1]);
    to = findStationCode(bMatch[2]);
  } else {
    const eMatch = userMessage.match(/(.+?)\s+to\s+(.+)/i);
    if (eMatch) {
      from = findStationCode(eMatch[1]);
      to = findStationCode(eMatch[2]);
    }
  }

  if (from && to && from !== to) {
    return await handleBetween(from, to, userMessage);
  }

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
    // Sumanmusix Signature added here
    const finalText = text + "\n\nSumanmusix";

    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
      text: { preview_url: false, body: finalText }
    }, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    });
    console.log("WhatsApp message sent successfully to", to);
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
  res.sendStatus(200); 
  try {
    const entry = req.body?.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    let reply = "";

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
    else if (message.type === "text") {
      const userMessage = message.text?.body?.trim();
      if (userMessage) reply = await processUserMessage(userMessage);
    } 
    else {
      reply = "দুঃখিত, আমি শুধুমাত্র Text Message এবং Current Location 📍 গ্রহণ করতে পারি।";
    }

    if (reply) await sendWhatsAppMessage(from, reply);

  } catch (error) {
    console.error("Webhook Error:", error?.response?.data || error?.message);
  }
});

/* =========================================================
   FRONTEND - PROFESSIONAL WEB UI
========================================================= */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sealdah Train Tracker | Pro Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  :root {
    --bg-main: #0a0e17;
    --bg-card: rgba(20, 26, 40, 0.7);
    --border-color: rgba(255, 255, 255, 0.1);
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --text-main: #ffffff;
    --text-muted: #9ca3af;
    --accent-green: #10b981;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: 'Inter', sans-serif;
    background: radial-gradient(circle at top right, #111827, var(--bg-main));
    color: var(--text-main);
    min-height: 100vh;
  }
  .container {
    max-width: 800px; margin: 0 auto; padding: 40px 20px;
  }
  .header {
    text-align: center; margin-bottom: 40px;
  }
  .header h1 {
    font-size: 2.2rem; margin: 0 0 10px; font-weight: 700;
    background: linear-gradient(to right, #60a5fa, #a78bfa);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .header p { color: var(--text-muted); font-size: 1rem; margin: 0; }
  
  .status-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);
    color: var(--accent-green); padding: 6px 12px; border-radius: 20px;
    font-size: 0.85rem; font-weight: 500; margin-top: 15px;
  }
  .status-badge .dot { width: 8px; height: 8px; background: var(--accent-green); border-radius: 50%; box-shadow: 0 0 8px var(--accent-green); }

  .tabs {
    display: flex; gap: 10px; margin-bottom: 25px;
    background: rgba(0,0,0,0.3); padding: 8px; border-radius: 14px;
    overflow-x: auto;
  }
  .tabs button {
    flex: 1; min-width: 120px; padding: 12px; border: none; border-radius: 10px;
    background: transparent; color: var(--text-muted); font-weight: 600; font-size: 0.95rem;
    cursor: pointer; transition: all 0.3s ease;
  }
  .tabs button:hover { color: var(--text-main); }
  .tabs button.active { background: var(--bg-card); color: var(--text-main); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }

  .glass-card {
    background: var(--bg-card); backdrop-filter: blur(16px);
    border: 1px solid var(--border-color); border-radius: 20px;
    padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    display: none; animation: fadeIn 0.4s ease forwards;
  }
  .glass-card.active { display: block; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .glass-card h2 { margin-top: 0; font-size: 1.4rem; font-weight: 600; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px; }
  
  .input-group { margin-bottom: 15px; }
  input {
    width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border-color);
    background: rgba(0,0,0,0.2); color: white; font-size: 1rem; font-family: 'Inter', sans-serif;
    transition: all 0.3s;
  }
  input:focus { outline: none; border-color: var(--primary); background: rgba(0,0,0,0.4); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
  
  .btn-primary {
    width: 100%; padding: 14px; border: none; border-radius: 12px;
    background: var(--primary); color: white; font-size: 1.05rem; font-weight: 600;
    cursor: pointer; transition: all 0.3s;
  }
  .btn-primary:hover { background: var(--primary-hover); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3); }

  .result-box {
    margin-top: 20px; background: rgba(0,0,0,0.4); border-radius: 12px;
    padding: 20px; white-space: pre-wrap; line-height: 1.6; font-size: 0.95rem;
    border: 1px solid var(--border-color);
  }
  .loading { display: none; text-align: center; color: var(--primary); font-weight: 600; margin: 20px 0; }

  #map { height: 400px; border-radius: 12px; border: 1px solid var(--border-color); margin-top: 20px; z-index: 1; }
  
  .footer { text-align: center; color: var(--text-muted); margin-top: 50px; font-size: 0.85rem; }
  .footer a { color: var(--primary); text-decoration: none; }
</style>
</head>
<body>

<div class="container">
  <div class="header">
    <h1>🚆 Sealdah Transit Hub</h1>
    <p>Live Railway Intelligence Dashboard</p>
    <div class="status-badge"><div class="dot"></div> Server Online & Bot Active</div>
  </div>

  <div class="tabs">
    <button class="active" onclick="switchTab('tab-live', this)">Live Status</button>
    <button onclick="switchTab('tab-route', this)">Between Stations</button>
    <button onclick="switchTab('tab-pnr', this)">PNR Check</button>
    <button onclick="switchTab('tab-map', this)">Live Map</button>
  </div>

  <!-- Live Status Tab -->
  <div id="tab-live" class="glass-card active">
    <h2>📡 Live Train Status</h2>
    <div class="input-group">
      <input id="live-input" type="text" placeholder="Enter Train Number (e.g. 31530)" maxlength="5">
    </div>
    <button class="btn-primary" onclick="fetchData('live-input', '/api/live-status?train=', 'live-result', 'live-load')">Check Status</button>
    <div id="live-load" class="loading">Fetching live data...</div>
    <div id="live-result" class="result-box">Train results will appear here.</div>
  </div>

  <!-- Route Tab -->
  <div id="tab-route" class="glass-card">
    <h2>🗺️ Find Trains Between Stations</h2>
    <div class="input-group"><input id="route-from" type="text" placeholder="From Station (e.g. Shantipur)"></div>
    <div class="input-group"><input id="route-to" type="text" placeholder="To Station (e.g. Sealdah)"></div>
    <div class="input-group"><input id="route-date" type="date"></div>
    <button class="btn-primary" onclick="fetchRoute()">Search Trains</button>
    <div id="route-load" class="loading">Searching routes...</div>
    <div id="route-result" class="result-box">Schedule will appear here.</div>
  </div>

  <!-- PNR Tab -->
  <div id="tab-pnr" class="glass-card">
    <h2>🎫 PNR Status Check</h2>
    <div class="input-group">
      <input id="pnr-input" type="text" placeholder="Enter 10-digit PNR" maxlength="10">
    </div>
    <button class="btn-primary" onclick="fetchData('pnr-input', '/api/pnr?pnr=', 'pnr-result', 'pnr-load')">Check PNR</button>
    <div id="pnr-load" class="loading">Verifying PNR...</div>
    <div id="pnr-result" class="result-box">PNR details will appear here.</div>
  </div>

  <!-- Map Tab -->
  <div id="tab-map" class="glass-card">
    <h2>🌍 Live GPS Map</h2>
    <div class="input-group">
      <input id="map-input" type="text" placeholder="Enter Train Number" maxlength="5">
    </div>
    <button class="btn-primary" onclick="loadMap()">View on Map</button>
    <div id="map-load" class="loading">Locating train on map...</div>
    <div id="map"></div>
    <div id="map-result" class="result-box" style="margin-top: 15px; display: none;"></div>
  </div>

  <div class="footer">
    Powered by <b>Suman Biswas</b>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  // Set Date automatically
  document.getElementById("route-date").value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  function switchTab(tabId, btn) {
    document.querySelectorAll('.glass-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
  }

  async function fetchData(inputId, endpoint, resultId, loadId) {
    const val = document.getElementById(inputId).value.trim();
    const resBox = document.getElementById(resultId);
    const loadBox = document.getElementById(loadId);
    if(!val) { resBox.textContent = "Please enter a valid input."; return; }
    
    resBox.style.display = 'none'; loadBox.style.display = 'block';
    try {
      const res = await fetch(endpoint + encodeURIComponent(val));
      const data = await res.json();
      resBox.textContent = data.message || JSON.stringify(data, null, 2);
    } catch(err) {
      resBox.textContent = "Error fetching data. Please try again.";
    }
    loadBox.style.display = 'none'; resBox.style.display = 'block';
  }

  async function fetchRoute() {
    const from = document.getElementById('route-from').value.trim();
    const to = document.getElementById('route-to').value.trim();
    const date = document.getElementById('route-date').value;
    const resBox = document.getElementById('route-result');
    const loadBox = document.getElementById('route-load');

    if(!from || !to) { resBox.textContent = "Please enter both stations."; return; }
    resBox.style.display = 'none'; loadBox.style.display = 'block';

    try {
      const url = \`/api/between?from=\${encodeURIComponent(from)}&to=\${encodeURIComponent(to)}&date=\${date}\`;
      const res = await fetch(url);
      const data = await res.json();
      resBox.textContent = data.message || JSON.stringify(data, null, 2);
    } catch(err) { resBox.textContent = "Error fetching schedule."; }
    loadBox.style.display = 'none'; resBox.style.display = 'block';
  }

  let map = null;
  async function loadMap() {
    const train = document.getElementById("map-input").value.trim();
    const resBox = document.getElementById("map-result");
    const loadBox = document.getElementById("map-load");
    if(!train) return;

    loadBox.style.display = 'block'; resBox.style.display = 'none';
    try {
      const response = await fetch("/api/map?train=" + encodeURIComponent(train));
      const data = await response.json();
      if(data.error) { resBox.textContent = data.error; resBox.style.display = 'block'; loadBox.style.display = 'none'; return; }

      if(!map) {
        map = L.map("map").setView([22.57, 88.36], 8);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      }
      map.eachLayer(layer => { if(layer instanceof L.Marker || layer instanceof L.GeoJSON) map.removeLayer(layer); });

      if(data.geojson) {
        const route = L.geoJSON(data.geojson, { style: { color: '#3b82f6', weight: 4 } }).addTo(map);
        map.fitBounds(route.getBounds());
      }
      
      const currentCode = data.currentLocation?.stationCode;
      let currentStop = data.stops?.find(s => s.code === currentCode);
      
      if(currentStop) {
        L.marker([currentStop.lat, currentStop.lng]).addTo(map)
         .bindPopup("🚆 <b>" + data.trainNumber + "</b><br>📍 " + currentStop.name).openPopup();
      }

      resBox.innerHTML = \`<b>Status:</b> \${data.status || "-"} <br><b>Delay:</b> \${data.delayMinutes ?? 0} mins\`;
      resBox.style.display = 'block';
    } catch(error) {
      resBox.textContent = "Live map unavailable."; resBox.style.display = 'block';
    }
    loadBox.style.display = 'none';
  }
</script>
</body>
</html>
  `);
});

/* =========================================================
   API ROUTES
========================================================= */
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

app.get("/api/between", async (req, res) => {
  const fromInput = req.query.from || "";
  const toInput = req.query.to || "";
  const date = req.query.date || getISTDate();
  try {
    const from = await resolveStation(fromInput);
    const to = await resolveStation(toInput);
    if (!from || !to) return res.status(400).json({ error: true, message: "Station not found. Use correct name." });
    
    const result = await getTrainsBetween(from, to, date, date === getISTDate());
    res.json({ success: true, message: formatBetweenResult(result, date, null) });
  } catch (error) { res.status(500).json({ error: true, message: "Data unavailable." }); }
});

app.get("/api/map", async (req, res) => {
  const train = req.query.train?.replace(/\D/g, "");
  if (!/^\d{5}$/.test(train)) return res.status(400).json({ error: "Invalid Train Number" });
  try {
    const [live, route] = await Promise.all([getLiveTrain(train), getTrainRoute(train)]);
    res.json(buildMapData(live, route));
  } catch (error) { res.status(500).json({ error: "Map data unavailable" }); }
});

/* =========================================================
   START SERVER
========================================================= */
app.listen(PORT, () => {
  console.log("==========================================");
  console.log("🚆 SEALDAH TRAIN BOT IS LIVE!");
  console.log(`📡 Port: ${PORT}`);
  console.log("==========================================");
});
