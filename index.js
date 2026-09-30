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

const BOT_PHONE = process.env.BOT_PHONE || "917003089284";

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// User Language Preference Memory
const userPrefs = {}; 

/* =========================================================
   MULTI-LANGUAGE DICTIONARY (SIMPLE & FAST)
========================================================= */
const LANG = {
  en: {
    welcome: "🚆 *Welcome to Sealdah Train Bot!*\n\n⚠️ _Note: Train search is only for Sealdah suburban (local) trains, not for Mail/Express._\n\n👉 *How to use:*\n• Type route: *SDAH to NH* or *Kalyani to Palpara*\n• Live status: *Live 31530*\n• PNR check: *PNR 1234567890*",
    langSet: "Language set to English! ✅",
    pnrErr: "❌ PNR information not found.",
    liveErr: "❌ Live status not found.",
    btnErr: "❌ Route or train data not found. Please check station names.",
    noTrn: "🚆 No trains found on this route.",
    noTrnToday: "🚆 No more trains available today.",
    locTrack: "📍 Location tracked!\nYou are near",
    nextSdah: "⏳ Next trains towards Sealdah:",
    askDest: "Where do you want to go? (e.g., SDAH to KNJ)",
    locErr: "Sorry, no nearby station found.",
    errMedia: "Sorry, I only accept Text Messages and Current Location 📍.",
    status: "Status", delay: "Delay", min: "mins", cStn: "Current Station", cState: "Current State",
    nStn: "Next Station", pStn: "Prev Station", upd: "Last Updated"
  },
  hi: {
    welcome: "🚆 *सियालदह ट्रेन बॉट में आपका स्वागत है!*\n\n⚠️ _नोट: ट्रेन सर्च केवल सियालदह लोकल ट्रेनों के लिए है, मेल/एक्सप्रेस के लिए नहीं।_\n\n👉 *कैसे उपयोग करें:*\n• रूट लिखें: *SDAH to NH* या *Kalyani to Palpara*\n• लाइव स्थिति: *Live 31530*\n• PNR चेक: *PNR 1234567890*",
    langSet: "भाषा हिन्दी में सेट कर दी गई है! ✅",
    pnrErr: "❌ PNR की जानकारी नहीं मिली।",
    liveErr: "❌ लाइव स्थिति नहीं मिली।",
    btnErr: "❌ रूट या ट्रेन डेटा नहीं मिला।",
    noTrn: "🚆 इस रूट पर कोई ट्रेन नहीं मिली।",
    noTrnToday: "🚆 आज के लिए कोई और ट्रेन उपलब्ध नहीं है।",
    locTrack: "📍 स्थान ट्रैक किया गया!\nआप वर्तमान में इसके पास हैं",
    nextSdah: "⏳ सियालदह की ओर अगली ट्रेनें:",
    askDest: "आप कहाँ जाना चाहते हैं? (उदा: SDAH to KNJ)",
    locErr: "क्षमा करें, कोई नजदीकी स्टेशन नहीं मिला।",
    errMedia: "क्षमा करें, मैं केवल टेक्स्ट और स्थान 📍 स्वीकार करता हूँ।",
    status: "स्थिति", delay: "देरी", min: "मिनट", cStn: "वर्तमान स्टेशन", cState: "वर्तमान स्थिति",
    nStn: "अगला स्टेशन", pStn: "पिछला स्टेशन", upd: "अंतिम अपडेट"
  },
  bn: {
    welcome: "🚆 *শিয়ালদা ট্রেন বটে স্বাগতম!*\n\n⚠️ _বিশেষ দ্রষ্টব্য: এই সার্ভিসটি শুধুমাত্র শিয়ালদা লোকাল ট্রেনের জন্য, মেল বা এক্সপ্রেসের জন্য নয়।_\n\n👉 *কীভাবে ব্যবহার করবেন:*\n• রুট জানতে লিখুন: *শিয়ালদা থেকে শান্তিপুর* বা *কল্যাণী থেকে পালপাড়া*\n• লাইভ স্ট্যাটাস: *Live 31530*\n• PNR চেক: *PNR 1234567890*",
    langSet: "ভাষা বাংলা সেট করা হয়েছে! ✅",
    pnrErr: "❌ PNR-এর তথ্য পাওয়া যাচ্ছে না।",
    liveErr: "❌ ট্রেনের লাইভ স্ট্যাটাস পাওয়া যাচ্ছে না।",
    btnErr: "❌ ট্রেনের ডেটা পাওয়া যাচ্ছে না। স্টেশনের নাম সঠিক করে লিখুন।",
    noTrn: "🚆 এই রুটে কোনো ট্রেন পাওয়া যায়নি।",
    noTrnToday: "🚆 আজকের জন্য আর কোনো ট্রেন উপলব্ধ নেই।",
    locTrack: "📍 আপনার লোকেশন ট্র্যাক করা হয়েছে!\nআপনি বর্তমানে কাছাকাছি আছেন",
    nextSdah: "⏳ শিয়ালদাগামী পরবর্তী ট্রেনসমূহ:",
    askDest: "আপনি কোথায় যেতে চান? (যেমন: শিয়ালদা থেকে রানাঘাট)",
    locErr: "দুঃখিত, আপনার কাছাকাছি কোনো স্টেশন পাওয়া যায়নি।",
    errMedia: "দুঃখিত, আমি শুধুমাত্র Text Message এবং Current Location 📍 গ্রহণ করতে পারি।",
    status: "স্ট্যাটাস", delay: "বিলম্ব", min: "মিনিট", cStn: "বর্তমান স্টেশন", cState: "বর্তমান অবস্থা",
    nStn: "পরবর্তী স্টেশন", pStn: "আগের স্টেশন", upd: "শেষ আপডেট"
  }
};

