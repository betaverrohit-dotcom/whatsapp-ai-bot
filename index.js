require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================================
   ENVIRONMENT VARIABLES
========================================= */

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY;

/* =========================================
   GEMINI
========================================= */

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;

/* =========================================
   HOME
========================================= */

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
  background:#0b1020;
  color:#ffffff;
  font-family:Arial,Helvetica,sans-serif;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:100vh;
}

.card{
  width:90%;
  max-width:600px;
  background:#121a2d;
  border:1px solid #26334f;
  border-radius:20px;
  padding:35px;
  box-sizing:border-box;
  box-shadow:0 20px 60px rgba(0,0,0,.35);
}

h1{
  margin-top:0;
  font-size:28px;
}

.status{
  display:flex;
  justify-content:space-between;
  padding:14px 0;
  border-bottom:1px solid #26334f;
}

.ok{
  color:#00d084;
  font-weight:bold;
}
</style>
</head>

<body>

<div class="card">

<h1>🚆 Sealdah Train Service AI Bot</h1>

<div class="status">
<span>WhatsApp</span>
<span class="ok">Connected</span>
</div>

<div class="status">
<span>AI Assistant</span>
<span class="ok">Gemini</span>
</div>

<div class="status">
<span>Railway Data</span>
<span class="ok">Live API</span>
</div>

<div class="status">
<span>PNR Status</span>
<span class="ok">Available</span>
</div>

<div class="status">
<span>System Status</span>
<span class="ok">Online</span>
</div>

</div>

</body>
</html>
  `);
});

/* =========================================
   HEALTH CHECK
========================================= */

app.get("/api", (req, res) => {

  res.json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    whatsapp: WHATSAPP_TOKEN ? "configured" : "missing",
    ai: GEMINI_API_KEY ? "configured" : "missing",
    railwayData: RAILRADAR_API_KEY ? "configured" : "missing",
    pnr: "enabled"
  });

});

/* =========================================
   PRIVACY
========================================= */

app.get("/privacy", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Privacy Policy</title>
</head>

<body style="
font-family:Arial;
padding:30px;
max-width:800px;
margin:auto;
line-height:1.7;
">

<h1>Privacy Policy</h1>

<p>
Sealdah Train Service AI Bot processes WhatsApp messages
only for providing railway information and automated assistance.
</p>

<p>
PNR numbers are processed only when a user requests PNR status.
</p>

<p>
The service does not intentionally store user messages
for unrelated purposes.
</p>

</body>
</html>
  `);

});

/* =========================================
   WHATSAPP WEBHOOK VERIFY
========================================= */

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {

    console.log("WhatsApp Webhook Verified");

    return res
      .status(200)
      .send(challenge);
  }

  return res.sendStatus(403);

});

/* =========================================
   SEND WHATSAPP MESSAGE
========================================= */

async function sendWhatsAppMessage(to, text) {

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    const response = await axios.post(
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
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(
      "WhatsApp message sent successfully:",
      response.data?.messages?.[0]?.id || "OK"
    );

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data || error.message
    );

  }

}

/* =========================================
   FIND PNR
========================================= */

function extractPNR(text) {

  if (!text) return null;

  const match = text.match(/\b\d{10}\b/);

  return match ? match[0] : null;

}

/* =========================================
   SAFE VALUE
   Prevent [object Object]
========================================= */

function safeText(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {

    return value
      .map(item => safeText(item))
      .filter(Boolean)
      .join(", ");

  }

  if (typeof value === "object") {

    const preferredKeys = [
      "status",
      "code",
      "coach",
      "coachNumber",
      "berth",
      "berthNumber",
      "berthType",
      "type",
      "number",
      "name",
      "position"
    ];

    const parts = [];

    for (const key of preferredKeys) {

      if (
        value[key] !== undefined &&
        value[key] !== null &&
        value[key] !== ""
      ) {

        const val = safeText(value[key]);

        if (val) {
          parts.push(val);
        }

      }

    }

    if (parts.length > 0) {
      return parts.join(" / ");
    }

    return Object.values(value)
      .map(v => safeText(v))
      .filter(Boolean)
      .join(" / ");
  }

  return String(value);

}

