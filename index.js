require("dotenv").config();

const express = require("express");
const axios = require("axios");
const Groq = require("groq-sdk");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

/*
========================================
GROQ
========================================
*/

const groq = new Groq({
  apiKey: GROQ_API_KEY
});

/*
========================================
STATION DATABASE
========================================
*/

const STATIONS = {
  "শান্তিপুর": "STB",
  "শান্তিপুর জংশন": "STB",
  "santipur": "STB",
  "santipur junction": "STB",

  "শিয়ালদহ": "SDAH",
  "শিয়ালদা": "SDAH",
  "sealdah": "SDAH",

  "কলকাতা": "KOAA",
  "কলকাতা টার্মিনাল": "KOAA",
  "kolkata": "KOAA",

  "নৈহাটি": "NH",
  "naihati": "NH",

  "রানাঘাট": "RHA",
  "ranaghat": "RHA",

  "কৃষ্ণনগর": "KNJ",
  "krishnanagar": "KNJ",

  "কল্যাণী": "KYI",
  "kalyani": "KYI",

  "বারাসাত": "BT",
  "barasat": "BT"
};

/*
========================================
HOME
========================================
*/

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Sealdah Train Service AI Bot</title>
      </head>
      <body>
        <h1>🚆 Sealdah Train Service AI Bot</h1>
        <p>Bot is running successfully.</p>
        <p>WhatsApp Webhook: /webhook</p>
        <p>Health Check: /api</p>
      </body>
    </html>
  `);
});

/*
========================================
HEALTH CHECK
========================================
*/

app.get("/api", (req, res) => {
  res.json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    whatsapp: PHONE_NUMBER_ID ? "connected" : "missing",
    groq: GROQ_API_KEY ? "connected" : "missing"
  });
});

/*
========================================
PRIVACY
========================================
*/

app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy</title>
      </head>
      <body>
        <h1>Sealdah Train Service AI Bot</h1>

        <p>
        This WhatsApp bot processes messages only for providing
        railway information and automated assistance.
        </p>

        <p>
        Messages are processed through the configured AI and
        railway information services.
        </p>
      </body>
    </html>
  `);
});

/*
========================================
WHATSAPP WEBHOOK VERIFY
========================================
*/

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request");

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

/*
========================================
SEND WHATSAPP MESSAGE
========================================
*/

async function sendWhatsAppMessage(to, text) {

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

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
      to
    );

  } catch (error) {

    console.error(
      "WhatsApp Send Error:",
      error.response?.data ||
      error.message
    );
  }
}

/*
========================================
FIND STATION CODE
========================================
*/

function findStationCode(text) {

  const lower =
    text.toLowerCase().trim();

  for (const name of Object.keys(STATIONS)) {

    if (lower.includes(name.toLowerCase())) {

      return STATIONS[name];
    }
  }

  return null;
}

/*
========================================
FIND SOURCE + DESTINATION
========================================
*/

function detectRoute(text) {

  const normalized =
    text
      .replace(/থেকে/g, " থেকে ")
      .replace(/যাওয়ার/g, " যাওয়ার ");

  const words =
    normalized.split(/\s+/);

  let source = null;
  let destination = null;

  const fromIndex =
    words.findIndex(
      word =>
        word === "থেকে"
    );

  if (fromIndex > 0) {

    const sourceText =
      words
        .slice(
          Math.max(0, fromIndex - 3),
          fromIndex
        )
        .join(" ");

    source =
      findStationCode(
        sourceText
      );
  }

  const toIndex =
    words.findIndex(
      word =>
        word === "দিকে" ||
        word === "যাওয়ার" ||
        word === "যাওয়ার"
    );

  if (toIndex > 0) {

    const destText =
      words
        .slice(
          toIndex + 1,
          toIndex + 4
        )
        .join(" ");

    destination =
      findStationCode(
        destText
      );
  }

  /*
  Direct known route detection
  */

  if (
    text.includes("শান্তিপুর") &&
    (
      text.includes("শিয়ালদহ") ||
      text.includes("শিয়ালদা")
    )
  ) {

    source = "STB";
    destination = "SDAH";
  }

  if (
    text.toLowerCase().includes("santipur") &&
    text.toLowerCase().includes("sealdah")
  ) {

    source = "STB";
    destination = "SDAH";
  }

  return {
    source,
    destination
  };
}

