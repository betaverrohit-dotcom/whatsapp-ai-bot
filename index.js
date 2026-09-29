require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY;

/* =========================================================
   GEMINI
========================================================= */

let ai = null;

if (GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
  });
}

/* =========================================================
   RAILRADAR
========================================================= */

const RAILRADAR_BASE_URL = "https://api.railradar.in/v1";

/* =========================================================
   STATION ALIASES
========================================================= */

const STATION_ALIASES = {

  "শান্তিপুর": {
    code: "STB",
    name: "Shantipur"
  },

  "সান্তিপুর": {
    code: "STB",
    name: "Shantipur"
  },

  "shantipur": {
    code: "STB",
    name: "Shantipur"
  },

  "santipur": {
    code: "STB",
    name: "Shantipur"
  },

  "stb": {
    code: "STB",
    name: "Shantipur"
  },

  "শিয়ালদা": {
    code: "SDAH",
    name: "Sealdah"
  },

  "শিয়ালদা": {
    code: "SDAH",
    name: "Sealdah"
  },

  "sealdah": {
    code: "SDAH",
    name: "Sealdah"
  },

  "sdah": {
    code: "SDAH",
    name: "Sealdah"
  },

  "রানাঘাট": {
    code: "RHA",
    name: "Ranaghat"
  },

  "ranaghat": {
    code: "RHA",
    name: "Ranaghat"
  },

  "rha": {
    code: "RHA",
    name: "Ranaghat"
  },

  "কৃষ্ণনগর": {
    code: "KNJ",
    name: "Krishnanagar City Junction"
  },

  "কৃষ্ণনগর সিটি": {
    code: "KNJ",
    name: "Krishnanagar City Junction"
  },

  "krishnanagar": {
    code: "KNJ",
    name: "Krishnanagar City Junction"
  },

  "knj": {
    code: "KNJ",
    name: "Krishnanagar City Junction"
  },

  "কলকাতা": {
    code: "KOAA",
    name: "Kolkata"
  },

  "kolkata": {
    code: "KOAA",
    name: "Kolkata"
  }

};

/* =========================================================
   HOME PAGE
========================================================= */

app.get("/", (req, res) => {

  res.send(`
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>Sealdah Train Service AI Bot</title>

<style>

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #0f1420;
  color: #ffffff;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.container {
  width: 90%;
  max-width: 700px;
  text-align: center;
  padding: 40px;
}

.logo {
  font-size: 60px;
  margin-bottom: 10px;
}

h1 {
  font-size: 30px;
  margin-bottom: 10px;
}

p {
  color: #aab4c5;
  font-size: 17px;
}

.status {
  margin-top: 30px;
  padding: 20px;
  border: 1px solid #283247;
  border-radius: 15px;
  background: #151b29;
}

.status-item {
  padding: 10px;
  color: #d7deea;
}

.online {
  color: #00e5a0;
  font-weight: bold;
}

</style>

</head>

<body>

<div class="container">

<div class="logo">🚆</div>

<h1>Sealdah Train Service AI Bot</h1>

<p>WhatsApp Railway Assistant</p>

<div class="status">

<div class="status-item">
WhatsApp: <span class="online">Connected</span>
</div>

<div class="status-item">
AI Assistant: <span class="online">Online</span>
</div>

<div class="status-item">
Train Service: <span class="online">Online</span>
</div>

</div>

</div>

</body>

</html>
  `);

});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api", (req, res) => {

  res.json({

    status: "online",

    service: "Sealdah Train Service AI Bot",

    whatsapp: WHATSAPP_TOKEN
      ? "connected"
      : "not configured",

    ai: GEMINI_API_KEY
      ? "configured"
      : "not configured",

    railwayData: RAILRADAR_API_KEY
      ? "configured"
      : "not configured"

  });

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

<style>

body {
  font-family: Arial;
  background: #0f1420;
  color: white;
  padding: 30px;
  line-height: 1.7;
}