/* =========================================
   FIND PASSENGERS OBJECT
========================================= */

function findPassengers(obj) {

  if (!obj || typeof obj !== "object") {
    return null;
  }

  if (Array.isArray(obj)) {

    for (const item of obj) {

      const found = findPassengers(item);

      if (found) {
        return found;
      }

    }

    return null;
  }

  const possibleKeys = [
    "passengers",
    "passengerStatus",
    "passengerStatuses",
    "bookingPassengers"
  ];

  for (const key of possibleKeys) {

    if (Array.isArray(obj[key])) {
      return obj[key];
    }

  }

  for (const value of Object.values(obj)) {

    if (
      value &&
      typeof value === "object"
    ) {

      const found = findPassengers(value);

      if (found) {
        return found;
      }

    }

  }

  return null;

}

/* =========================================
   FIND VALUE RECURSIVELY
========================================= */

function findValue(obj, keys) {

  if (!obj || typeof obj !== "object") {
    return null;
  }

  for (const key of keys) {

    if (
      obj[key] !== undefined &&
      obj[key] !== null
    ) {

      return obj[key];

    }

  }

  for (const value of Object.values(obj)) {

    if (
      value &&
      typeof value === "object"
    ) {

      const found =
        findValue(value, keys);

      if (
        found !== null &&
        found !== undefined
      ) {

        return found;

      }

    }

  }

  return null;

}

/* =========================================
   FORMAT PASSENGER STATUS
========================================= */

function formatPassengerStatus(passenger, index) {

  if (!passenger) {
    return `${index}. Passenger status unavailable`;
  }

  const booking =
    passenger.bookingStatus ??
    passenger.booking ??
    passenger.bookedStatus ??
    passenger.booking_status ??
    null;

  const current =
    passenger.currentStatus ??
    passenger.current ??
    passenger.current_status ??
    passenger.status ??
    null;

  const bookingText =
    safeText(booking) || "N/A";

  const currentText =
    safeText(current) || "N/A";

  let coach = findValue(
    passenger,
    [
      "coach",
      "coachNumber",
      "coachNo"
    ]
  );

  let berth = findValue(
    passenger,
    [
      "berth",
      "berthNumber",
      "berthNo",
      "seat"
    ]
  );

  let berthType = findValue(
    passenger,
    [
      "berthType",
      "seatType",
      "berth_type"
    ]
  );

  let passengerName = findValue(
    passenger,
    [
      "name",
      "passengerName"
    ]
  );

  const lines = [];

  lines.push(
    `${index}. ${passengerName ? safeText(passengerName) : "Passenger"}`
  );

  lines.push(
    `   Booking: ${bookingText}`
  );

  lines.push(
    `   Current: ${currentText}`
  );

  if (coach || berth) {

    let seatInfo = "";

    if (coach) {
      seatInfo += safeText(coach);
    }

    if (berth) {

      if (seatInfo) {
        seatInfo += " • ";
      }

      seatInfo += `Berth ${safeText(berth)}`;
    }

    if (berthType) {

      seatInfo +=
        ` (${safeText(berthType)})`;
    }

    lines.push(
      `   Seat: ${seatInfo}`
    );

  }

  return lines.join("\n");

}

/* =========================================
   FORMAT PNR RESPONSE
========================================= */

