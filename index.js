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

const RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY || "";

const groq = new Groq({
  apiKey: GROQ_API_KEY
});

/*
==================================================
HOME
==================================================
*/

app.get("/", (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sealdah Train Service AI Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 50px 20px;
          background: #f5f5f5;
        }
        .box {
          max-width: 600px;
          margin: auto;
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 5px 20px rgba(0,0,0,.1);
        }
        h1 {
          color: #075e54;
        }
        .ok {
          color: green;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>🚆 Sealdah Train Service AI Bot</h1>
        <p class="ok">● Server Online</p>
        <p>WhatsApp AI Assistant is running.</p>
        <p>Created by SumanMusix</p>
      </div>
    </body>
    </html>
  `);
});

/*
==================================================
HEALTH CHECK
==================================================
*/

app.get("/api", (req, res) => {
  res.json({
    status: "online",
    service: "Sealdah Train Service AI Bot",
    ai: "Groq",
    model: "openai/gpt-oss-20b",
    whatsapp: WHATSAPP_TOKEN ? "connected" : "missing",
    phone_number_id: PHONE_NUMBER_ID ? "connected" : "missing",
    rail_api: RAILRADAR_API_KEY ? "connected" : "not_configured"
  });
});

/*
==================================================
PRIVACY
==================================================
*/

app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy</title>
      </head>
      <body style="font-family:Arial;padding:30px">
        <h1>Privacy Policy</h1>
        <p>
          Sealdah Train Service AI Bot processes WhatsApp messages
          to provide automated railway information and assistance.
        </p>
        <p>
          Messages are processed only for providing the requested service.
        </p>
      </body>
    </html>
  `);
});

/*
==================================================
WHATSAPP WEBHOOK VERIFICATION
==================================================
*/

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request received");

  if (
    mode === "subscribe" &&
    token &&
    VERIFY_TOKEN &&
    token === VERIFY_TOKEN
  ) {
    console.log("WhatsApp Webhook Verified");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");

  return res.sendStatus(403);
});

/*
==================================================
SEND WHATSAPP MESSAGE
==================================================

IMPORTANT:

to = SAME WhatsApp user who sent the message.

We NEVER use the test number here.

==================================================
*/

async function sendWhatsAppMessage(to, text) {

  if (!to) {
    console.error("No recipient number received.");
    return;
  }

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("WhatsApp credentials missing.");
    return;
  }

  try {

    const url =
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    console.log("Sending WhatsApp reply to:", to);

    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(to),
        type: "text",
        text: {
          preview_url: false,
          body: String(text).substring(0, 4096)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
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

/*
==================================================
RAILRADAR API
==================================================
*/

async function getTrainsBetweenStations(from, to, date = "") {

  if (!RAILRADAR_API_KEY) {
    return null;
  }

  try {

    let url =
      `https://api.railradar.in/v1/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;

    const params = {};

    if (date) {
      params.date = date;
    }

    params.live = "true";

    const response = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${RAILRADAR_API_KEY}`
      },
      timeout: 20000
    });

    return response.data;

  } catch (error) {

    console.error(
      "RailRadar Error:",
      error.response?.data || error.message
    );

    return null;
  }
}

/*
==================================================
LIVE TRAIN STATUS
==================================================
*/