.container {
  max-width: 800px;
  margin: auto;
}

</style>

</head>

<body>

<div class="container">

<h1>Privacy Policy</h1>

<p>
Sealdah Train Service AI Bot provides automated railway
information and assistance through WhatsApp.
</p>

<p>
Messages may be processed to provide requested railway
information, train status, PNR status and general assistance.
</p>

<p>
The service does not intentionally store unnecessary personal
information.
</p>

</div>

</body>

</html>

  `);

});

/* =========================================================
   WHATSAPP WEBHOOK VERIFY
========================================================= */

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];

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

async function sendWhatsAppMessage(to, text) {

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {

    console.error(
      "WhatsApp configuration missing"
    );

    return;

  }

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    const response =
      await axios.post(

        url,

        {

          messaging_product: "whatsapp",

          recipient_type: "individual",

          to: to,

          type: "text",

          text: {

            preview_url: false,

            body: text

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
      response.data?.messages?.[0]?.id || "OK"
    );

  }

  catch (error) {

    console.error(

      "WhatsApp Send Error:",

      error.response?.data ||
      error.message

    );

  }

}

/* =========================================================
   GET STATION CODE
========================================================= */

function getStation(text) {

  if (!text) {
    return null;
  }

  const normalized =
    text
      .toLowerCase()
      .trim();

  return STATION_ALIASES[normalized] || null;

}

/* =========================================================
   DETECT SOURCE / DESTINATION
========================================================= */

function detectStations(message) {

  const text =
    message
      .toLowerCase()
      .replace(/→/g, " থেকে ")
      .replace(/->/g, " থেকে ");

  let from = null;
  let to = null;

  const aliases =
    Object.keys(STATION_ALIASES);

  for (const alias of aliases) {

    if (!text.includes(alias)) {
      continue;
    }

    const station =
      STATION_ALIASES[alias];

    const index =
      text.indexOf(alias);

    const before =
      text.substring(
        Math.max(0, index - 30),
        index
      );

    const after =
      text.substring(
        index + alias.length,
        index + alias.length + 30
      );

    if (
      before.includes("থেকে") ||
      before.includes("from")
    ) {

      if (!from) {
        from = station;
      }

    }

    if (
      after.includes("দিকে") ||
      after.includes("যাওয়ার") ||
      after.includes("যাওয়ার") ||
      after.includes("to")
    ) {

      if (!to) {
        to = station;
      }

    }

  }

  /* Special common format:
     শান্তিপুর থেকে শিয়ালদা
  */

  const fromToMatch =
    text.match(
      /(.+?)\s+থেকে\s+(.+?)(?:\s+যাও|$)/
    );

  if (fromToMatch) {

    const fromText =
      fromToMatch[1].trim();

    const toText =
      fromToMatch[2].trim();

    for (const alias of aliases) {

      if (
        fromText.includes(alias)
      ) {

        from =
          STATION_ALIASES[alias];

      }

      if (
        toText.includes(alias)
      ) {

        to =
          STATION_ALIASES[alias];

      }

    }

  }

  /* English format */

  const englishMatch =
    text.match(
      /from\s+(.+?)\s+to\s+(.+)/
    );

  if (englishMatch) {

    const fromText =
      englishMatch[1].trim();

    const toText =
      englishMatch[2].trim();

    for (const alias of aliases) {

      if (
        fromText.includes(alias)
      ) {

        from =
          STATION_ALIASES[alias];

      }

      if (
        toText.includes(alias)
      ) {

        to =
          STATION_ALIASES[alias];

      }

    }

  }

  return {
    from,
    to
  };

}

/* =========================================================
   DETECT PNR
========================================================= */

function detectPNR(message) {

  if (!message) {
    return null;
  }

  const match =
    message.match(
      /(?:PNR[\s:-]*)?(\d{10})/i
    );

  if (!match) {
    return null;
  }

  return match[1];

}

/* =========================================================
   DETECT TRAIN NUMBER
========================================================= */

function detectTrainNumber(message) {

  if (!message) {
    return null;
  }

  const text =
    message.toLowerCase();

  const patterns = [

    /train\s*(?:no|number|num)?\s*[:\-]?\s*(\d{5})/i,

    /ট্রেন\s*(?:নং|নম্বর)?\s*[:\-]?\s*(\d{5})/i,

    /\b(\d{5})\b/

  ];

  for (const pattern of patterns) {

    const match =
      text.match(pattern);

    if (match) {

      return match[1];

    }

  }

  return null;

}

/* =========================================================
   RAILRADAR REQUEST
========================================================= */

async function railRadarRequest(endpoint) {

  if (!RAILRADAR_API_KEY) {

    throw new Error(
      "RAILRADAR_API_KEY is missing"
    );

  }

  const url =
    `${RAILRADAR_BASE_URL}${endpoint}`;

  const response =
    await axios.get(

      url,

      {

        headers: {

          Authorization:
            `Bearer ${RAILRADAR_API_KEY}`,

          Accept:
            "application/json"

        },

        timeout: 15000

      }

    );

  return response.data;

}

/* =========================================================
   PNR STATUS
========================================================= */

async function getPNRStatus(pnr) {

  const data =
    await railRadarRequest(
      `/pnr/${pnr}`
    );

  return data;

}

/* =========================================================
   TRAIN LIVE STATUS
========================================================= */

async function getTrainLiveStatus(trainNumber) {

  const data =
    await railRadarRequest(
      `/trains/${trainNumber}/live?authoritative=true`
    );

  return data;

}

/* =========================================================
   TRAINS BETWEEN STATIONS
========================================================= */

async function getTrainsBetweenStations(
  fromCode,
  toCode
) {

  const data =
    await railRadarRequest(
      `/trains/between/${fromCode}/${toCode}?live=true`
    );

  return data;

}

/* =========================================================
   FORMAT PNR STATUS
========================================================= */

function formatPNRStatus(apiResponse, pnr) {

  if (
    !apiResponse ||
    apiResponse.success === false
  ) {

    return (
      `❌ PNR ${pnr} পাওয়া যায়নি।\n\n` +
      `দয়া করে ১০ সংখ্যার সঠিক PNR নম্বর পাঠান।`
    );

  }

  const data =
    apiResponse.data || {};

  const train =
    data.train || {};

  const passengers =
    data.passengers ||
    data.passengerStatus ||
    data.passengerStatuses ||
    [];

  let reply =
    `🎫 *PNR STATUS*\n\n`;

  reply +=
    `PNR: *${pnr}*\n`;

  if (train.number) {

    reply +=
      `🚆 Train: *${train.number}`;

    if (train.name) {

      reply +=
        ` - ${train.name}`;

    }

    reply += `*\n`;

  }

  if (
    data.journeyDate ||
    data.date
  ) {

    reply +=
      `📅 Journey: *${
        data.journeyDate ||
        data.date
      }*\n`;

  }

  if (data.chartStatus) {

    reply +=
      `📋 Chart: *${data.chartStatus}*\n`;

  }

  if (
    data.chartPrepared !== undefined
  ) {

    reply +=
      `📋 Chart Prepared: *${
        data.chartPrepared
          ? "Yes"
          : "No"
      }*\n`;

  }

  if (
    data.source &&
    data.destination
  ) {

    reply +=
      `📍 ${
        data.source.name ||
        data.source
      } → ${
        data.destination.name ||
        data.destination
      }\n`;

  }

  reply += `\n`;

  if (
    Array.isArray(passengers) &&
    passengers.length > 0
  ) {

    reply +=
      `👤 *Passenger Status*\n\n`;

    passengers.forEach(
      (passenger, index) => {

        const number =
          passenger.number ||
          passenger.passengerNumber ||
          index + 1;

        const current =
          passenger.currentStatus ||
          passenger.current ||
          passenger.status ||
          passenger.bookingStatus ||
          "Unknown";

        const booking =
          passenger.bookingStatus ||
          passenger.booking ||
          "";

        const coach =
          passenger.coach ||
          passenger.coachNumber ||
          "";

        const berth =
          passenger.berth ||
          passenger.berthNumber ||
          passenger.seat ||
          "";

        reply +=
          `${number}. `;

        if (coach && berth) {

          reply +=
            `Coach *${coach}* · Berth *${berth}*`;

        }

        else if (coach) {

          reply +=
            `Coach *${coach}*`;

        }

        else if (berth) {

          reply +=
            `Berth *${berth}*`;

        }

        reply +=
          `\nStatus: *${current}*`;

        if (
          booking &&
          booking !== current
        ) {

          reply +=
            `\nBooking: ${booking}`;

        }

        reply += `\n\n`;

      }
    );

  }

  else {

    const status =
      data.status ||
      data.overallStatus ||
      data.currentStatus;

    if (status) {

      reply +=
        `📌 Status: *${status}*\n\n`;

    }

    if (
      data.message
    ) {

      reply +=
        `${data.message}\n\n`;

    }

  }

  if (
    data.overallStatus
  ) {

    reply +=
      `📌 Overall: *${data.overallStatus}*\n`;

  }

  if (
    data.status
  ) {

    reply +=
      `📌 Status: *${data.status}*\n`;

  }

  reply +=
    `\n⚠️ তথ্য RailRadar API থেকে নেওয়া হয়েছে।`;

  return reply.trim();

}

/* =========================================================
   FORMAT TRAIN LIVE STATUS
========================================================= */

function formatTrainLiveStatus(
  apiResponse,
  trainNumber
) {

  if (
    !apiResponse ||
    apiResponse.success === false
  ) {

    return (
      `❌ Train ${trainNumber}-এর live status পাওয়া যায়নি।`
    );

  }

  const data =
    apiResponse.data || {};

  const train =
    data.train || {};

  let reply =
    `🚆 *LIVE TRAIN STATUS*\n\n`;

  reply +=
    `Train: *${train.number || trainNumber}*\n`;

  if (train.name) {

    reply +=
      `Name: *${train.name}*\n`;

  }

  if (data.status) {

    reply +=
      `📌 Status: *${data.status}*\n`;

  }

  if (
    data.delay !== undefined &&
    data.delay !== null
  ) {

    reply +=
      `⏱ Delay: *${data.delay} min*\n`;

  }

  if (
    data.delayMinutes !== undefined
  ) {

    reply +=
      `⏱ Delay: *${data.delayMinutes} min*\n`;

  }

  const currentLocation =
    data.currentLocation;

  if (currentLocation) {

    if (
      currentLocation.station?.name
    ) {

      reply +=
        `📍 Current: *${currentLocation.station.name}*\n`;

    }

    else if (
      currentLocation.name
    ) {

      reply +=
        `📍 Current: *${currentLocation.name}*\n`;

    }

  }

  if (data.nextStation) {

    const nextName =
      typeof data.nextStation === "string"
        ? data.nextStation
        : data.nextStation.name;

    if (nextName) {

      reply +=
        `➡️ Next: *${nextName}*\n`;

    }

  }

  if (
    data.platform !== undefined &&
    data.platform !== null
  ) {

    reply +=
      `🚉 Platform: *${data.platform}*\n`;

  }

  if (
    data.expectedPlatform
  ) {

    reply +=
      `🚉 Expected Platform: *${data.expectedPlatform}*\n`;

  }

  reply +=
    `\n⚠️ Live railway data may change.`;

  return reply.trim();

}

/* =========================================================
   FORMAT TRAINS BETWEEN STATIONS
========================================================= */

function formatTrainsBetweenStations(
  apiResponse,
  from,
  to
) {

  if (
    !apiResponse ||
    apiResponse.success === false
  ) {

    return (
      `❌ ${from.name} থেকে ${to.name} যাওয়ার ট্রেনের তথ্য এখন পাওয়া যাচ্ছে না।`
    );

  }

  const data =
    apiResponse.data || {};

  const trains =
    data.trains || [];

  if (
    !Array.isArray(trains) ||
    trains.length === 0
  ) {

    return (
      `❌ ${from.name} থেকে ${to.name} যাওয়ার ট্রেন পাওয়া যায়নি।`
    );

  }

  let reply =
    `🚆 *${from.name} → ${to.name}*\n\n`;

  reply +=
    `আজ/নির্বাচিত journey-এর available train:\n\n`;

  const limited =
    trains.slice(0, 15);

  limited.forEach(
    (item, index) => {

      const train =
        item.train || item;

      const number =
        train.number ||
        train.trainNumber ||
        "";

      const name =
        train.name ||
        train.trainName ||
        "Train";

      const stop =
        item.stop ||
        {};

      const departure =
        stop.departure ||
        item.departure ||
        train.departure ||
        "";

      const arrival =
        stop.arrival ||
        item.arrival ||
        train.arrival ||
        "";

      reply +=
        `${index + 1}. 🚆 *${number} ${name}*\n`;

      if (departure) {

        reply +=
          `   🕐 Departure: ${departure}\n`;

      }

      if (arrival) {

        reply +=
          `   🕐 Arrival: ${arrival}\n`;

      }

      if (
        item.liveStatus
      ) {

        reply +=
          `   📍 ${item.liveStatus}\n`;

      }

      if (
        item.delay !== undefined
      ) {

        reply +=
          `   ⏱ Delay: ${item.delay} min\n`;

      }

      reply += `\n`;

    }
  );

  if (trains.length > 15) {

    reply +=
      `আরও ${trains.length - 15}টি train available।`;

  }

  return reply.trim();

}

/* =========================================================
   GENERAL GEMINI AI
========================================================= */

async function generateAIReply(
  userMessage
) {

  if (!ai) {

    return (
      `নমস্কার! 🚆\n\n` +
      `আমি Sealdah Train Service AI Bot।\n` +
      `PNR, Train Live Status অথবা দুই স্টেশনের মধ্যে ট্রেন জানতে পারেন।`
    );

  }

  try {

    const systemInstruction = `