function formatPNRResponse(apiResponse, pnr) {

  const root =
    apiResponse?.data?.data ??
    apiResponse?.data ??
    apiResponse;

  const pnrNumber =
    findValue(
      root,
      [
        "pnrNumber",
        "pnr",
        "pnrNo"
      ]
    ) || pnr;

  const trainNumber =
    findValue(
      root,
      [
        "trainNumber",
        "trainNo"
      ]
    );

  const trainName =
    findValue(
      root,
      [
        "trainName"
      ]
    );

  const from =
    findValue(
      root,
      [
        "from",
        "source",
        "origin",
        "boardingStation"
      ]
    );

  const to =
    findValue(
      root,
      [
        "to",
        "destination",
        "dest",
        "reservationUpto"
      ]
    );

  const journeyDate =
    findValue(
      root,
      [
        "journeyDate",
        "date",
        "boardingDate"
      ]
    );

  const journeyClass =
    findValue(
      root,
      [
        "class",
        "classCode",
        "travelClass"
      ]
    );

  const quota =
    findValue(
      root,
      [
        "quota",
        "quotaCode"
      ]
    );

  const fare =
    findValue(
      root,
      [
        "fare",
        "totalFare",
        "amount"
      ]
    );

  const chartStatus =
    findValue(
      root,
      [
        "chartStatus",
        "chartPrepared",
        "chartPreparationStatus"
      ]
    );

  const passengers =
    findPassengers(root);

  const lines = [];

  lines.push("🎫 *PNR STATUS*");
  lines.push("");
  lines.push(`🔢 PNR: *${safeText(pnrNumber)}*`);

  if (trainNumber || trainName) {

    let trainLine = "🚆 ";

    if (trainNumber) {
      trainLine += safeText(trainNumber);
    }

    if (trainName) {

      if (trainNumber) {
        trainLine += " • ";
      }

      trainLine += safeText(trainName);
    }

    lines.push(trainLine);
  }

  if (from || to) {

    lines.push(
      `📍 ${safeText(from) || "N/A"} → ${safeText(to) || "N/A"}`
    );

  }

  if (journeyDate) {

    lines.push(
      `📅 Journey: ${safeText(journeyDate)}`
    );

  }

  if (journeyClass) {

    lines.push(
      `💺 Class: ${safeText(journeyClass)}`
    );

  }

  if (quota) {

    lines.push(
      `🎟️ Quota: ${safeText(quota)}`
    );

  }

  if (fare !== null && fare !== undefined) {

    lines.push(
      `💰 Fare: ₹${safeText(fare)}`
    );

  }

  if (chartStatus !== null && chartStatus !== undefined) {

    lines.push(
      `📋 Chart: ${safeText(chartStatus)}`
    );

  }

  if (
    Array.isArray(passengers) &&
    passengers.length > 0
  ) {

    lines.push("");
    lines.push(
      `👤 *PASSENGER STATUS (${passengers.length})*`
    );

    lines.push("");

    passengers.forEach((passenger, index) => {

      lines.push(
        formatPassengerStatus(
          passenger,
          index + 1
        )
      );

      if (index < passengers.length - 1) {
        lines.push("");
      }

    });

  } else {

    lines.push("");
    lines.push(
      "👤 Passenger details are currently unavailable."
    );

  }

  lines.push("");
  lines.push(
    "ℹ️ Current status may change until chart preparation."
  );

  return lines.join("\n");

}

/* =========================================
   GET PNR STATUS
========================================= */

async function getPNRStatus(pnr) {

  if (!RAILRADAR_API_KEY) {

    throw new Error(
      "RAILRADAR_API_KEY is missing"
    );

  }

  const url =
    `https://api.railradar.in/v1/pnr/${pnr}`;

  console.log(
    "PNR API REQUEST:",
    pnr
  );

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

  console.log(
    "PNR API RESPONSE RECEIVED"
  );

  return response.data;

}

/* =========================================
   PNR ERROR MESSAGE
========================================= */

