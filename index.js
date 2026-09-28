```javascript
const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-20b";

/* =========================================
   HOME
========================================= */

app.get("/", (req, res) => {
  res.send("Sealdah Train Service WhatsApp AI Bot is running.");
});

/* =========================================
   HEALTH CHECK
========================================= */

app.get("/api", (req, res) => {
  res.json({
    status: "ok",
    whatsapp: "connected",
    ai: "Groq",
    model: GROQ_MODEL
  });
});

/* =========================================
   WHATSAPP WEBHOOK VERIFICATION
========================================= */

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request received.");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed.");

  return res.sendStatus(403);
});

/* =========================================
   WHATSAPP INCOMING MESSAGE
========================================= */

app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming webhook:");
    console.log(JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return res.sendStatus(200);
    }

    const messages = value.messages;

    // Ignore status updates
    if (!messages || messages.length === 0) {
      return res.sendStatus(200);
    }

    const message = messages[0];

    // Only text messages
    if (message.type !== "text") {
      return res.sendStatus(200);
    }

    /*
      VERY IMPORTANT

      message.from = যে ব্যক্তি WhatsApp-এ
      আপনার নম্বরে message করেছে তার নম্বর।

      তাই reply সেই একই নম্বরে যাবে।
    */

    const from = message.from;

    const userMessage = message.text?.body?.trim();

    if (!from || !userMessage) {
      return res.sendStatus(200);
    }

    console.log("Message from:", from);
    console.log("User message:", userMessage);

    /* =========================================
       GET AI RESPONSE
    ========================================= */

    const reply = await getAIReply(userMessage);

    console.log("AI reply:", reply);

    /* =========================================
       SEND REPLY TO SAME PERSON
    ========================================= */

    await sendWhatsAppMessage(from, reply);

    return res.sendStatus(200);

  } catch (error) {

    console.error("Webhook error:");

    if (error.response) {
      console.error(
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(error.message);
    }

    return res.sendStatus(200);
  }
});

/* =========================================
   GROQ AI
   Direct API using Axios
========================================= */

async function getAIReply(userMessage) {

  try {

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",

      {
        model: GROQ_MODEL,

        messages: [
          {
            role: "system",

            content: `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার কাজ:

1. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেবে।
2. ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেবে।
3. সহজ, ছোট এবং পরিষ্কার উত্তর দেবে।
4. ব্যবহারকারী Eastern Railway বা Sealdah Division-এর
   ট্রেন, স্টেশন, সময়সূচি, ট্রেন চলাচল ইত্যাদি সম্পর্কে প্রশ্ন করতে পারে।
5. তোমার কাছে live railway data না থাকলে কখনো নিজের থেকে
   train timing বা live running status বানিয়ে বলবে না।
6. Live data না থাকলে পরিষ্কারভাবে বলবে যে বর্তমানে live railway
   data পাওয়া যাচ্ছে না।
7. অপ্রয়োজনীয় বড় উত্তর দেবে না।
            `
          },

          {
            role: "user",
            content: userMessage
          }
        ],

        temperature: 0.2,

        max_tokens: 500
      },

      {
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },

        timeout: 30000
      }
    );

    const reply =
      response.data?.choices?.[0]?.message?.content;

    if (reply) {
      return reply;
    }

    return "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।";

  } catch (error) {

    console.error("Groq API error:");

    if (error.response) {
      console.error(
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(error.message);
    }

    return "দুঃখিত, AI service থেকে এখন উত্তর পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।";
  }
}

/* =========================================
   SEND WHATSAPP MESSAGE
========================================= */

async function sendWhatsAppMessage(to, message) {

  const url =
    `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

  try {

    const response = await axios.post(

      url,

      {
        messaging_product: "whatsapp",

        recipient_type: "individual",

        to: to,

        type: "text",

        text: {
          preview_url: false,
          body: message
        }
      },

      {
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },

        timeout: 30000
      }
    );

    console.log("WhatsApp message sent successfully.");

    return response.data;

  } catch (error) {

    console.error("WhatsApp send error:");

    if (error.response) {
      console.error(
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(error.message);
    }

    throw error;
  }
}

/* =========================================
   PRIVACY
========================================= */

app.get("/privacy", (req, res) => {

  res.send(`
    <html>
      <head>
        <title>Privacy Policy</title>
      </head>

      <body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px;">

        <h1>Privacy Policy</h1>

        <p>
          Sealdah Train Service WhatsApp AI Bot processes
          WhatsApp messages to provide automated responses.
        </p>

        <p>
          Messages may be processed by an AI service to
          generate responses.
        </p>

        <p>
          We do not intentionally sell personal information.
        </p>

      </body>
    </html>
  `);

});

/* =========================================
   START SERVER
========================================= */

app.listen(PORT, () => {

  console.log("================================");
  console.log("Sealdah Train WhatsApp AI Bot");
  console.log("Server running on port:", PORT);
  console.log("Health: /api");
  console.log("Webhook: /webhook");
  console.log("Privacy: /privacy");
  console.log("AI: Groq");
  console.log("Model:", GROQ_MODEL);
  console.log("================================");

});
```