async function getLiveTrainStatus(trainNumber, date = "") {

  if (!RAILRADAR_API_KEY) {
    return null;
  }

  try {

    let url =
      `https://api.railradar.in/v1/trains/${encodeURIComponent(trainNumber)}/live`;

    const params = {
      authoritative: "true"
    };

    if (date) {
      params.date = date;
    }

    const response = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${RAILRADAR_API_KEY}`
      },
      timeout: 20000
    });

    return response.data;

  } catch (error) {

    console.error(
      "Live Train API Error:",
      error.response?.data || error.message
    );

    return null;
  }
}

/*
==================================================
FORMAT RAILWAY DATA
==================================================
*/

function formatRailData(data) {

  if (!data) {
    return "";
  }

  try {

    return JSON.stringify(data).substring(0, 12000);

  } catch (error) {

    return "";
  }
}

/*
==================================================
AI RESPONSE
==================================================
*/

async function generateAIReply(userMessage, railwayData = "") {

  try {

    const systemPrompt = `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ:

1. ব্যবহারকারীর প্রশ্ন বুঝে সহজ বাংলা ভাষায় উত্তর দেবে।
2. ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দেবে।
3. বাংলা ও ইংরেজি মিশিয়ে প্রশ্ন করলে সহজ Bengali-English WhatsApp style ব্যবহার করতে পারো।
4. Indian Railways এবং Sealdah Division সম্পর্কিত railway information দিতে সাহায্য করবে।
5. Train number, train name, source, destination, station, arrival time, departure time, journey date এবং live status বুঝবে।
6. Source এবং destination দেওয়া হলে available train information পরিষ্কারভাবে দেখাবে।
7. Railway API থেকে data পাওয়া গেলে সেই data-কে priority দেবে।
8. Railway API data পাওয়া না গেলে live timing বা delay নিজের থেকে বানাবে না।
9. কোনো train timing নিশ্চিত না হলে সেটা স্পষ্টভাবে বলবে।
10. উত্তর ছোট, পরিষ্কার এবং WhatsApp-friendly রাখবে।
11. প্রয়োজন হলে user-কে train number বা journey date দিতে বলবে।
12. ব্যবহারকারী শুধু "Hi", "Hello", "হাই" বললে সংক্ষেপে Bot-এর কাজগুলো জানাবে।

খুব গুরুত্বপূর্ণ:

- কোনো live railway data বানিয়ে বলবে না।
- API data না থাকলে অনুমান করে exact time বলবে না।
- ব্যবহারকারীকে ভুল তথ্য দেবে না।
- Railway data-এর বাইরে সাধারণ প্রশ্ন হলে সাধারণ AI assistant হিসেবে সাহায্য করবে।

Bot Name:
Sealdah Train Service AI Bot

Brand:
SumanMusix
`;

    let messages = [
      {
        role: "system",
        content: systemPrompt
      }
    ];

    if (railwayData) {

      messages.push({
        role: "system",
        content:
          "Railway API থেকে পাওয়া বর্তমান data নিচে দেওয়া হলো। উত্তর দেওয়ার সময় এই data ব্যবহার করো:\n\n" +
          railwayData
      });

    }

    messages.push({
      role: "user",
      content: userMessage
    });

    const completion =
      await groq.chat.completions.create({

        model: "openai/gpt-oss-20b",

        temperature: 0.2,

        max_tokens: 900,

        messages
      });

    return (
      completion.choices?.[0]?.message?.content ||
      "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না।"
    );

  } catch (error) {

    console.error(
      "Groq Error:",
      error.response?.data || error.message
    );

    return "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  }
}

/*
==================================================
MESSAGE TYPE HELPERS
==================================================
*/

function extractTrainNumber(text) {

  const match = String(text).match(/\b\d{5}\b/);

  return match ? match[0] : null;
}

/*
==================================================
INCOMING WHATSAPP WEBHOOK
==================================================
*/

app.post("/webhook", async (req, res) => {

  /*
  IMPORTANT:
  Respond immediately to Meta.
  */

  res.sendStatus(200);

  try {

    console.log(
      "========== NEW WHATSAPP WEBHOOK =========="
    );

    console.log(
      "Webhook body:",
      JSON.stringify(req.body)
    );

    const entry =
      req.body?.entry?.[0];

    const changes =
      entry?.changes?.[0];

    const value =
      changes?.value;

    /*
    Ignore status notifications
    */

    if (!value?.messages) {

      console.log(
        "Webhook received but no incoming message."
      );

      return;
    }

    const message =
      value.messages[0];

    /*
    ============================================
    THIS IS THE MOST IMPORTANT LINE
    ============================================

    message.from is the WhatsApp number
    that actually sent the message.

    Reply MUST go to message.from.
    */

    const from =
      message?.from;

    console.log(
      "ACTUAL SENDER NUMBER:",
      from
    );

    /*
    WhatsApp may provide the business number
    separately. We only use it as information.
    */

    console.log(
      "BUSINESS PHONE NUMBER ID:",
      value?.metadata?.phone_number_id
    );

    if (!from) {

      console.error(
        "ERROR: message.from is missing."
      );

      return;
    }

    /*
    ============================================
    NON-TEXT MESSAGE
    ============================================
    */

    if (message.type !== "text") {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আপাতত আমি শুধুমাত্র text message গ্রহণ করতে পারি।"
      );

      return;
    }

    /*
    ============================================
    USER MESSAGE
    ============================================
    */

    const userMessage =
      message.text?.body?.trim();

    if (!userMessage) {
      return;
    }

    console.log(
      "USER MESSAGE:",
      userMessage
    );

    /*
    ============================================
    CHECK FOR TRAIN NUMBER
    ============================================
    */

    const trainNumber =
      extractTrainNumber(userMessage);

    let railwayData = "";

    /*
    If user asks live status and gives train number,
    query live train API.
    */

    const lower =
      userMessage.toLowerCase();

    const asksLive =
      lower.includes("live") ||
      lower.includes("status") ||
      lower.includes("delay") ||
      lower.includes("কোথায়") ||
      lower.includes("কোথায়") ||
      lower.includes("দেরি") ||
      lower.includes("লাইভ");

    if (trainNumber && asksLive) {

      console.log(
        "Live train request:",
        trainNumber
      );

      const liveData =
        await getLiveTrainStatus(
          trainNumber
        );

      railwayData =
        formatRailData(liveData);

    }

    /*
    ============================================
    GENERATE AI REPLY
    ============================================
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
    ============================================
    SEND REPLY TO SAME NUMBER
    ============================================
    */

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
      "WEBHOOK ERROR:",
      error.response?.data ||
      error.message ||
      error
    );

  }
});

/*
==================================================
START SERVER
==================================================
*/

app.listen(PORT, "0.0.0.0", () => {

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
    "Home: /"
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
    "Groq API Key:",
    GROQ_API_KEY ? "OK" : "MISSING"
  );

  console.log(
    "WhatsApp Token:",
    WHATSAPP_TOKEN ? "OK" : "MISSING"
  );

  console.log(
    "Phone Number ID:",
    PHONE_NUMBER_ID ? "OK" : "MISSING"
  );

  console.log(
    "RailRadar API:",
    RAILRADAR_API_KEY ? "OK" : "NOT CONFIGURED"
  );

  console.log(
    "================================"
  );

});