function getPNRErrorMessage(error) {

  const status =
    error?.response?.status;

  const apiError =
    error?.response?.data?.error;

  if (status === 401) {

    return (
      "⚠️ PNR service authentication error.\n\n" +
      "Railway API keyটি ঠিক আছে কি না পরীক্ষা করুন।"
    );

  }

  if (status === 404) {

    return (
      "❌ এই PNR নম্বরের কোনো তথ্য পাওয়া যায়নি।\n\n" +
      "দয়া করে ১০ সংখ্যার PNR নম্বরটি আবার পাঠান।"
    );

  }

  if (status === 429) {

    return (
      "⏳ এই মুহূর্তে PNR service-এর request limit পূর্ণ হয়েছে।\n\n" +
      "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );

  }

  if (status === 503) {

    return (
      "⚠️ Railway data service এই মুহূর্তে সাময়িকভাবে unavailable।\n\n" +
      "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );

  }

  if (apiError?.message) {

    console.error(
      "PNR API ERROR:",
      apiError
    );

  }

  console.error(
    "PNR ERROR:",
    error?.response?.data ||
    error?.message ||
    error
  );

  return (
    "❌ PNR status এখন পাওয়া যাচ্ছে না।\n\n" +
    "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
  );

}

/* =========================================
   GEMINI AI
========================================= */

async function generateAIReply(userMessage) {

  if (!ai) {

    return (
      "দুঃখিত, AI service বর্তমানে configured নেই।"
    );

  }

  try {

    const systemInstruction = `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ:
- ভারতীয় রেল
- Sealdah Division
- train information
- station information
- route guidance
- railway general information

নিয়ম:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly হবে।
4. "হ্যালো", "হাই", "Hello" সুন্দরভাবে উত্তর দেবে।
5. 10-digit PNR থাকলে PNR status নিজে থেকে বানাবে না।
6. PNR status application code থেকে আসে।
7. Live train data না থাকলে কখনো সময় বা location বানিয়ে বলবে না।
8. নিশ্চিত তথ্য না থাকলে পরিষ্কারভাবে বলবে যে live data যাচাই করা প্রয়োজন।
9. অপ্রয়োজনীয় দীর্ঘ উত্তর দেবে না।
10. Railway information-এ ভুল তথ্য তৈরি করবে না।

উদাহরণ:

User:
হ্যালো

Answer:
নমস্কার! 🚆
Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম।
কী জানতে চান?

User:
PNR 6508967728

Answer:
PNR status check করা হচ্ছে...
`;

    const response =
      await ai.models.generateContent({

        model:
          "gemini-3.5-flash-lite",

        contents:
          userMessage,

        config: {

          systemInstruction,

          temperature: 0.2,

          maxOutputTokens: 500

        }

      });

    const reply =
      response.text ||
      "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না।";

    return reply.trim();

  } catch (error) {

    console.error(
      "Gemini Error:",
      error?.message ||
      error
    );

    return (
      "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে।\n" +
      "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );

  }

}

/* =========================================
   WHATSAPP WEBHOOK
========================================= */

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

    /* =====================================
       TEXT ONLY
    ===================================== */

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

    /* =====================================
       PNR DETECTION
    ===================================== */

    const pnr =
      extractPNR(userMessage);

    if (pnr) {

      console.log(
        "PNR DETECTED:",
        pnr
      );

      try {

        const pnrData =
          await getPNRStatus(pnr);

        const reply =
          formatPNRResponse(
            pnrData,
            pnr
          );

        console.log(
          "PNR FINAL REPLY:",
          reply
        );

        await sendWhatsAppMessage(
          from,
          reply
        );

      } catch (error) {

        const errorReply =
          getPNRErrorMessage(error);

        await sendWhatsAppMessage(
          from,
          errorReply
        );

      }

      console.log(
        "PNR reply completed for:",
        from
      );

      console.log(
        "=========================================="
      );

      return;

    }

    /* =====================================
       NORMAL AI QUESTION
    ===================================== */

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

  } catch (error) {

    console.error(
      "Webhook Error:",
      error?.response?.data ||
      error?.message ||
      error
    );

  }

});

/* =========================================
   START SERVER
========================================= */

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