/* =========================================================
   SEND BUTTON MENUS (WhatsApp Cloud API)
========================================================= */
async function sendLanguageButtons(to) {
  try {
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp", recipient_type: "individual", to: to, type: "interactive",
      interactive: {
        type: "button",
        body: { text: "🗣️ Choose your language / ভাষা বেছে নিন / भाषा चुनें:" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "lang_bn", title: "বাংলা" } },
            { type: "reply", reply: { id: "lang_en", title: "English" } },
            { type: "reply", reply: { id: "lang_hi", title: "हिन्दी" } }
          ]
        }
      }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  } catch (error) { console.error("Button Error:", error.message); }
}

async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
      text: { preview_url: false, body: text + "\n\nSumanmusix" }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  } catch (error) { console.error("Send Error:", error.message); }
}

/* =========================================================
   CORE LOGIC & HELPERS
========================================================= */
function getISTDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function bengaliToEnglishDigits(text = "") { const map = { "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9" }; return text.replace(/[০-৯]/g, d => map[d]); }
function cleanText(text = "") { return bengaliToEnglishDigits(text).toLowerCase().replace(/[.,!?;:()[\]{}]/g, " ").replace(/\s+/g, " ").trim(); }
function formatTime(time) { if (!time) return "-"; const match = String(time).match(/(\d{1,2}):(\d{2})/); return match ? `${match[1].padStart(2, "0")}:${match[2]}` : time; }
function timeToMinutes(time) { if (!time) return null; const match = String(time).match(/(\d{1,2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; }

function deepSearch(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (let k of keys) {
    if (obj.hasOwnProperty(k) && obj[k] !== null && obj[k] !== "") {
      let v = obj[k];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
      if (typeof v === 'object' && !Array.isArray(v)) {
        if (v.name) return String(v.name); if (v.code) return String(v.code); if (v.status) return String(v.status);
      }
    }
  }
  for (let k in obj) {
    if (obj[k] !== null && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      let r = deepSearch(obj[k], keys); if (r) return r;
    }
  }
  return null;
}
function findData(obj, keys) { let r = deepSearch(obj, keys); return r ? String(r).trim() : "-"; }
function findPassengersArray(obj) {
  for (let k of ['passengers', 'passengerDetails', 'passengerList', 'passengerInfo']) { if (Array.isArray(obj[k]) && obj[k].length > 0) return obj[k]; }
  return [];
}

/* =========================================================
   MASSIVE STATION DICTIONARY (EXHAUSTIVE SEALDAH DIVISION)
========================================================= */
const STATIONS = {
  // Main Line
  "শিয়ালদা": "SDAH", "sealdah": "SDAH", "sdah": "SDAH",
  "বিধাননগর": "BNXR", "bidhannagar": "BNXR",
  "দমদম": "DDJ", "dumdum": "DDJ", "ddj": "DDJ",
  "বেলঘড়িয়া": "BLH", "বেলঘড়িয়া": "BLH", "belgharia": "BLH",
  "আগরপাড়া": "AGP", "agarpara": "AGP",
  "সোদপুর": "SEP", "sodepur": "SEP",
  "খড়দহ": "KDH", "khardaha": "KDH",
  "টিটাগড়": "TGH", "titagarh": "TGH",
  "ব্যারাকপুর": "BP", "barrackpore": "BP",
  "পলতা": "PTF", "palta": "PTF",
  "ইছাপুর": "IP", "ichhapur": "IP",
  "শ্যামনগর": "SNR", "shyamnagar": "SNR",
  "জগদ্দল": "JGDL", "jagaddal": "JGDL",
  "কাঁকিনাড়া": "KNR", "kankinara": "KNR",
  "নৈহাটি": "NH", "naihati": "NH",
  "হালিশহর": "HLR", "halisahar": "HLR",
  "কাঁচরাপাড়া": "KPA", "kanchrapara": "KPA",
  "কল্যাণী": "KYI", "kalyani": "KYI",
  "কল্যাণী সীমান্ত": "KLYM", "kalyani simanta": "KLYM", "klym": "KLYM",
  "মদনপুর": "MPJ", "madanpur": "MPJ",
  "শিমুরালি": "SMX", "simurali": "SMX",
  "পালপাড়া": "PXR", "পালপাড়া": "PXR", "palpara": "PXR",
  "চাকদহ": "CDH", "chakdaha": "CDH",
  "পায়রাডাঙ্গা": "PDX", "পায়রাডাঙ্গা": "PDX", "payradanga": "PDX",
  "রানাঘাট": "RHA", "ranaghat": "RHA",
  "কালিনারায়ণপুর": "KLNP", "kalinarayanpur": "KLNP",
  "হবিবপুর": "HBE", "habibpur": "HBE",
  "ফুলিয়া": "FLU", "phulia": "FLU", "fulia": "FLU",
  "শান্তিপুর": "STB", "shantipur": "STB",
  "বাদকুল্লা": "BDZ", "badkulla": "BDZ",
  "কৃষ্ণনগর": "KNJ", "krishnanagar": "KNJ",
  "বেথুয়াডহরি": "BTY", "bethuadahari": "BTY",
  "বেলডাঙ্গা": "BEB", "beldanga": "BEB",
  "বহরমপুর": "BPC", "berhampore": "BPC", "berhampore court": "BPC",
  "মুর্শিদাবাদ": "MBB", "murshidabad": "MBB",
  "জিয়াগঞ্জ": "JJG", "jiaganj": "JJG",
  "ভগবানগোলা": "BQG", "bhagwangola": "BQG",
  "লালগোলা": "LGL", "lalgola": "LGL",
  
  // Bongaon & Hasnabad Line
  "দমদম ক্যান্টনমেন্ট": "DDC", "dum dum cantt": "DDC",
  "বিরাটি": "BBT", "birati": "BBT",
  "নিউ ব্যারাকপুর": "NBE", "new barrackpore": "NBE",
  "মধ্যমগ্রাম": "MMG", "madhyamgram": "MMG",
  "হৃদয়পুর": "HHR", "hridaypur": "HHR",
  "বারাসত": "BT", "বারাসাত": "BT", "barasat": "BT",
  "বামনগাছি": "BMG", "bamangachhi": "BMG",
  "দত্তপুকুর": "DTK", "dattapukur": "DTK",
  "বিড়া": "BIRA", "bira": "BIRA",
  "গুমা": "GUMA", "guma": "GUMA",
  "অশোকনগর": "ASKR", "ashoknagar": "ASKR",
  "হাবরা": "HB", "habra": "HB",
  "মছলন্দপুর": "MSL", "machhalandapur": "MSL",
  "গোবরডাঙ্গা": "GBG", "gobardanga": "GBG",
  "ঠাকুরনগর": "TKNR", "thakurnagar": "TKNR",
  "চাঁদপাড়া": "CDP", "chandpara": "CDP",
  "বনগাঁ": "BNJ", "bongaon": "BNJ",
  "কাজলালী": "KZPB", "kazipara": "KZPB",
  "কাদম্বগাছি": "KBGH", "kadambagachi": "KBGH",
  "বসিরহাট": "BSHT", "basirhat": "BSHT",
  "টাকি": "TKF", "taki": "TKF",
  "হাসনাবাদ": "HNB", "hasnabad": "HNB",

  // South Section
  "পার্ক সার্কাস": "PQS", "park circus": "PQS",
  "বালিগঞ্জ": "BLN", "ballygunge": "BLN",
  "ঢাকুরিয়া": "DHK", "dhakuria": "DHK",
  "যাদবপুর": "JDP", "jadavpur": "JDP",
  "বাঘাযতীন": "BGJT", "baghajatin": "BGJT",
  "নিউ গড়িয়া": "NGRI", "new garia": "NGRI",
  "গড়িয়া": "GIA", "garia": "GIA",
  "নরেন্দ্রপুর": "NRPR", "narendrapur": "NRPR",
  "সোনারপুর": "SPR", "sonarpur": "SPR",
  "সুভাষ গ্রাম": "MAK", "subhas gram": "MAK",
  "মল্লিকপুর": "MAK", "mallikpur": "MAK",
  "বারুইপুর": "BRP", "baruipur": "BRP",
  "জয়নগর": "JNM", "jaynagar": "JNM", "majilpur": "JNM",
  "মথুরাপুর": "MPRD", "mathurapur": "MPRD",
  "কাকদ্বীপ": "KWDP", "kakdwip": "KWDP",
  "নামখানা": "NMKA", "namkhana": "NMKA",
  "ডায়মন্ড হারবার": "DH", "diamond harbour": "DH",
  "ক্যানিং": "CG", "canning": "CG",
  "মাজেরহাট": "MJT", "majerhat": "MJT",
  "বজবজ": "BGB", "budge budge": "BGB"
};

async function resolveStation(val) {
  if (!val) return null;
  let normalized = cleanText(val);
  normalized = normalized.replace(/(যাব|যাওয়ার|যেতে|ট্রেন|কখন|train|going|station|স্টেশন)/gi, "").trim();

  const codeMatch = normalized.match(/\b[A-Za-z]{2,5}\b/);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    if (Object.values(STATIONS).includes(code)) return code;
  }

  for (const key in STATIONS) {
    if (normalized.includes(key) || key.includes(normalized)) return STATIONS[key];
  }

  try {
    const res = await railRadarGet("/v1/lookup/search/stations", { q: normalized, limit: 1 });
    return (res.data?.stations?.[0]?.code || res.stations?.[0]?.code || null);
  } catch(e) { return null; }
}

const STATION_COORDS = [
  { name: "শিয়ালদা (SDAH)", lat: 22.5675, lon: 88.3714, code: "SDAH" },
  { name: "দমদম জংশন (DDJ)", lat: 22.6225, lon: 88.3953, code: "DDJ" },
  { name: "নৈহাটি জংশন (NH)", lat: 22.8986, lon: 88.4182, code: "NH" },
  { name: "কল্যাণী (KYI)", lat: 22.9750, lon: 88.4344, code: "KYI" },
  { name: "রানাঘাট জংশন (RHA)", lat: 23.1764, lon: 88.5828, code: "RHA" },
  { name: "শান্তিপুর (STB)", lat: 23.2458, lon: 88.4326, code: "STB" },
  { name: "কৃষ্ণনগর (KNJ)", lat: 23.4013, lon: 88.4998, code: "KNJ" },
  { name: "বারাসত জংশন (BT)", lat: 22.7214, lon: 88.4804, code: "BT" },
  { name: "বনগাঁ জংশন (BNJ)", lat: 23.0478, lon: 88.8256, code: "BNJ" },
  { name: "বারুইপুর জংশন (BRP)", lat: 22.3618, lon: 88.4316, code: "BRP" }
];

function getNearestStation(lat, lon) {
  let nearest = null, minD = Infinity;
  for (const s of STATION_COORDS) {
    const R = 6371, dLat = (s.lat - lat)*(Math.PI/180), dLon = (s.lon - lon)*(Math.PI/180);
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat*(Math.PI/180))*Math.cos(s.lat*(Math.PI/180))*Math.sin(dLon/2)*Math.sin(dLon/2);
    const d = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    if (d < minD) { minD = d; nearest = s; }
  }
  return { station: nearest, distance: minD.toFixed(2) };
}

/* =========================================================
   API CALLS & FORMATTERS (WITH CACHE-BUSTING FOR REAL-TIME ACCURACY)
========================================================= */
async function railRadarGet(path, params = {}) {
  // Adding cache-busting timestamp to force servers to return real-time data
  params.ts = Date.now();
  const res = await axios.get(`${RAILRADAR_BASE}${path}`, { params, headers: { Authorization: `Bearer ${RAILRADAR_API_KEY}` } });
  return res.data;
}

async function handleBetween(from, to, lang) {
  const t = LANG[lang];
  const date = getISTDate();
  try {
    const result = await railRadarGet(`/v1/trains/between/${from}/${to}`, { date, live: "true", refresh: "true" });
    const trains = result?.data?.trains || result?.trains || [];
    if (trains.length === 0) return t.noTrn;

    const now = new Date();
    const currentIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    let minTime = currentIST.getHours() * 60 + currentIST.getMinutes();

    let filtered = trains.filter(tr => timeToMinutes(tr?.from?.departure || tr?.departure) >= minTime);
    
    if (filtered.length === 0) return t.noTrnToday;
    
    filtered = filtered.slice(0, 7); 

    let fromName = result?.data?.from?.name || from;
    let toName = result?.data?.to?.name || to;

    let rep = `🚆 *${fromName} ➡ ${toName}*\n📅 ${date}\n\n`;
    filtered.forEach((i, idx) => {
      let tr = i.train || {}; let d = i.live?.delayMinutes; let p = i.live?.platform;
      rep += `*${idx+1}. 🚆 ${tr.number||"-"} ${tr.name||""}*\n   ⏰ ${formatTime(i.from?.departure||i.departure)} ➡ ${formatTime(i.to?.arrival||i.arrival)}\n`;
      if(d>0) rep += `   ⏱️ ${t.delay}: ${d} ${t.min} | 🚉 Plat: ${p||"-"}\n`;
      rep += `   📍 Live Track: https://wa.me/${BOT_PHONE}?text=Live+${tr.number||"-"}\n\n`;
    });
    return rep.trim();
  } catch(e) { return t.btnErr; }
}

async function handleLive(tNum, lang) {
  const t = LANG[lang];
  try {
    // strict caching bypass for highest accuracy
    const r = await railRadarGet(`/v1/trains/${tNum}/live`, { authoritative: "true", refresh: "true" });
    const d = r?.data || r; if(!d) return t.liveErr;
    
    let rep = `🚆 *${d.trainNumber||"-"} ${d.train?.name||""}*\n\n📍 *${t.status}:* ${d.status||"-"}\n`;
    if(d.delayMinutes>0) rep+=`⏱️ ${t.delay}: ${d.delayMinutes} ${t.min}\n`;
    if(d.currentLocation?.stationCode) rep+=`📍 ${t.cStn}: ${d.currentLocation.stationCode} (${d.currentLocation.status})\n`;
    
    if(d.nextHalt?.stationName || d.nextHalt?.stationCode) rep += `➡️ ${t.nStn}: ${d.nextHalt.stationName || d.nextHalt.stationCode}\n`;
    if(d.previousHalt?.stationName || d.previousHalt?.stationCode) rep += `⬅️ ${t.pStn}: ${d.previousHalt.stationName || d.previousHalt.stationCode}\n`;
    
    // Explicitly show the last update time so passengers know if the GPS is lagging
    if(d.lastUpdatedAt) rep += `\n🕒 *${t.upd}:* ${d.lastUpdatedAt}\n`;
    
    return rep.trim();
  } catch(e) { return t.liveErr; }
}

async function handlePNR(pnr, lang) {
  const t = LANG[lang];
  try {
    const r = await railRadarGet(`/v1/pnr/${pnr}`);
    let d = r?.data || r || {}; if (d.pnrInfo) d = d.pnrInfo;
    if (!d || Object.keys(d).length===0) return t.pnrErr;
    
    let rep = `🎫 *PNR Status: ${pnr}*\n━━━━━━━━━━━━━━\n`;
    rep += `🚆 Train: ${findData(d,['trainNo','trainNumber'])} | Date: ${findData(d,['journeyDate','date'])}\n`;
    rep += `🛤️ Route: ${findData(d,['fromStation','source','boardingStation'])} ➡ ${findData(d,['toStation','destination','reservationUpto'])}\n`;
    
    let psg = findPassengersArray(d);
    if(psg.length>0) {
      rep += `\n👥 *Passengers:*\n`;
      psg.forEach((p,i) => {
        let bs = findData(p,['bookingStatus','booking']); let cs = findData(p,['currentStatus','status']);
        let ch = findData(p,['coach','currentCoach']); let be = findData(p,['berth','currentBerthNo']);
        if(ch!=="-"||be!=="-") rep+= `*${i+1}.* Bkg: ${bs} | Cur: ${cs} [Coach: ${ch}, Seat: ${be}]\n`;
        else rep+= `*${i+1}.* Bkg: ${bs} | Cur: ${cs}\n`;
      });
    }
    return rep.trim();
  } catch(e) { return t.pnrErr; }
}

/* =========================================================
   WEBHOOK (SMOOTH, FAST & ACCURATE)
========================================================= */
app.post("/webhook", async (req, res) => {
  // Send 200 OK immediately for WhatsApp high-speed delivery
  res.sendStatus(200); 
  
  try {
    const entry = req.body?.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    if (!userPrefs[from]) userPrefs[from] = "bn"; 
    const lang = userPrefs[from];
    let reply = "";

    // --- INTERACTIVE BUTTON HANDLER ---
    if (message.type === "interactive") {
      const id = message.interactive.button_reply?.id;
      if (id && id.startsWith("lang_")) {
        userPrefs[from] = id.split("_")[1];
        await sendWhatsAppMessage(from, LANG[userPrefs[from]].langSet);
        setTimeout(() => sendWhatsAppMessage(from, LANG[userPrefs[from]].welcome), 1000);
        return;
      }
    } 

    // --- TEXT HANDLER ---
    else if (message.type === "text") {
      const txt = cleanText(message.text.body);
      const rawTxt = message.text.body.trim();
      
      if (["hi", "hello", "menu", "হ্যালো", "হাই"].includes(txt)) { await sendWhatsAppMessage(from, LANG[lang].welcome); return; }
      if (["lang", "language", "ভাষা", "भाषा"].includes(txt)) { await sendLanguageButtons(from); return; }
      
      const pnrMatch = bengaliToEnglishDigits(rawTxt).match(/\b\d{10}\b/);
      const trainMatch = bengaliToEnglishDigits(rawTxt).match(/\b\d{5}\b/);
      let routeMatch = rawTxt.match(/(.+?)\s+(থেকে|to|-|se)\s+(.+)/i); 

      if (pnrMatch) { reply = await handlePNR(pnrMatch[0], lang); }
      else if (trainMatch) { reply = await handleLive(trainMatch[0], lang); }
      else if (routeMatch) {
         let rawFrom = routeMatch[1];
         let rawTo = routeMatch[3];
         
         // Parallel execution for double speed!
         const [f, t] = await Promise.all([resolveStation(rawFrom), resolveStation(rawTo)]);
         
         if(f && t) reply = await handleBetween(f, t, lang);
         else reply = LANG[lang].btnErr;
      }
      else {
        if (ai) {
          const resp = await ai.models.generateContent({ model: "gemini-3.5-flash-lite", contents: `Act as Sealdah Train Bot. Note: Search only for local trains. Reply shortly. User: ${rawTxt}` });
          reply = resp?.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || "Type 'Hi' for options.";
        } else reply = LANG[lang].welcome;
      }
    }

    // --- LOCATION HANDLER ---
    else if (message.type === "location") {
      const loc = getNearestStation(message.location.latitude, message.location.longitude);
      if (loc.station) {
        reply = `${LANG[lang].locTrack} *${loc.station.name}*.\n\n`;
        if (loc.station.code !== "SDAH") reply += await handleBetween(loc.station.code, "SDAH", lang);
        else reply += LANG[lang].askDest;
      } else reply = LANG[lang].locErr;
    }

    if (reply) await sendWhatsAppMessage(from, reply);

  } catch (error) { console.error("Webhook Error", error.message); }
});

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) res.status(200).send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

