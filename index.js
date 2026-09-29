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

// =========================================================
// STATE MANAGEMENT (For Premium Dropdown Flow)
// =========================================================
const userPrefs = {}; // ভাষা সেভ রাখার জন্য
const userState = {}; // ড্রপডাউন মেনুর ফ্লো (From -> To) সেভ রাখার জন্য

/* =========================================================
   MULTI-LANGUAGE DICTIONARY (Premium Vibe)
========================================================= */
const LANG = {
  en: {
    welcomeTitle: "🚆 Sealdah Transit Hub",
    welcomeBody: "Welcome to our Premium Railway Assistant!\n\nPlease select an option from the menu below to continue.",
    btnMenu: "☰ Open Menu",
    mPnr: "🎫 PNR Status", mLive: "📡 Live Train Status", mRoute: "🗺️ Search Trains", mLang: "🌐 Change Language",
    askPnr: "Please type your *10-digit PNR Number* to check the status.\n(e.g., 6508967728)",
    askLive: "Please type the *5-digit Train Number* to check live status.\n(e.g., 31530)",
    askFrom: "📍 *Departure Station*\nPlease select your starting station from the list below.\n\n_(If your station is not listed, simply type: 'StationA to StationB')_",
    askTo: "🎯 *Destination Station*\nPlease select your destination station.",
    btnSelect: "🔽 Select Station",
    langSet: "Language set to English! ✅",
    pnrErr: "❌ PNR information not found.",
    liveErr: "❌ Live status not found.",
    btnErr: "❌ Route data not found.",
    noTrn: "🚆 No trains found on this route.",
    noTrnToday: "🚆 No more trains available today.",
    locTrack: "📍 Location tracked!\nYou are near",
    nextSdah: "⏳ Next trains towards Sealdah:",
    askDest: "Where do you want to go? (e.g., SDAH to KNJ)",
    locErr: "Sorry, no nearby station found.",
    errMedia: "Sorry, I only accept Text Message and Current Location 📍."
  },
  hi: {
    welcomeTitle: "🚆 सियालदह ट्रांजिट हब",
    welcomeBody: "हमारे प्रीमियम रेलवे असिस्टेंट में आपका स्वागत है!\n\nकृपया जारी रखने के लिए नीचे दिए गए मेनू से एक विकल्प चुनें।",
    btnMenu: "☰ मेनू खोलें",
    mPnr: "🎫 PNR स्थिति", mLive: "📡 लाइव ट्रेन स्थिति", mRoute: "🗺️ ट्रेन खोजें", mLang: "🌐 भाषा बदलें",
    askPnr: "कृपया अपनी स्थिति जांचने के लिए *10-अंकीय PNR नंबर* टाइप करें।\n(उदा: 6508967728)",
    askLive: "कृपया लाइव स्थिति जांचने के लिए *5-अंकीय ट्रेन नंबर* टाइप करें।\n(उदा: 31530)",
    askFrom: "📍 *प्रस्थान स्टेशन*\nकृपया नीचे दी गई सूची से अपना स्टेशन चुनें।\n\n_(यदि आपका स्टेशन सूचीबद्ध नहीं है, तो बस टाइप करें: 'StationA to StationB')_",
    askTo: "🎯 *गंतव्य स्टेशन*\nकृपया अपना गंतव्य स्टेशन चुनें।",
    btnSelect: "🔽 स्टेशन चुनें",
    langSet: "भाषा हिन्दी में सेट कर दी गई है! ✅",
    pnrErr: "❌ PNR की जानकारी नहीं मिली।",
    liveErr: "❌ लाइव स्थिति नहीं मिली।",
    btnErr: "❌ रूट डेटा नहीं मिला।",
    noTrn: "🚆 इस रूट पर कोई ट्रेन नहीं मिली।",
    noTrnToday: "🚆 आज के लिए कोई और ट्रेन उपलब्ध नहीं है।",
    locTrack: "📍 स्थान ट्रैक किया गया!\nआप वर्तमान में इसके पास हैं",
    nextSdah: "⏳ सियालदह की ओर अगली ट्रेनें:",
    askDest: "आप कहाँ जाना चाहते हैं? (उदा: SDAH to KNJ)",
    locErr: "क्षमा करें, कोई नजदीकी स्टेशन नहीं मिला।",
    errMedia: "क्षमा करें, मैं केवल टेक्स्ट और वर्तमान स्थान 📍 स्वीकार करता हूँ।"
  },
  bn: {
    welcomeTitle: "🚆 শিয়ালদা ট্রানজিট হাব",
    welcomeBody: "আমাদের প্রিমিয়াম রেলওয়ে অ্যাসিস্ট্যান্টে আপনাকে স্বাগতম!\n\nপরবর্তী ধাপের জন্য অনুগ্রহ করে নিচের মেনু থেকে আপনার বিকল্পটি বেছে নিন।",
    btnMenu: "☰ মেনু খুলুন",
    mPnr: "🎫 PNR স্ট্যাটাস", mLive: "📡 লাইভ ট্রেনের অবস্থা", mRoute: "🗺️ ট্রেন খুঁজুন", mLang: "🌐 ভাষা পরিবর্তন",
    askPnr: "স্ট্যাটাস চেক করতে অনুগ্রহ করে আপনার *১০-ডিজিটের PNR নম্বরটি* টাইপ করে পাঠান।\n(যেমন: 6508967728)",
    askLive: "লাইভ স্ট্যাটাস দেখতে অনুগ্রহ করে *৫-ডিজিটের ট্রেন নম্বরটি* টাইপ করে পাঠান।\n(যেমন: 31530)",
    askFrom: "📍 *যাত্রার শুরুর স্টেশন*\nনিচের লিস্ট থেকে আপনি কোথা থেকে যাত্রা শুরু করবেন তা বেছে নিন।\n\n_(আপনার স্টেশন লিস্টে না থাকলে লিখে পাঠান: 'অমুক থেকে অমুক')_",
    askTo: "🎯 *গন্তব্য স্টেশন*\nআপনি কোথায় যেতে চান তা নিচের লিস্ট থেকে বেছে নিন।",
    btnSelect: "🔽 স্টেশন বেছে নিন",
    langSet: "আপনার ভাষা বাংলা সেট করা হয়েছে! ✅",
    pnrErr: "❌ PNR-এর তথ্য পাওয়া যাচ্ছে না।",
    liveErr: "❌ ট্রেনের লাইভ স্ট্যাটাস পাওয়া যাচ্ছে না।",
    btnErr: "❌ ট্রেনের ডেটা পাওয়া যাচ্ছে না।",
    noTrn: "🚆 এই রুটে কোনো ট্রেন পাওয়া যায়নি।",
    noTrnToday: "🚆 আজকের জন্য আর কোনো ট্রেন উপলব্ধ নেই।",
    locTrack: "📍 আপনার লোকেশন ট্র্যাক করা হয়েছে!\nআপনি বর্তমানে কাছাকাছি আছেন",
    nextSdah: "⏳ শিয়ালদাগামী পরবর্তী ট্রেনসমূহ:",
    askDest: "আপনি কোথায় যেতে চান? (যেমন: শিয়ালদা থেকে রানাঘাট)",
    locErr: "দুঃখিত, আপনার কাছাকাছি কোনো স্টেশন পাওয়া যায়নি।",
    errMedia: "দুঃখিত, আমি শুধুমাত্র Text Message এবং Current Location 📍 গ্রহণ করতে পারি।"
  }
};

