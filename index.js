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
   BASIC
========================================================= */

function istDate() {
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

  return String(text).replace(/[০-৯]/g, x => map[x]);
}

function normalize(text = "") {
  return bengaliToEnglishDigits(text)
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(date) {
  const parts = date.split("-");

  if (parts.length !== 3) {
    return date;
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function timeMinutes(time) {
  if (!time) return null;

  const match = String(time).match(/(\d{1,2}):(\d{2})/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(time) {
  if (!time) return "-";

  const match = String(time).match(/(\d{1,2}):(\d{2})/);

  if (!match) return String(time);

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/* =========================================================
   STATIONS
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
  "dumdum": "DDJ",
  "dum dum": "DDJ",
  "ddj": "DDJ",

  "কলকাতা": "KOAA",
  "kolkata": "KOAA"
};

function findStationCode(text) {
  const n = normalize(text);

  const keys = Object.keys(STATIONS).sort(
    (a, b) => b.length - a.length
  );

  for (const key of keys) {
    if (n.includes(normalize(key))) {
      return STATIONS[key];
    }
  }

  const code = String(text)
    .match(/\b[A-Za-z]{2,5}\b/);

  if (code) {
    const c = code[0].toUpperCase();

    if (Object.values(STATIONS).includes(c)) {
      return c;
    }
  }

  return null;
}

/* =========================================================
   DATE
========================================================= */

function detectDate(text) {
  const today = istDate();
  const n = bengaliToEnglishDigits(text);

  if (
    /আজ|আজকে|today/i.test(text)
  ) {
    return today;
  }

  if (
    /কাল|আগামীকাল|tomorrow/i.test(text)
  ) {
    const d = new Date(`${today}T12:00:00+05:30`);

    d.setDate(d.getDate() + 1);

    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  }

  const match = n.match(
    /(?:^|\s)(\d{1,2})\s*(?:তারিখ|date)(?:\s|$)/i
  );

  if (match) {
    const day = Number(match[1]);

    if (day >= 1 && day <= 31) {
      const parts = today.split("-");

      return `${parts[0]}-${parts[1]}-${String(day).padStart(2, "0")}`;
    }
  }

  return today;
}

/* =========================================================
   TIME
========================================================= */

function detectAfterHour(text) {
  const n = bengaliToEnglishDigits(
    String(text).toLowerCase()
  );

  if (
    n.includes("বারোটার পর") ||
    n.includes("বারোটার পরে") ||
    n.includes("12টার পর") ||
    n.includes("12টার পরে") ||
    n.includes("দুপুর 12") ||
    n.includes("12 pm")
  ) {
    return 12;
  }

  const match = n.match(
    /(\d{1,2})\s*(?:টার|টা|টায়|টা থেকে|টার পর|টা পর|pm|am)/i
  );

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);

  if (n.includes("pm") && hour < 12) {
    hour += 12;
  }

  return hour;
}

/* =========================================================
   TRAIN NUMBER
========================================================= */

function detectTrainNumber(text) {
  const n = bengaliToEnglishDigits(text);

  const matches = n.match(/\b\d{5}\b/g);

  return matches ? matches[0] : null;
}

/* =========================================================
   RAILRADAR REQUEST
========================================================= */

async function railRadar(path, params = {}) {

  if (!RAILRADAR_API_KEY) {
    throw new Error(
      "RAILRADAR_API_KEY is missing"
    );
  }

  const response = await axios.get(
    `${RAILRADAR_BASE}${path}`,
    {
      params,
      timeout: 20000,
      headers: {
        Authorization:
          `Bearer ${RAILRADAR_API_KEY}`,
        Accept:
          "application/json"
      }
    }
  );

  return response.data;
}

/* =========================================================
   PNR
========================================================= */

async function getPNR(pnr) {

  console.log(
    "PNR API REQUEST:",
    pnr
  );

  const result = await railRadar(
    `/v1/pnr/${encodeURIComponent(pnr)}`
  );

  console.log(
    "PNR API SUCCESS:",
    JSON.stringify(result)
  );

  return result;
}

function value(obj, keys) {

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

function textValue(v) {

  if (
    v === undefined ||
    v === null ||
    v === ""
  ) {
    return "-";
  }

  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }

  if (Array.isArray(v)) {
    return v.map(textValue).join(", ");
  }

  if (typeof v === "object") {

    return (
      v.name ||
      v.stationName ||
      v.code ||
      v.stationCode ||
      v.status ||
      v.currentStatus ||
      v.bookingStatus ||
      v.berth ||
      v.berthNumber ||
      v.coach ||
      v.coachNumber ||
      v.value ||
      JSON.stringify(v)
    );
  }

  return String(v);
}

function stationValue(v) {

  if (!v) return "-";

  if (
    typeof v === "string" ||
    typeof v === "number"
  ) {
    return String(v);
  }

  return textValue(v);
}

function formatPNR(result, pnr) {

  const data =
    result?.data ||
    result;

  if (!data || typeof data !== "object") {
    return (
      `❌ PNR ${pnr}-এর তথ্য পাওয়া যায়নি।`
    );
  }

  const trainNumber =
    value(data, [
      "trainNumber",
      "trainNo",
      "train_number",
      "train"
    ]);

  const trainName =
    value(data, [
      "trainName",
      "train_name",
      "trainname"
    ]);

  const journeyDate =
    value(data, [
      "journeyDate",
      "journey_date",
      "dateOfJourney",
      "date_of_journey",
      "travelDate"
    ]);

  const from =
    value(data, [
      "from",
      "fromStation",
      "from_station",
      "source",
      "boardingStation",
      "boarding_station"
    ]);

  const to =
    value(data, [
      "to",
      "toStation",
      "to_station",
      "destination",
      "reservationUpto",
      "reservation_upto"
    ]);

  const chart =
    value(data, [
      "chartStatus",
      "chartingStatus",
      "chart_status",
      "chartPrepared",
      "chart_prepared"
    ]);

  let passengers =
    data.passengers ||
    data.passengerDetails ||
    data.passenger_details ||
    data.passengerStatus ||
    data.passenger_status ||
    data.passengerList ||
    data.passenger_list ||
    [];

  if (!Array.isArray(passengers)) {

    if (
      passengers &&
      typeof passengers === "object"
    ) {

      const nested =
        passengers.passengers ||
        passengers.passengerDetails ||
        passengers.details ||
        passengers.list ||
        passengers.data;

      passengers =
        Array.isArray(nested)
          ? nested
          : [passengers];

    } else {
      passengers = [];
    }
  }

  let reply =
    `🎫 *PNR STATUS*\n` +
    `━━━━━━━━━━━━━━\n` +
    `PNR: ${pnr}\n`;

  if (trainNumber || trainName) {

    reply +=
      `🚆 Train: ` +
      `${textValue(trainNumber)} ` +
      `${textValue(trainName)}\n`;
  }

  if (journeyDate) {
    reply +=
      `📅 Journey: ${textValue(journeyDate)}\n`;
  }

  if (from || to) {

    reply +=
      `🛤️ Route: ` +
      `${stationValue(from)} → ` +
      `${stationValue(to)}\n`;
  }

  if (chart) {
    reply +=
      `📋 Chart: ${textValue(chart)}\n`;
  }

  if (passengers.length > 0) {

    reply +=
      `\n👤 *Passenger Status*\n`;

    passengers.forEach(
      (p, index) => {

        if (
          !p ||
          typeof p !== "object"
        ) {
          reply +=
            `${index + 1}. ${textValue(p)}\n`;

          return;
        }

        const booking =
          value(p, [
            "bookingStatus",
            "booking",
            "bookingStatusText",
            "booking_status",
            "bookedStatus"
          ]);

        const current =
          value(p, [
            "currentStatus",
            "current",
            "currentStatusText",
            "current_status",
            "status"
          ]);

        const coach =
          value(p, [
            "coach",
            "coachNumber",
            "coachNo",
            "coach_number",
            "coachName"
          ]);

        const berth =
          value(p, [
            "berth",
            "berthNumber",
            "berthNo",
            "berth_number",
            "seat",
            "seatNumber",
            "seatNo"
          ]);

        reply +=
          `${index + 1}.`;

        if (booking) {
          reply +=
            `\n   Booking: ${textValue(booking)}`;
        }

        if (current) {
          reply +=
            `\n   Current: ${textValue(current)}`;
        }

        if (coach || berth) {

          reply +=
            `\n   Seat: `;

          if (coach) {
            reply += textValue(coach);
          }

          if (coach && berth) {
            reply += "-";
          }

          if (berth) {
            reply += textValue(berth);
          }
        }

        reply += "\n";
      }
    );

  } else {

    const booking =
      value(data, [
        "bookingStatus",
        "booking",
        "bookingStatusText",
        "booking_status"
      ]);

    const current =
      value(data, [
        "currentStatus",
        "current",
        "currentStatusText",
        "current_status",
        "status"
      ]);

    if (booking || current) {

      reply +=
        `\n👤 *Status*\n`;

      if (booking) {
        reply +=
          `Booking: ${textValue(booking)}\n`;
      }

      if (current) {
        reply +=
          `Current: ${textValue(current)}\n`;
      }

    } else {

      reply +=
        `\nℹ️ PNR data পাওয়া গেছে, ` +
        `কিন্তু passenger status পাওয়া যায়নি।`;
    }
  }

  reply +=
    `\n\nℹ️ Data: RailRadar`;

  return reply.trim();
}

/* =========================================================
   LIVE TRAIN
========================================================= */

async function getLiveTrain(trainNumber) {

  return await railRadar(
    `/v1/trains/${encodeURIComponent(trainNumber)}/live`,
    {
      authoritative: "true"
    }
  );
}

function formatLiveStatus(result) {

  const data =
    result?.data ||
    result;

  if (!data) {
    return "❌ Live status পাওয়া যায়নি।";
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

  let reply =
    `🚆 *${data.trainNumber || train.number || "-"}* ` +
    `${train.name || ""}\n\n`;

  reply +=
    `📍 Status: ${data.status || "Unknown"}\n`;

  if (
    data.delayMinutes !== undefined &&
    data.delayMinutes !== null
  ) {

    reply +=
      `⏱️ Delay: ${data.delayMinutes} মিনিট\n`;
  }

  if (current.stationCode) {

    reply +=
      `📍 বর্তমান: ` +
      `${current.stationName || current.stationCode}\n`;
  }

  if (current.status) {

    reply +=
      `🚉 অবস্থা: ${current.status}\n`;
  }

  if (
    current.speedKmh !== undefined &&
    current.speedKmh !== null
  ) {

    reply +=
      `🚄 Speed: ${current.speedKmh} km/h\n`;
  }

  if (
    next.stationName ||
    next.stationCode
  ) {

    reply +=
      `➡️ পরবর্তী: ` +
      `${next.stationName || next.stationCode}\n`;
  }

  if (data.lastUpdatedAt) {

    reply +=
      `🕒 Updated: ${data.lastUpdatedAt}\n`;
  }

  reply +=
    `\nℹ️ Live data: RailRadar`;

  return reply.trim();
}

/* =========================================================
   BETWEEN STATIONS
========================================================= */

async function getBetween(
  from,
  to,
  date,
  live
) {

  return await railRadar(
    `/v1/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
    {
      date,
      live: live ? "true" : "false"
    }
  );
}

function formatBetween(
  result,
  date,
  afterHour
) {

  const data =
    result?.data ||
    result;

  let trains =
    data?.trains ||
    [];

  if (!Array.isArray(trains)) {
    trains = [];
  }

  if (afterHour !== null) {

    const minimum =
      afterHour * 60;

    trains =
      trains.filter(item => {

        const departure =
          item?.stop?.departure ||
          item?.from?.departure ||
          item?.departure ||
          item?.train?.departure;

        const minutes =
          timeMinutes(departure);

        return (
          minutes !== null &&
          minutes >= minimum
        );
      });
  }

  if (trains.length === 0) {

    return (
      `🚆 ${formatDate(date)} তারিখে ` +
      `চাওয়া সময়ের পরে কোনো ট্রেন পাওয়া যায়নি।`
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
    `🚆 *${fromName} → ${toName}*\n` +
    `📅 ${formatDate(date)}\n\n`;

  trains.forEach(
    (item, index) => {

      const train =
        item?.train ||
        {};

      const stop =
        item?.stop ||
        {};

      const departure =
        stop.departure ||
        item?.from?.departure ||
        item?.departure ||
        "-";

      const arrival =
        stop.arrival ||
        item?.to?.arrival ||
        item?.arrival ||
        "-";

      reply +=
        `${index + 1}. 🚆 ` +
        `${train.number || "-"} ` +
        `${train.name || ""}\n`;

      reply +=
        `   🕐 ছাড়বে: ${formatTime(departure)}\n`;

      if (arrival !== "-") {

        reply +=
          `   🕐 পৌঁছাবে: ${formatTime(arrival)}\n`;
      }

      if (
        item?.live?.delayMinutes !== undefined
      ) {

        reply +=
          `   ⏱️ Delay: ` +
          `${item.live.delayMinutes} মিনিট\n`;
      }

      if (item?.live?.platform) {

        reply +=
          `   🚉 Platform: ` +
          `${item.live.platform}\n`;
      }

      reply += "\n";
    }
  );

  reply +=
    `ℹ️ Railway data: RailRadar`;

  return reply.trim();
}

async function handleBetween(
  from,
  to,
  userMessage
) {

  const date =
    detectDate(userMessage);

  const afterHour =
    detectAfterHour(userMessage);

  const live =
    date === istDate();

  try {

    const result =
      await getBetween(
        from,
        to,
        date,
        live
      );

    return formatBetween(
      result,
      date,
      afterHour
    );

  } catch (error) {

    console.error(
      "Between API Error:",
      error.response?.data ||
      error.message
    );

    return (
      "❌ এই রুটের train data এখন পাওয়া যাচ্ছে না।\n" +
      "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );
  }
}

/* =========================================================
   GEMINI
========================================================= */

async function generateAIReply(message) {

  if (!ai) {

    return (
      `নমস্কার! 🚆\n\n` +
      `Sealdah Train Service Bot-এ স্বাগতম।\n\n` +
      `আপনি লিখতে পারেন:\n` +
      `• শান্তিপুর থেকে শিয়ালদা\n` +
      `• আজ ১২টার পর শান্তিপুর থেকে শিয়ালদা\n` +
      `• Live 31530\n` +
      `• PNR 1234567890`
    );
  }

  const prompt = `
তুমি "Sealdah Train Service" WhatsApp Assistant।

ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।

উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly হবে।

তুমি কখনো railway timing, live location বা PNR status বানিয়ে বলবে না।

Railway data API থেকে না এলে বলবে যে তথ্য এখন পাওয়া যাচ্ছে না।

সাধারণ greeting-এর সুন্দর উত্তর দেবে।

ব্যবহারকারীর প্রশ্ন:
${message}
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
            maxOutputTokens: 300
          }
        });

      const reply =
        response?.text ||
        response?.candidates?.[0]
          ?.content
          ?.parts
          ?.map(x => x.text || "")
          .join("");

      if (reply) {
        return reply.trim();
      }

    } catch (error) {

      console.error(
        `Gemini ${model} Error:`,
        error?.message ||
        error
      );
    }
  }

  return (
    `নমস্কার! 🚆\n` +
    `আপনি কী জানতে চান লিখুন।\n\n` +
    `যেমন:\n` +
    `• শান্তিপুর থেকে শিয়ালদা\n` +
    `• আজ ১২টার পর শান্তিপুর থেকে শিয়ালদা\n` +
    `• Live 31530\n` +
    `• PNR 1234567890`
  );
}

/* =========================================================
   SMART MESSAGE PROCESSOR
========================================================= */

async function processUserMessage(message) {

  const n =
    normalize(message);

  /* ---------------- PNR ---------------- */

  const digits =
    bengaliToEnglishDigits(message);

  const pnrMatch =
    digits.match(/\b\d{10}\b/);

  if (
    pnrMatch &&
    (
      n.includes("pnr") ||
      n.includes("পিএনআর") ||
      n.includes("pnr status") ||
      n.includes("পিএনআর স্ট্যাটাস")
    )
  ) {

    try {

      const result =
        await getPNR(
          pnrMatch[0]
        );

      return formatPNR(
        result,
        pnrMatch[0]
      );

    } catch (error) {

      console.error(
        "PNR Error:",
        error.response?.data ||
        error.message
      );

      const status =
        error.response?.status;

      if (status === 401) {

        return (
          "❌ RailRadar API authorization সমস্যা হয়েছে।\n" +
          "Render-এর RAILRADAR_API_KEY পরীক্ষা করুন।"
        );
      }

      if (status === 404) {

        return (
          `❌ PNR ${pnrMatch[0]}-এর তথ্য পাওয়া যায়নি।\n` +
          `PNR নম্বরটি পরীক্ষা করুন।`
        );
      }

      if (status === 429) {

        return (
          "⚠️ Railway API request limit পূর্ণ হয়েছে।\n" +
          "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
        );
      }

      return (
        "❌ PNR status এখন পাওয়া যাচ্ছে না।\n" +
        "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
      );
    }
  }

  /* ---------------- LIVE TRAIN ---------------- */

  const train =
    detectTrainNumber(message);

  if (
    train &&
    (
      n.includes("live") ||
      n.includes("লাইভ") ||
      n.includes("running") ||
      n.includes("স্ট্যাটাস") ||
      n.includes("status") ||
      n.includes("কোথায়") ||
      n.includes("কোথায়")
    )
  ) {

    try {

      const result =
        await getLiveTrain(train);

      return formatLiveStatus(
        result
      );

    } catch (error) {

      console.error(
        "Live API Error:",
        error.response?.data ||
        error.message
      );

      return (
        `❌ ${train} ট্রেনের live status এখন পাওয়া যাচ্ছে না।`
      );
    }
  }

  /* ---------------- SHANTIPUR TO SEALDAH ---------------- */

  if (
    n.includes("শান্তিপুর") &&
    (
      n.includes("শিয়ালদা") ||
      n.includes("শিয়ালদা") ||
      n.includes("শিয়ালদহ") ||
      n.includes("শিয়ালদহ") ||
      n.includes("sealdah")
    )
  ) {

    return await handleBetween(
      "STB",
      "SDAH",
      message
    );
  }

  /* ---------------- OTHER ROUTES ---------------- */

  const from =
    findStationCode(message);

  let to = null;

  const patterns = [
    /থেকে\s+(.+?)(?:\s+যাওয়ার|\s+যাওয়ার|\s+যাওয়া|\s+যেতে|\s+ট্রেন|$)/i,
    /from\s+(.+?)\s+to\s+(.+)/i
  ];

  for (const pattern of patterns) {

    const match =
      message.match(pattern);

    if (!match) continue;

    if (
      pattern.toString().includes("from")
    ) {

      to =
        findStationCode(match[2]);

    } else {

      to =
        findStationCode(match[1]);
    }

    if (to) break;
  }

  if (from && to) {

    return await handleBetween(
      from,
      to,
      message
    );
  }

  /* ---------------- GREETING ---------------- */

  if (
    /^(হ্যালো|হাই|হ্যালো|hello|hi|hey)$/i.test(
      n
    )
  ) {

    return (
      `নমস্কার! 🚆\n` +
      `Sealdah Train Service Bot-এ আপনাকে স্বাগতম।\n\n` +
      `আপনি কী জানতে চান লিখুন।\n\n` +
      `যেমন:\n` +
      `• শান্তিপুর থেকে শিয়ালদা\n` +
      `• আজ ১২টার পর শান্তিপুর থেকে শিয়ালদা\n` +
      `• Live 31530\n` +
      `• PNR 1234567890`
    );
  }

  return await generateAIReply(
    message
  );
}

/* =========================================================
   WHATSAPP SEND
========================================================= */

async function sendWhatsAppMessage(
  to,
  text
) {

  try {

    const url =
      `https://graph.facebook.com/v22.0/` +
      `${PHONE_NUMBER_ID}/messages`;

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
   HOME
========================================================= */

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>Sealdah Train Service AI Bot</title>

<style>

body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#080b14;
  color:white;
}

.container{
  max-width:1000px;
  margin:auto;
  padding:30px 20px;
}

h1{
  text-align:center;
}

.subtitle{
  text-align:center;
  color:#9ca3af;
}

.grid{
  display:grid;
  grid-template-columns:
  repeat(auto-fit,minmax(280px,1fr));
  gap:20px;
  margin-top:30px;
}

.card{
  background:#111827;
  border:1px solid #273244;
  border-radius:16px;
  padding:22px;
}

.card h2{
  margin-top:0;
}

input{
  width:100%;
  padding:13px;
  margin:8px 0;
  border-radius:8px;
  border:1px solid #374151;
  background:#0b1120;
  color:white;
  box-sizing:border-box;
}

button{
  width:100%;
  padding:13px;
  border:0;
  border-radius:8px;
  background:#2563eb;
  color:white;
  font-weight:bold;
  cursor:pointer;
  margin-top:8px;
}

button:hover{
  background:#1d4ed8;
}

.result{
  white-space:pre-wrap;
  margin-top:15px;
  padding:15px;
  border-radius:8px;
  background:#080c15;
  min-height:30px;
  line-height:1.6;
}

.status{
  display:grid;
  grid-template-columns:
  repeat(auto-fit,minmax(180px,1fr));
  gap:12px;
  margin-top:25px;
}

.status div{
  background:#111827;
  padding:15px;
  border-radius:10px;
  text-align:center;
}

.green{
  color:#22c55e;
}

.footer{
  text-align:center;
  color:#6b7280;
  margin-top:35px;
}

</style>
</head>

<body>

<div class="container">

<h1>🚆 Sealdah Train Service AI Bot</h1>

<p class="subtitle">
Railway Information & AI Assistant
</p>

<div class="status">

<div>
WhatsApp<br>
<span class="green">● Connected</span>
</div>

<div>
AI<br>
<span class="green">● Gemini</span>
</div>

<div>
Railway Data<br>
<span class="green">● RailRadar</span>
</div>

<div>
Status<br>
<span class="green">● Online</span>
</div>

</div>

<div class="grid">

<div class="card">

<h2>🎫 PNR Status</h2>

<input
id="pnrNumber"
maxlength="10"
placeholder="Enter 10 digit PNR"
/>

<button onclick="checkPNR()">
Check PNR
</button>

<div
id="pnrResult"
class="result"
>
PNR status এখানে দেখাবে।
</div>

</div>

<div class="card">

<h2>🚆 Live Train Status</h2>

<input
id="liveTrain"
maxlength="5"
placeholder="Train Number"
/>

<button onclick="checkLive()">
Check Live Status
</button>

<div
id="liveResult"
class="result"
>
Live status এখানে দেখাবে।
</div>

</div>

<div class="card">

<h2>🚉 Between Stations</h2>

<input
id="fromStation"
placeholder="From station"
/>

<input
id="toStation"
placeholder="To station"
/>

<input
id="journeyDate"
type="date"
/>

<button onclick="checkBetween()">
Search Trains
</button>

<div
id="betweenResult"
class="result"
>
Train list এখানে দেখাবে।
</div>

</div>

</div>

<div class="footer">
Created by SumanMusix 🎵
</div>

</div>

<script>

function bengaliDigits(text){

  const bn =
    "০১২৩৪৫৬৭৮৯";

  const en =
    "0123456789";

  return text
    .split("")
    .map(ch => {

      const i =
        bn.indexOf(ch);

      return i >= 0
        ? en[i]
        : ch;

    })
    .join("");
}

/* =========================
   PNR
========================= */

async function checkPNR(){

  const input =
    document.getElementById(
      "pnrNumber"
    );

  const box =
    document.getElementById(
      "pnrResult"
    );

  let pnr =
    bengaliDigits(
      input.value.trim()
    ).replace(/\D/g,"");

  input.value = pnr;

  if(!/^\\d{10}$/.test(pnr)){

    box.textContent =
      "❌ সঠিক 10 digit PNR দিন।";

    return;
  }

  box.textContent =
    "🔎 PNR status checking...";

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
      "❌ PNR status পাওয়া যায়নি।";

  }catch(error){

    console.error(error);

    box.textContent =
      "❌ PNR service এখন পাওয়া যাচ্ছে না।";
  }
}

/* =========================
   LIVE
========================= */

async function checkLive(){

  const train =
    bengaliDigits(
      document
        .getElementById(
          "liveTrain"
        )
        .value
    ).replace(/\D/g,"");

  const box =
    document.getElementById(
      "liveResult"
    );

  if(!/^\\d{5}$/.test(train)){

    box.textContent =
      "❌ সঠিক 5 digit train number দিন।";

    return;
  }

  box.textContent =
    "🔎 Live status checking...";

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
      "❌ Live status পাওয়া যায়নি।";

  }catch(error){

    box.textContent =
      "❌ Live status পাওয়া যাচ্ছে না।";
  }
}

/* =========================
   BETWEEN
========================= */

async function checkBetween(){

  const from =
    document
      .getElementById(
        "fromStation"
      )
      .value
      .trim();

  const to =
    document
      .getElementById(
        "toStation"
      )
      .value
      .trim();

  const date =
    document
      .getElementById(
        "journeyDate"
      )
      .value;

  const box =
    document.getElementById(
      "betweenResult"
    );

  if(!from || !to){

    box.textContent =
      "❌ From এবং To station দিন।";

    return;
  }

  box.textContent =
    "🔎 Train search চলছে...";

  try{

    let url =
      "/api/between?from=" +
      encodeURIComponent(from) +
      "&to=" +
      encodeURIComponent(to);

    if(date){

      url +=
        "&date=" +
        encodeURIComponent(date);
    }

    const response =
      await fetch(url);

    const data =
      await response.json();

    box.textContent =
      data.message ||
      "❌ Train data পাওয়া যায়নি।";

  }catch(error){

    box.textContent =
      "❌ Train service এখন পাওয়া যাচ্ছে না।";
  }
}

</script>

</body>
</html>
  `);

});

/* =========================================================
   HEALTH
========================================================= */

app.get("/api", (req, res) => {

  res.json({
    status: "online",
    service:
      "Sealdah Train Service AI Bot",

    whatsapp:
      !!WHATSAPP_TOKEN,

    gemini:
      !!GEMINI_API_KEY,

    railradar:
      !!RAILRADAR_API_KEY,

    features: [
      "PNR Status",
      "Live Train Status",
      "Between Stations",
      "WhatsApp AI"
    ]
  });

});

/* =========================================================
   PNR API
========================================================= */

app.get("/api/pnr", async (req, res) => {

  const pnr =
    bengaliToEnglishDigits(
      req.query.pnr || ""
    ).replace(/\D/g,"");

  if(!/^\d{10}$/.test(pnr)){

    return res.status(400).json({

      success:false,

      message:
        "❌ সঠিক 10 digit PNR দিন।"
    });
  }

  try{

    console.log(
      "PNR REQUEST:",
      pnr
    );

    const result =
      await getPNR(pnr);

    const message =
      formatPNR(
        result,
        pnr
      );

    return res.json({

      success:true,

      message,

      data:result
    });

  }catch(error){

    console.error(
      "PNR API ERROR:",
      error.response?.data ||
      error.message
    );

    const status =
      error.response?.status ||
      500;

    let message =
      "❌ PNR status এখন পাওয়া যাচ্ছে না।";

    if(status === 401){

      message =
        "❌ RailRadar API key invalid বা missing। Render Environment-এ RAILRADAR_API_KEY পরীক্ষা করুন।";
    }

    else if(status === 404){

      message =
        "❌ এই PNR-এর তথ্য পাওয়া যায়নি। PNR নম্বরটি পরীক্ষা করুন।";
    }

    else if(status === 429){

      message =
        "⚠️ Railway API request limit পূর্ণ হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
    }

    else if(status === 503){

      message =
        "⚠️ Railway service সাময়িকভাবে unavailable। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
    }

    return res.status(status).json({

      success:false,

      message
    });
  }

});

/* =========================================================
   LIVE API
========================================================= */

app.get(
  "/api/live-status",
  async (req,res) => {

    const train =
      bengaliToEnglishDigits(
        req.query.train || ""
      ).replace(/\D/g,"");

    if(!/^\d{5}$/.test(train)){

      return res.status(400).json({

        success:false,

        message:
          "❌ সঠিক 5 digit train number দিন।"
      });
    }

    try{

      const result =
        await getLiveTrain(
          train
        );

      return res.json({

        success:true,

        message:
          formatLiveStatus(
            result
          ),

        data:result
      });

    }catch(error){

      console.error(
        "LIVE API ERROR:",
        error.response?.data ||
        error.message
      );

      return res.status(
        error.response?.status ||
        500
      ).json({

        success:false,

        message:
          "❌ এই ট্রেনের Live Status এখন পাওয়া যাচ্ছে না।"
      });
    }
  }
);

/* =========================================================
   BETWEEN API
========================================================= */

app.get(
  "/api/between",
  async (req,res) => {

    const fromInput =
      req.query.from ||
      "";

    const toInput =
      req.query.to ||
      "";

    const date =
      req.query.date ||
      istDate();

    const from =
      findStationCode(
        fromInput
      );

    const to =
      findStationCode(
        toInput
      );

    if(!from || !to){

      return res.status(400).json({

        success:false,

        message:
          "❌ Station পাওয়া যায়নি। Station name বা code দিন।"
      });
    }

    try{

      const result =
        await getBetween(
          from,
          to,
          date,
          date === istDate()
        );

      return res.json({

        success:true,

        from,
        to,
        date,

        message:
          formatBetween(
            result,
            date,
            null
          ),

        data:result
      });

    }catch(error){

      console.error(
        "BETWEEN API ERROR:",
        error.response?.data ||
        error.message
      );

      return res.status(
        error.response?.status ||
        500
      ).json({

        success:false,

        message:
          "❌ Train data এখন পাওয়া যাচ্ছে না।"
      });
    }
  }
);

/* =========================================================
   PRIVACY
========================================================= */

app.get(
  "/privacy",
  (req,res) => {

    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Privacy Policy</title>
</head>

<body
style="
font-family:Arial;
max-width:800px;
margin:auto;
padding:40px;
">

<h1>Privacy Policy</h1>

<p>
Sealdah Train Service AI Bot processes
WhatsApp messages to provide automated
railway information and assistance.
</p>

<p>
Railway information may be processed through
RailRadar and general questions may be processed
through Google Gemini.
</p>

<p>
The service does not intentionally sell or
publish user messages.
</p>

</body>
</html>
    `);
  }
);

/* =========================================================
   WHATSAPP VERIFY
========================================================= */

app.get(
  "/webhook",
  (req,res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query["hub.verify_token"];

    const challenge =
      req.query["hub.challenge"];

    if(
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ){

      console.log(
        "WhatsApp Webhook Verified"
      );

      return res
        .status(200)
        .send(challenge);
    }

    return res.sendStatus(403);
  }
);

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post(
  "/webhook",
  async (req,res) => {

    res.sendStatus(200);

    try{

      console.log(
        "========== NEW WHATSAPP WEBHOOK =========="
      );

      const value =
        req.body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      const messages =
        value?.messages;

      if(
        !messages ||
        messages.length === 0
      ){

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

      if(
        message.type !== "text"
      ){

        await sendWhatsAppMessage(
          from,
          "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"
        );

        return;
      }

      const userMessage =
        message.text
          ?.body
          ?.trim();

      if(!userMessage){
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

    }catch(error){

      console.error(
        "WEBHOOK ERROR:",
        error.response?.data ||
        error.message ||
        error
      );
    }
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "======================================"
    );

    console.log(
      "🚆 Sealdah Train Service AI Bot"
    );

    console.log(
      "======================================"
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
      "======================================"
    );
  }
);