তুমি "Sealdah Train Service AI Bot"।

তোমার কাজ ভারতীয় রেলের বিশেষ করে Eastern Railway এবং
Sealdah Division সংক্রান্ত সাধারণ প্রশ্নের উত্তর দেওয়া।

নিয়ম:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ব্যবহারকারী ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. উত্তর সংক্ষিপ্ত এবং WhatsApp-friendly হবে।
4. "হ্যালো", "হাই", "Hello" ইত্যাদির সুন্দর উত্তর দেবে।
5. Live railway data নিজে থেকে বানাবে না।
6. PNR status, live train status এবং train-between-stations
   data application-এর railway API থেকে নেওয়া হয়।
7. API data না থাকলে কখনো বানানো তথ্য দেবে না।
8. সাধারণ railway information দিতে পারবে।
9. অপ্রয়োজনীয় বড় উত্তর দেবে না।
10. ব্যবহারকারীকে সহজভাবে সাহায্য করবে।

উদাহরণ:

User:
হ্যালো

Answer:
নমস্কার! 🚆 Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম।

আপনি PNR Status, Train Live Status অথবা দুই স্টেশনের মধ্যে ট্রেনের তথ্য জানতে পারেন।

`;

    const response =
      await ai.models.generateContent({

        model:
          "gemini-3.5-flash-lite",

        contents:
          userMessage,

        config: {

          systemInstruction:
            systemInstruction,

          temperature: 0.2,

          maxOutputTokens: 400

        }

      });

    const reply =
      response.text ||
      "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না।";

    return reply.trim();

  }

  catch (error) {

    console.error(
      "Gemini Error:",
      error?.message ||
      error
    );

    return (
      `নমস্কার! 🚆\n\n` +
      `আমি এখন সাধারণ AI উত্তর দিতে পারছি না।\n\n` +
      `আপনি PNR নম্বর, ৫ digit Train Number অথবা ` +
      `From → To লিখে পাঠাতে পারেন।`
    );

  }

}

/* =========================================================
   PNR API ENDPOINT
========================================================= */

app.get("/api/pnr", async (req, res) => {

  try {

    const pnr =
      String(
        req.query.pnr || ""
      ).replace(/\D/g, "");

    if (!/^\d{10}$/.test(pnr)) {

      return res.status(400).json({

        success: false,

        error:
          "PNR must be exactly 10 digits"

      });

    }

    const data =
      await getPNRStatus(pnr);

    return res.json(data);

  }

  catch (error) {

    console.error(
      "PNR API Error:",
      error.response?.data ||
      error.message
    );

    return res.status(
      error.response?.status || 500
    ).json({

      success: false,

      error:
        error.response?.data ||
        error.message

    });

  }

});

/* =========================================================
   TRAIN LIVE API ENDPOINT
========================================================= */

app.get(
  "/api/train/:trainNumber",
  async (req, res) => {

    try {

      const trainNumber =
        String(
          req.params.trainNumber
        ).replace(/\D/g, "");

      if (
        !/^\d{5}$/.test(trainNumber)
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Train number must be 5 digits"

        });

      }

      const data =
        await getTrainLiveStatus(
          trainNumber
        );

      return res.json(data);

    }

    catch (error) {

      console.error(
        "Train API Error:",
        error.response?.data ||
        error.message
      );

      return res.status(
        error.response?.status || 500
      ).json({

        success: false,

        error:
          error.response?.data ||
          error.message

      });

    }

  }
);

/* =========================================================
   BETWEEN STATIONS API ENDPOINT
========================================================= */

app.get(
  "/api/between",
  async (req, res) => {

    try {

      const from =
        String(
          req.query.from || ""
        ).toUpperCase();

      const to =
        String(
          req.query.to || ""
        ).toUpperCase();

      if (!from || !to) {

        return res.status(400).json({

          success: false,

          error:
            "from and to station codes are required"

        });

      }

      const data =
        await getTrainsBetweenStations(
          from,
          to
        );

      return res.json(data);

    }

    catch (error) {

      console.error(
        "Between Stations API Error:",
        error.response?.data ||
        error.message
      );

      return res.status(
        error.response?.status || 500
      ).json({

        success: false,

        error:
          error.response?.data ||
          error.message

      });

    }

  }
);

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {

  /* IMPORTANT:
     Respond immediately to Meta
  */

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

    /* =====================================================
       ONLY TEXT
    ===================================================== */

    if (
      message.type !== "text"
    ) {

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

    /* =====================================================
       1. PNR
    ===================================================== */

    const pnr =
      detectPNR(userMessage);

    if (pnr) {

      console.log(
        "Detected PNR:",
        pnr
      );

      try {

        const pnrData =
          await getPNRStatus(pnr);

        const reply =
          formatPNRStatus(
            pnrData,
            pnr
          );

        console.log(
          "FINAL PNR REPLY:",
          reply
        );

        await sendWhatsAppMessage(
          from,
          reply
        );

      }

      catch (error) {

        console.error(
          "PNR Error:",
          error.response?.data ||
          error.message
        );

        await sendWhatsAppMessage(

          from,

          `❌ PNR ${pnr} এখন যাচাই করা যাচ্ছে না।\n\n` +
          `কিছুক্ষণ পরে আবার চেষ্টা করুন।`

        );

      }

      return;

    }

    /* =====================================================
       2. TRAIN NUMBER LIVE STATUS
    ===================================================== */

    const trainNumber =
      detectTrainNumber(
        userMessage
      );

    const liveKeywords = [

      "live",

      "status",

      "running",

      "কোথায়",

      "কোথায়",

      "চলছে",

      "লাইভ",

      "স্ট্যাটাস"

    ];

    const wantsLiveStatus =
      liveKeywords.some(
        keyword =>
          userMessage
            .toLowerCase()
            .includes(keyword)
      );

    if (
      trainNumber &&
      wantsLiveStatus
    ) {

      console.log(
        "Detected Train Number:",
        trainNumber
      );

      try {

        const trainData =
          await getTrainLiveStatus(
            trainNumber
          );

        const reply =
          formatTrainLiveStatus(
            trainData,
            trainNumber
          );

        console.log(
          "FINAL TRAIN REPLY:",
          reply
        );

        await sendWhatsAppMessage(
          from,
          reply
        );

      }

      catch (error) {

        console.error(
          "Train Live Error:",
          error.response?.data ||
          error.message
        );

        await sendWhatsAppMessage(

          from,

          `❌ Train ${trainNumber}-এর live status এখন পাওয়া যাচ্ছে না।`

        );

      }

      return;

    }

    /* =====================================================
       3. BETWEEN STATIONS
    ===================================================== */

    const stations =
      detectStations(
        userMessage
      );

    console.log(
      "Detected stations:",
      stations
    );

    if (
      stations.from &&
      stations.to
    ) {

      console.log(
        "Searching trains:",
        stations.from.code,
        "→",
        stations.to.code
      );

      try {

        const trainData =
          await getTrainsBetweenStations(

            stations.from.code,

            stations.to.code

          );

        const reply =
          formatTrainsBetweenStations(

            trainData,

            stations.from,

            stations.to

          );

        console.log(
          "FINAL BETWEEN REPLY:",
          reply
        );

        await sendWhatsAppMessage(
          from,
          reply
        );

      }

      catch (error) {

        console.error(

          "Between Stations Error:",

          error.response?.data ||
          error.message

        );

        await sendWhatsAppMessage(

          from,

          `❌ ${stations.from.name} থেকে ${stations.to.name} যাওয়ার train data এখন পাওয়া যাচ্ছে না।\n\n` +
          `কিছুক্ষণ পরে আবার চেষ্টা করুন।`

        );

      }

      return;

    }

    /* =====================================================
       4. GENERAL AI
    ===================================================== */

    const reply =
      await generateAIReply(
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

  }

  catch (error) {

    console.error(

      "Webhook Error:",

      error?.response?.data ||
      error?.message ||
      error

    );

  }

});

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "================================"
    );

    console.log(
      "Sealdah Train Service AI Bot"
    );

    console.log(
      "================================"
    );

    console.log(
      "Server running on port:",
      PORT
    );

    console.log(
      "Health: /api"
    );

    console.log(
      "Webhook: /webhook"
    );

    console.log(
      "Privacy: /privacy"
    );

    console.log(
      "PNR API: /api/pnr?pnr=XXXXXXXXXX"
    );

    console.log(
      "Train API: /api/train/12345"
    );

    console.log(
      "Between API: /api/between?from=STB&to=SDAH"
    );

    console.log(
      "Gemini API Key:",
      GEMINI_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "RailRadar API Key:",
      RAILRADAR_API_KEY
        ? "OK"
        : "MISSING"
    );

    console.log(
      "WhatsApp Token:",
      WHATSAPP_TOKEN
        ? "OK"
        : "MISSING"
    );

    console.log(
      "Phone Number ID:",
      PHONE_NUMBER_ID
        ? "OK"
        : "MISSING"
    );

    console.log(
      "================================"
    );

  }
);
