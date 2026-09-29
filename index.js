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

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Sealdah Train Service AI Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>

      <body style="
        margin:0;
        background:#0b0f19;
        color:#ffffff;
        font-family:Arial,sans-serif;
        text-align:center;
      ">

        <div style="
          max-width:900px;
          margin:80px auto;
          padding:40px;
        ">

          <h1 style="font-size:34px;">
            🚆 Sealdah Train Service AI Bot
          </h1>

          <p style="color:#9ca3af;font-size:18px;">
            WhatsApp: Connected
          </p>

          <p style="color:#9ca3af;font-size:18px;">
            AI: Gemini
          </p>

          <p style="color:#9ca3af;font-size:18px;">
            Railway Data: AI Assistant
          </p>

          <p style="
            color:#22c55e;
            font-size:20px;
            font-weight:bold;
          ">
            ● Status: Online
          </p>

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
    whatsapp: "connected",
    ai: "Gemini",
    railwayData: "RailRadar"
  });

});


/* =========================================================
   PRIVACY
========================================================= */

app.get("/privacy", (req, res) => {

  res.send(`
    <html>

      <head>
        <title>Privacy Policy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>

      <body style="
        font-family:Arial,sans-serif;
        padding:30px;
        line-height:1.6;
      ">

        <h1>Privacy Policy</h1>

        <p>
          This WhatsApp AI Bot processes messages only to provide
          automated railway information and assistance.
        </p>

        <p>
          Messages are processed for providing the requested service.
        </p>

        <p>
          Railway information may be obtained from third-party
          railway data services.
        </p>

      </body>

    </html>
  `);

});


/* =========================================================
   WHATSAPP WEBHOOK VERIFY
========================================================= */

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


/* =========================================================
   SEND WHATSAPP MESSAGE
========================================================= */

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

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data ||
      error.message
    );

  }

}


/* =========================================================
   SAFE VALUE HELPER
   Prevents [object Object]
========================================================= */

function safeText(value, fallback = "") {

  if (value === null || value === undefined) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value);
  }

  if (typeof value === "object") {

    if (value.label) {
      return String(value.label);
    }

    if (value.name) {
      return String(value.name);
    }

    if (value.code) {
      return String(value.code);
    }

    if (value.status) {
      return String(value.status);
    }

    if (value.value) {
      return String(value.value);
    }

    return "";
  }

  return String(value);

}


/* =========================================================
   PNR STATUS
========================================================= */