/* =========================================================
   TOP 10 STATIONS FOR DROPDOWN
========================================================= */
const TOP_STATIONS = [
  { id: "stn_SDAH", title: "Sealdah", desc: "শিয়ালদা" },
  { id: "stn_DDJ", title: "Dum Dum Jn", desc: "দমদম জংশন" },
  { id: "stn_BT", title: "Barasat", desc: "বারাসত" },
  { id: "stn_BNJ", title: "Bongaon", desc: "বনগাঁ" },
  { id: "stn_NH", title: "Naihati", desc: "নৈহাটি" },
  { id: "stn_KYI", title: "Kalyani", desc: "কল্যাণী" },
  { id: "stn_RHA", title: "Ranaghat", desc: "রানাঘাট" },
  { id: "stn_KNJ", title: "Krishnanagar", desc: "কৃষ্ণনগর" },
  { id: "stn_STB", title: "Shantipur", desc: "শান্তিপুর" },
  { id: "stn_BRP", title: "Baruipur", desc: "বারুইপুর" }
];

/* =========================================================
   SEND INTERACTIVE MENUS (WhatsApp Cloud API)
========================================================= */
async function sendInteractiveList(to, headerText, bodyText, buttonText, sections) {
  try {
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp", recipient_type: "individual", to: to, type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: headerText },
        body: { text: bodyText },
        footer: { text: "Sumanmusix" },
        action: { button: buttonText, sections: sections }
      }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  } catch (error) { console.error("Interactive Error:", error.message); }
}