/* =========================================================
   FRONTEND - BEAUTIFUL PREMIUM DASHBOARD (WITH ACCURATE MAP)
========================================================= */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sealdah Transit Hub | Pro Dashboard</title>
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
    --warning: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: 'Inter', sans-serif;
    background: radial-gradient(circle at top right, #111827, var(--bg-main));
    color: var(--text-main);
    min-height: 100vh;
  }
  .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
  .header { text-align: center; margin-bottom: 25px; }
  .header h1 {
    font-size: 2.2rem; margin: 0 0 10px; font-weight: 700;
    background: linear-gradient(to right, #60a5fa, #a78bfa);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .header p { color: var(--text-muted); font-size: 1rem; margin: 0 0 15px 0; }
  
  .status-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);
    color: var(--accent-green); padding: 6px 12px; border-radius: 20px;
    font-size: 0.85rem; font-weight: 500;
  }
  .status-badge .dot { width: 8px; height: 8px; background: var(--accent-green); border-radius: 50%; box-shadow: 0 0 8px var(--accent-green); }

  .notice-banner {
    background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2);
    color: var(--warning); padding: 12px 15px; border-radius: 12px;
    font-size: 0.9rem; text-align: center; margin-bottom: 30px; font-weight: 500;
  }

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
  .tabs button.active { background: var(--bg-card); color: var(--text-main); box-shadow: 0 4px 12px rgba(0,0,0,0.2); border: 1px solid var(--border-color); }

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
    <div class="status-badge"><div class="dot"></div> System Online & Bot Active</div>
  </div>

  <div class="notice-banner">
    ⚠ <b>বিশেষ দ্রষ্টব্য:</b> ট্রেন সার্চের এই ফিচারটি শুধুমাত্র শিয়ালদা ডিভিশনের লোকাল ট্রেনের জন্য প্রযোজ্য, কোনো মেল বা এক্সপ্রেস ট্রেনের জন্য নয়।
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
         .bindPopup("🚆 <b>" + data.trainNumber + "</b><br>📍 Current: " + currentStop.name).openPopup();
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
   API FOR WEB FRONTEND