/*
========================================
RAILWAY API
========================================

If you have a Railway API provider,
put the API details in Render Environment.

Required:

RAIL_API_URL
RAIL_API_KEY

The bot will call the API only when
both are available.
========================================
*/

async function getTrainsBetweenStations(
  source,
  destination,
  date
) {

  if (
    !process.env.RAIL_API_URL ||
    !process.env.RAIL_API_KEY
  ) {

    console.log(
      "Railway API not configured."
    );

    return null;
  }

  try {

    const response =
      await axios.get(
        process.env.RAIL_API_URL,
        {
          params: {
            source: source,
            destination: destination,
            date: date
          },

          headers: {
            Authorization:
              `Bearer ${process.env.RAIL_API_KEY}`,

            "X-API-Key":
              process.env.RAIL_API_KEY
          },

          timeout: 15000
        }
      );

    console.log(
      "Railway API response received"
    );

    return response.data;

  } catch (error) {

    console.error(
      "Railway API Error:",
      error.response?.data ||
      error.message
    );

    return null;
  }
}

/*
========================================
FORMAT RAILWAY DATA
========================================
*/

function formatTrainData(data) {

  if (!data) {
    return null;
  }

  try {

    let trains = [];

    if (Array.isArray(data)) {
      trains = data;
    }

    else if (Array.isArray(data.trains)) {
      trains = data.trains;
    }

    else if (
      data.data &&
      Array.isArray(data.data.trains)
    ) {
      trains = data.data.trains;
    }

    if (trains.length === 0) {
      return null;
    }

    let result =
      "🚆 ট্রেনের তথ্য\n\n";

    trains
      .slice(0, 20)
      .forEach((train, index) => {

        const number =
          train.trainNumber ||
          train.TrainNo ||
          train.number ||
          "";

        const name =
          train.trainName ||
          train.TrainName ||
          train.name ||
          "";

        const departure =
          train.departureTime ||
          train.DepartureTime ||
          train.departure ||
          "";

        const arrival =
          train.arrivalTime ||
          train.ArrivalTime ||
          train.arrival ||
          "";

        result +=
          `${index + 1}. ${number} ${name}\n`;

        if (departure) {
          result +=
            `   ছাড়বে: ${departure}\n`;
        }

        if (arrival) {
          result +=
            `   পৌঁছাবে: ${arrival}\n`;
        }

        result += "\n";
      });

    return result;

  } catch (error) {

    console.error(
      "Format Error:",
      error
    );

    return null;
  }
}

/*
========================================
AI RESPONSE
========================================
*/