async function sendLanguageMenu(to) {
  await sendInteractiveList(to, "🗣️ Select Language", "Welcome to Sealdah Train Bot! 🚆\nPlease select your preferred language:\nঅনুগ্রহ করে আপনার ভাষা নির্বাচন করুন:", "🌐 Languages", [
    { title: "Available Languages", rows: [
      { id: "lang_bn", title: "বাংলা", description: "বাংলা ভাষায় কথা বলুন" },
      { id: "lang_en", title: "English", description: "Chat in English" },
      { id: "lang_hi", title: "हिन्दी", description: "हिंदी में चैट करें" }
    ]}
  ]);
}

async function sendMainMenu(to, lang) {
  const t = LANG[lang];
  await sendInteractiveList(to, t.welcomeTitle, t.welcomeBody, t.btnMenu, [
    { title: "Main Services", rows: [
      { id: "menu_route", title: t.mRoute, description: "Find local trains" },
      { id: "menu_live", title: t.mLive, description: "Check train running status" },
      { id: "menu_pnr", title: t.mPnr, description: "Check ticket status" },
      { id: "menu_lang", title: t.mLang, description: "English / বাংলা / हिन्दी" }
    ]}
  ]);
}

async function sendStationMenu(to, lang, isFrom) {
  const t = LANG[lang];
  const header = isFrom ? "📍 Departure" : "🎯 Destination";
  const body = isFrom ? t.askFrom : t.askTo;
  await sendInteractiveList(to, header, body, t.btnSelect, [
    { title: "Popular Stations", rows: TOP_STATIONS }
  ]);
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

const STATION_COORDS = [
  { name: "শিয়ালদা (Sealdah)", lat: 22.5675, lon: 88.3714, code: "SDAH" },
  { name: "দমদম জংশন (Dum Dum Jn)", lat: 22.6225, lon: 88.3953, code: "DDJ" },
  { name: "নৈহাটি জংশন (Naihati Jn)", lat: 22.8986, lon: 88.4182, code: "NH" },
  { name: "কল্যাণী (Kalyani)", lat: 22.9750, lon: 88.4344, code: "KYI" },
  { name: "রানাঘাট জংশন (Ranaghat Jn)", lat: 23.1764, lon: 88.5828, code: "RHA" },
  { name: "শান্তিপুর (Shantipur)", lat: 23.2458, lon: 88.4326, code: "STB" },
  { name: "কৃষ্ণনগর (Krishnanagar)", lat: 23.4013, lon: 88.4998, code: "KNJ" },
  { name: "বারাসত জংশন (Barasat Jn)", lat: 22.7214, lon: 88.4804, code: "BT" },
  { name: "বনগাঁ জংশন (Bongaon Jn)", lat: 23.0478, lon: 88.8256, code: "BNJ" },
  { name: "বারুইপুর জংশন (Baruipur Jn)", lat: 22.3618, lon: 88.4316, code: "BRP" }
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
   API CALLS & FORMATTERS
========================================================= */
async function railRadarGet(path, params = {}) {
  const res = await axios.get(`${RAILRADAR_BASE}${path}`, { params, headers: { Authorization: `Bearer ${RAILRADAR_API_KEY}` } });
  return res.data;
}

async function resolveStation(val) {
  try {
    const res = await railRadarGet("/v1/lookup/search/stations", { q: val, limit: 1 });
    return (res.data?.stations?.[0]?.code || res.stations?.[0]?.code || null);
  } catch(e) { return null; }
}

async function handleBetween(from, to, lang) {
  const date = getISTDate();
  try {
    const result = await railRadarGet(`/v1/trains/between/${from}/${to}`, { date, live: "true" });
    const trains = result?.data?.trains || result?.trains || [];
    if (trains.length === 0) return LANG[lang].noTrn;

    let minTime = new Date().getHours() * 60 + new Date().getMinutes();
    let filtered = trains.filter(t => timeToMinutes(t?.from?.departure || t?.departure) >= minTime).slice(0, 7);
    if (filtered.length === 0) return LANG[lang].noTrnToday;

    let rep = `🚆 *${from} ➡ ${to}*\n📅 ${date}\n\n`;
    filtered.forEach((i, idx) => {
      let t = i.train || {}; let d = i.live?.delayMinutes; let p = i.live?.platform;
      rep += `*${idx+1}. 🚆 ${t.number||"-"} ${t.name||""}*\n   ⏰ ${formatTime(i.from?.departure||i.departure)} ➡ ${formatTime(i.to?.arrival||i.arrival)}\n`;
      if(d>0) rep += `   ⏱️ Delay: ${d}m | 🚉 Plat: ${p||"-"}\n`;
      rep += `   📍 Track: https://wa.me/${BOT_PHONE}?text=Live+${t.number||"-"}\n\n`;
    });
    return rep.trim();
  } catch(e) { return LANG[lang].btnErr; }
}

async function handleLive(tNum, lang) {
  try {
    const r = await railRadarGet(`/v1/trains/${tNum}/live`, { authoritative: "true" });
    const d = r?.data || r; if(!d) return LANG[lang].liveErr;
    let rep = `🚆 *${d.trainNumber||"-"} ${d.train?.name||""}*\n\n📍 *Status:* ${d.status||"-"}\n`;
    if(d.delayMinutes>0) rep+=`⏱️ Delay: ${d.delayMinutes} mins\n`;
    if(d.currentLocation?.stationCode) rep+=`📍 Station: ${d.currentLocation.stationCode} (${d.currentLocation.status})\n`;
    return rep.trim();
  } catch(e) { return LANG[lang].liveErr; }
}

async function handlePNR(pnr, lang) {
  try {
    const r = await railRadarGet(`/v1/pnr/${pnr}`);
    let d = r?.data || r || {}; if (d.pnrInfo) d = d.pnrInfo;
    if (!d || Object.keys(d).length===0) return LANG[lang].pnrErr;
    
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
  } catch(e) { return LANG[lang].pnrErr; }
}

/* =========================================================
   WEBHOOK (THE MAGIC HAPPENS HERE)
========================================================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); 
  try {
    const entry = req.body?.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    if (!userPrefs[from]) userPrefs[from] = "bn"; 
    const lang = userPrefs[from];
    let reply = "";

    // --- 1. INTERACTIVE DROPDOWN HANDLER ---
    if (message.type === "interactive") {
      const id = message.interactive.list_reply.id;
      
      // Language Change
      if (id.startsWith("lang_")) {
        userPrefs[from] = id.split("_")[1];
        await sendWhatsAppMessage(from, LANG[userPrefs[from]].langSet);
        setTimeout(() => sendMainMenu(from, userPrefs[from]), 1000);
        return;
      }
      
      // Main Menu Options
      if (id === "menu_pnr") { userState[from] = { step: "pnr" }; reply = LANG[lang].askPnr; }
      else if (id === "menu_live") { userState[from] = { step: "live" }; reply = LANG[lang].askLive; }
      else if (id === "menu_lang") { await sendLanguageMenu(from); return; }
      else if (id === "menu_route") { 
        userState[from] = { step: "route_from" }; 
        await sendStationMenu(from, lang, true); 
        return; 
      }
      
      // Station Selection
      else if (id.startsWith("stn_")) {
        const stnCode = id.split("_")[1];
        if (userState[from]?.step === "route_from") {
           userState[from] = { step: "route_to", fromStn: stnCode };
           await sendStationMenu(from, lang, false);
           return;
        } 
        else if (userState[from]?.step === "route_to") {
           const fromStn = userState[from].fromStn;
           userState[from] = null; // Clear state
           reply = await handleBetween(fromStn, stnCode, lang);
        }
      }
    } 

    // --- 2. TEXT HANDLER ---
    else if (message.type === "text") {
      const txt = cleanText(message.text.body);
      const rawTxt = message.text.body.trim();
      
      // Triggers for Menu
      if (["hi", "hello", "menu", "হ্যালো", "হাই"].includes(txt)) { await sendMainMenu(from, lang); return; }
      if (["lang", "language", "ভাষা"].includes(txt)) { await sendLanguageMenu(from); return; }
      
      // Regex Global Checks (Overrides State)
      const pnrMatch = bengaliToEnglishDigits(rawTxt).match(/\b\d{10}\b/);
      const trainMatch = bengaliToEnglishDigits(rawTxt).match(/\b\d{5}\b/);
      let routeMatch = rawTxt.match(/(.+?)\s+(থেকে|to)\s+(.+)/i);

      if (pnrMatch) { userState[from] = null; reply = await handlePNR(pnrMatch[0], lang); }
      else if (trainMatch) { userState[from] = null; reply = await handleLive(trainMatch[0], lang); }
      else if (routeMatch) {
         userState[from] = null;
         let f = await resolveStation(routeMatch[1].trim());
         let t = await resolveStation(routeMatch[3].trim());
         if(f && t) reply = await handleBetween(f, t, lang);
      }
      // Handle active state if user typed instead of clicking
      else if (userState[from]?.step === "pnr") { reply = LANG[lang].pnrErr; }
      else if (userState[from]?.step === "live") { reply = LANG[lang].liveErr; }
      else {
        // AI Fallback
        if (ai) {
          const resp = await ai.models.generateContent({ model: "gemini-3.5-flash-lite", contents: `Act as Sealdah Train Bot. Reply shortly. User: ${rawTxt}` });
          reply = resp?.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || "Menu: Type 'Hi'";
        } else reply = "Please type 'Menu' or 'Hi'.";
      }
    }

    // --- 3. LOCATION HANDLER ---
    else if (message.type === "location") {
      const loc = getNearestStation(message.location.latitude, message.location.longitude);
      if (loc.station) {
        reply = `${LANG[lang].locTrack} *${loc.station.name}*.\n\n`;
        if (loc.station.code !== "SDAH") reply += await handleBetween(loc.station.code, "SDAH", lang);
        else reply += LANG[lang].askDest;
      } else reply = LANG[lang].locErr;
    }

    if (reply) await sendWhatsAppMessage(from, reply);

  } catch (error) { console.error("Webhook Error"); }
});

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) res.status(200).send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

/* =========================================================
   FRONTEND - PRO DASHBOARD
========================================================= */
app.get("/", (req, res) => res.send(`<h2>🚆 Sealdah Transit Hub API Active!</h2>`));

app.listen(PORT, () => {
  console.log("==========================================");
  console.log("🚆 PREMIUM SEALDAH BOT IS LIVE!");
  console.log(`📡 Port: ${PORT}`);
  console.log("==========================================");
});