========================================================= */
app.get("/api/live-status", async (req, res) => {
  const train = req.query.train?.replace(/\D/g, "");
  if (!/^\d{5}$/.test(train)) return res.status(400).json({ error: true, message: "Invalid Train Number" });
  try { res.json({ success: true, message: await handleLive(train, "en") }); } 
  catch (error) { res.status(500).json({ error: true }); }
});

app.get("/api/pnr", async (req, res) => {
  const pnr = req.query.pnr?.replace(/\D/g, "");
  if (!/^\d{10}$/.test(pnr)) return res.status(400).json({ error: true, message: "Invalid PNR" });
  try { res.json({ success: true, message: await handlePNR(pnr, "en") }); } 
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
    
    // API cache busting logic applied here as well
    const result = await railRadarGet(`/v1/trains/between/${from}/${to}`, { date, live: "true", refresh: "true" });
    const trains = result?.data?.trains || result?.trains || [];
    
    const now = new Date();
    const currentIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    let minTime = currentIST.getHours() * 60 + currentIST.getMinutes();
    
    let filtered = trains.filter(t => timeToMinutes(t?.from?.departure || t?.departure) >= minTime);
    
    if (filtered.length === 0) return res.json({ success: true, message: "🚆 No more trains available today." });
    
    let rep = `🚆 *${result?.data?.from?.name || from} ➡ ${result?.data?.to?.name || to}*\n📅 ${date}\n\n`;
    filtered.forEach((i, idx) => {
      let t = i.train || {}; let d = i.live?.delayMinutes; let p = i.live?.platform;
      rep += `*${idx+1}. 🚆 ${t.number||"-"} ${t.name||""}*\n   ⏰ ${formatTime(i.from?.departure||i.departure)} ➡ ${formatTime(i.to?.arrival||i.arrival)}\n`;
      if(d>0) rep += `   ⏱ Delay: ${d} mins | 🚉 Plat: ${p||"-"}\n\n`;
    });
    
    res.json({ success: true, message: rep.trim() });
  } catch (error) { res.status(500).json({ error: true, message: "Data unavailable." }); }
});