async function getPNRStatus(pnr) {

  try {

    if (!RAILRADAR_API_KEY) {

      console.error(
        "RAILRADAR_API_KEY is missing"
      );

      return {
        success: false,
        message:
          "Railway service configuration missing."
      };

    }


    const url =
      `https://api.railradar.in/v1/pnr/${pnr}`;


    console.log(
      "PNR API REQUEST:",
      url
    );


    const response = await axios.get(

      url,

      {
        headers: {
          Authorization:
            `Bearer ${RAILRADAR_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        timeout: 15000
      }

    );


    const result = response.data;


    console.log(
      "PNR API SUCCESS"
    );


    if (
      !result ||
      result.success !== true ||
      !result.data
    ) {

      return {
        success: false,
        message:
          "PNR information পাওয়া যায়নি।"
      };

    }


    return {
      success: true,
      data: result.data
    };


  } catch (error) {

    console.error(
      "PNR API ERROR:",
      error.response?.data ||
      error.message
    );


    const status =
      error.response?.status;


    if (status === 401) {

      return {
        success: false,
        message:
          "Railway API key সঠিক নয়।"
      };

    }


    if (status === 404) {

      return {
        success: false,
        message:
          "এই PNR-এর তথ্য পাওয়া যায়নি। PNR নম্বরটি আবার পরীক্ষা করুন।"
      };

    }


    if (status === 429) {

      return {
        success: false,
        message:
          "Railway service-এর request limit আপাতত পূর্ণ হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।"
      };

    }


    if (status === 503) {

      return {
        success: false,
        message:
          "Railway service আপাতত unavailable। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
      };

    }


    return {
      success: false,
      message:
        "PNR status এখন পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    };

  }

}


/* =========================================================
   FORMAT PNR RESPONSE
   Professional WhatsApp format
========================================================= */

function formatPNRStatus(data) {

  const pnr =
    safeText(
      data.pnrNumber,
      "Unknown"
    );


  const train =
    data.train || {};


  const journey =
    data.journey || {};


  const charting =
    data.charting || {};


  const source =
    train.source || {};


  const destination =
    train.destination || {};


  const boardingPoint =
    train.boardingPoint || {};


  const reservationUpto =
    train.reservationUpto || {};


  let message = "";


  message +=
    `🎫 *PNR STATUS*\n`;

  message +=
    `━━━━━━━━━━━━━━━━━━\n\n`;


  message +=
    `🔢 *PNR:* ${pnr}\n\n`;


  /* TRAIN */

  const trainNumber =
    safeText(
      train.number,
      ""
    );

  const trainName =
    safeText(
      train.name,
      ""
    );


  if (
    trainNumber ||
    trainName
  ) {

    message +=
      `🚆 *Train:* `;

    if (trainNumber) {
      message += trainNumber;
    }

    if (
      trainNumber &&
      trainName
    ) {
      message += " - ";
    }

    if (trainName) {
      message += trainName;
    }

    message += "\n";

  }


  /* ROUTE */

  const sourceName =
    safeText(
      source.name,
      safeText(
        source.code,
        ""
      )
    );


  const destinationName =
    safeText(
      destination.name,
      safeText(
        destination.code,
        ""
      )
    );


  if (
    sourceName ||
    destinationName
  ) {

    message +=
      `🛤️ *Route:* ${sourceName} → ${destinationName}\n`;

  }


  /* JOURNEY DATE */

  const journeyDate =
    safeText(
      journey.date,
      ""
    );


  if (journeyDate) {

    message +=
      `📅 *Journey:* ${journeyDate}\n`;

  }


  /* CLASS */

  const className =
    safeText(
      journey.class,
      ""
    );


  if (className) {

    message +=
      `💺 *Class:* ${className}\n`;

  }


  /* QUOTA */

  const quota =
    safeText(
      journey.quota,
      ""
    );


  if (quota) {

    message +=
      `🎟️ *Quota:* ${quota}\n`;

  }


  /* FARE */

  const fare =
    safeText(
      journey.bookingFare,
      ""
    );


  if (fare) {

    message +=
      `💰 *Fare:* ₹${fare}\n`;

  }


  /* BOARDING */

  const boardingName =
    safeText(
      boardingPoint.name,
      safeText(
        boardingPoint.code,
        ""
      )
    );


  if (boardingName) {

    message +=
      `🚉 *Boarding:* ${boardingName}\n`;

  }


  /* RESERVATION UPTO */

  const reservationName =
    safeText(
      reservationUpto.name,
      safeText(
        reservationUpto.code,
        ""
      )
    );


  if (reservationName) {

    message +=
      `🏁 *Reserved Upto:* ${reservationName}\n`;

  }


  message +=
    `\n👤 *PASSENGER STATUS*\n`;

  message +=
    `━━━━━━━━━━━━━━━━━━\n`;


  const passengers =
    Array.isArray(data.passengers)
      ? data.passengers
      : [];


  if (passengers.length === 0) {

    message +=
      `No passenger information available.\n`;

  }


  passengers.forEach(
    (passenger, index) => {

      const passengerNumber =
        safeText(
          passenger.passengerNumber,
          index + 1
        );


      const bookingStatus =
        safeText(
          passenger.bookingStatus,
          "N/A"
        );


      const currentStatus =
        safeText(
          passenger.currentStatus,
          "N/A"
        );


      const coach =
        safeText(
          passenger.coach,
          ""
        );


      const berthNumber =
        safeText(
          passenger.berthNumber,
          ""
        );


      const berthCode =
        safeText(
          passenger.berthCode,
          ""
        );


      let currentDisplay =
        currentStatus;


      /*
        If confirmed and coach/berth exists,
        show professional format.
      */

      if (
        coach &&
        berthNumber
      ) {

        currentDisplay =
          `${currentStatus} • ${coach} • Berth ${berthNumber}`;

        if (berthCode) {

          currentDisplay +=
            ` (${berthCode})`;

        }

      }


      message +=
        `\n${passengerNumber}. *Booking:* ${bookingStatus}\n`;

      message +=
        `   *Current:* ${currentDisplay}\n`;


      if (
        passenger.isConfirmed === true
      ) {

        message +=
          `   🟢 Confirmed\n`;

      } else if (
        passenger.isRAC === true
      ) {

        message +=
          `   🟡 RAC\n`;

      } else if (
        passenger.isWaitlisted === true
      ) {

        message +=
          `   🟠 Waitlisted\n`;

      } else if (
        passenger.isCancelled === true
      ) {

        message +=
          `   🔴 Cancelled\n`;

      }

    }
  );


  /* CHART STATUS */

  const chartStatus =
    safeText(
      charting.status,
      ""
    );


  if (chartStatus) {

    message +=
      `\n📋 *Chart:* ${chartStatus}\n`;

  }


  message +=
    `\n━━━━━━━━━━━━━━━━━━\n`;

  message +=
    `🚆 *Sealdah Train Service*`;


  return message.trim();

}


/* =========================================================
   DETECT PNR
========================================================= */

function detectPNR(message) {

  if (!message) {
    return null;
  }


  /*
     Exact 10 digit PNR
  */

  const match =
    message.match(
      /\b\d{10}\b/
    );


  if (!match) {
    return null;
  }


  const pnr =
    match[0];


  /*
     Only treat as PNR when the message
     contains PNR-related wording OR
     the message is exactly a 10-digit number.
  */

  const lower =
    message.toLowerCase();


  const pnrWords = [
    "pnr",
    "পিএনআর",
    "pnr status",
    "pnr status",
    "passenger status"
  ];


  const isPNRMessage =
    pnrWords.some(
      word =>
        lower.includes(word)
    ) ||
    /^\d{10}$/.test(
      message.trim()
    );


  if (!isPNRMessage) {
    return null;
  }


  return pnr;

}


/* =========================================================
   GEMINI AI
========================================================= */

async function generateAIReply(userMessage) {

  try {

    const systemInstruction = `

তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ হলো ভারতীয় রেলের বিশেষ করে Sealdah Division-এর
ট্রেন সংক্রান্ত প্রশ্নে ব্যবহারকারীকে সহজ ভাষায় সাহায্য করা।

নিয়ম:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ব্যবহারকারী ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. উত্তর ছোট এবং WhatsApp-friendly রাখবে।
4. "হ্যালো", "হাই", "Hello" ইত্যাদির সুন্দরভাবে উত্তর দেবে।
5. ব্যবহারকারী ট্রেন সম্পর্কে প্রশ্ন করলে প্রশ্নটি বুঝবে।
6. Source ও destination বুঝবে।
7. আজ, কাল, তারিখ ইত্যাদি বুঝবে।
8. Train number থাকলে বুঝবে।
9. Live train location সম্পর্কে নিশ্চিত data না থাকলে বানিয়ে বলবে না।
10. কোনো নির্দিষ্ট train time নিশ্চিত না হলে বানিয়ে বলবে না।
11. সাধারণ railway information দিতে পারবে।
12. অপ্রয়োজনীয় প্রশ্ন করবে না।
13. উত্তর পরিষ্কার, সংক্ষিপ্ত এবং professional হবে।

User: হ্যালো

Answer:
নমস্কার! 🚆 Sealdah Train Service AI Bot-এ আপনাকে স্বাগতম।
কী জানতে চান?

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

          temperature:
            0.2,

          maxOutputTokens:
            500

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
      "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। " +
      "কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );

  }

}


/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {

  /*
     Immediately acknowledge WhatsApp
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
       PNR DETECTION
       PNR goes directly to RailRadar.
       Gemini is NOT used for PNR.
    ===================================================== */

    const pnr =
      detectPNR(
        userMessage
      );


    if (pnr) {

      console.log(
        "PNR DETECTED:",
        pnr
      );


      const pnrResult =
        await getPNRStatus(
          pnr
        );


      let reply;


      if (
        pnrResult.success
      ) {

        reply =
          formatPNRStatus(
            pnrResult.data
          );

      } else {

        reply =
          `🎫 *PNR STATUS*\n\n` +
          `PNR: *${pnr}*\n\n` +
          `⚠️ ${pnrResult.message}`;

      }


      console.log(
        "FINAL PNR REPLY:",
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
        "PNR Reply completed for:",
        from
      );


      console.log(
        "=========================================="
      );


      return;

    }


    /* =====================================================
       NORMAL AI MESSAGE
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