async function generateAIReply(
  userMessage,
  railwayData = null
) {

  try {

    let railwayContext = "";

    if (railwayData) {

      railwayContext = `

RAILWAY DATA:

${JSON.stringify(
  railwayData,
  null,
  2
)}

IMPORTANT:
Use the railway data above.
Do not invent train numbers,
times or running status.
`;
    }

    const completion =
      await groq.chat.completions.create({

        model:
          "openai/gpt-oss-20b",

        temperature:
          0.1,

        max_tokens:
          900,

        messages: [

          {
            role: "system",

            content: `

তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ:

1. বাংলা প্রশ্নের উত্তর বাংলায় দেবে।
2. ইংরেজি প্রশ্নের উত্তর ইংরেজিতে দেবে।
3. ট্রেন, স্টেশন, route এবং railway information বুঝবে।
4. ব্যবহারকারী source ও destination দিলে সেটি বুঝবে।
5. Railway API data দেওয়া থাকলে শুধুমাত্র সেই data ব্যবহার করবে।
6. Railway API data না থাকলে কোনো train number বা exact time বানিয়ে বলবে না।
7. Live status আছে বলে মিথ্যা দাবি করবে না।
8. উত্তর WhatsApp-friendly হবে।
9. অপ্রয়োজনীয় বড় উত্তর দেবে না।
10. সময় 24-hour বা পরিষ্কার বাংলা format-এ দেখাবে।

উদাহরণ:

User:
শান্তিপুর থেকে শিয়ালদা যাওয়ার

তুমি বলবে:

"অবশ্যই 🚆
শান্তিপুর থেকে শিয়ালদা ট্রেনের তথ্য দিতে পারি।
আপনি কোন তারিখের এবং কোন সময়ের পরের ট্রেন চান?"

যদি user বলে:

"আজ ১২টার পর"

তাহলে railway data available থাকলে সেই data থেকে
১২টার পরের trains দেখাবে।

${railwayContext}
`
          },

          {
            role: "user",

            content:
              userMessage
          }

        ]
      });

    return (
      completion
        .choices?.[0]
        ?.message
        ?.content ||

      "দুঃখিত, এই মুহূর্তে উত্তর দেওয়া যাচ্ছে না।"
    );

  } catch (error) {

    console.error(
      "Groq Error:",
      error.response?.data ||
      error.message ||
      error
    );

    return (
      "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );
  }
}

/*
========================================
WHATSAPP WEBHOOK
========================================
*/

app.post(
  "/webhook",
  async (req, res) => {

    console.log(
      "========== NEW WHATSAPP WEBHOOK =========="
    );

    /*
    IMPORTANT:
    Reply immediately to WhatsApp.
    */

    res.sendStatus(200);

    try {

      const entry =
        req.body?.entry?.[0];

      const change =
        entry?.changes?.[0];

      const value =
        change?.value;

      const messages =
        value?.messages;

      /*
      Ignore status updates
      */

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

      /*
      ========================================
      ACTUAL USER NUMBER
      ========================================
      */

      const from =
        message.from;

      /*
      BUSINESS NUMBER
      ========================================
      */

      const businessPhoneNumberId =
        value?.metadata?.phone_number_id;

      console.log(
        "ACTUAL SENDER NUMBER:",
        from
      );

      console.log(
        "BUSINESS PHONE NUMBER ID:",
        businessPhoneNumberId
      );

      /*
      ========================================
      TEXT ONLY
      ========================================
      */

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
        message
          .text
          ?.body
          ?.trim();

      if (!userMessage) {
        return;
      }

      console.log(
        "USER MESSAGE:",
        userMessage
      );

      /*
      ========================================
      ROUTE DETECTION
      ========================================
      */

      const route =
        detectRoute(
          userMessage
        );

      console.log(
        "DETECTED SOURCE:",
        route.source
      );

      console.log(
        "DETECTED DESTINATION:",
        route.destination
      );

      /*
      ========================================
      DATE
      ========================================
      */

      const today =
        new Date()
          .toISOString()
          .split("T")[0];

      /*
      ========================================
      RAILWAY DATA
      ========================================
      */

      let railwayData = null;

      if (
        route.source &&
        route.destination
      ) {

        railwayData =
          await getTrainsBetweenStations(
            route.source,
            route.destination,
            today
          );
      }

      /*
      ========================================
      AI
      ========================================
      */

      const reply =
        await generateAIReply(
          userMessage,
          railwayData
        );

      console.log(
        "AI REPLY:",
        reply
      );

      /*
      ========================================
      SEND TO SAME USER
      ========================================
      */

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
        error.response?.data ||
        error.message ||
        error
      );
    }
  }
);

/*
========================================
START SERVER
========================================
*/

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
      "AI: Groq"
    );

    console.log(
      "Model: openai/gpt-oss-20b"
    );

    console.log(
      "Groq API Key:",
      GROQ_API_KEY
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
      "Railway API:",
      process.env.RAIL_API_URL
        ? "CONFIGURED"
        : "NOT CONFIGURED"
    );

    console.log(
      "================================"
    );
  }
);