app.get("/api/map", async (req, res) => {
  const train = req.query.train?.replace(/\D/g, "");
  if (!/^\d{5}$/.test(train)) return res.status(400).json({ error: "Invalid Train Number" });
  try {
    const [live, route] = await Promise.all([
      railRadarGet(`/v1/trains/${train}/live`, { authoritative: "true", refresh: "true" }), 
      railRadarGet(`/v1/trains/${train}/route`, { format: "geojson", stops: "true" })
    ]);
    const liveData = live?.data || live; const routeData = route?.data || route;
    res.json({
      trainNumber: liveData?.trainNumber || routeData?.trainNumber || train,
      trainName: liveData?.train?.name || "",
      status: liveData?.status || "",
      delayMinutes: liveData?.delayMinutes ?? null,
      currentLocation: liveData?.currentLocation || null,
      geojson: routeData?.geojson || null,
      stops: routeData?.stops || []
    });
  } catch (error) { res.status(500).json({ error: "Map data unavailable" }); }
});

/* =========================================================
   START SERVER
========================================================= */
app.listen(PORT, () => {
  console.log("==========================================");
  console.log("🚆 PREMIUM SEALDAH BOT IS LIVE!");
  console.log(`📡 Port: ${PORT}`);
  console.log("==========================================");
});
