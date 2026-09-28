const express = require("express");
const axios = require("axios");
const Groq = require("groq-sdk");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-20b";

const groq = new Groq({
  apiKey: GROQ_API_KEY
});

/* =========================================
   HOME / HEALTH CHECK
========================================= */

app.get("/", (req, res) => {
  res.send("Sealdah Train AI WhatsApp Bot is running.");
});

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

  console.log("Webhook verification request received");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");

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

    // We currently process text messages only
    if (message.type !== "text") {
      return res.sendStatus(200);
    }

    // VERY IMPORTANT:
    // This is the WhatsApp number of the person
    // who sent the message.
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
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }

    // Always return 200 to WhatsApp after receiving
    // the webhook so Meta does not repeatedly resend it.
    return res.sendStatus(200);
  }
});

/* =========================================
   GROQ AI
========================================= */

async function getAIReply(userMessage) {
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,

      messages: [
        {
          role: "system",
          content: `
তুমি "Sealdah Train Service" নামের একটি WhatsApp AI Assistant।

তোমার কাজ:
1. বাংলা ভাষায় সহজ ও পরিষ্কারভাবে উত্তর দেওয়া।
2. ব্যবহারকারী বাংলায় লিখলে বাংলায় উত্তর দেওয়া।
3. ইংরেজিতে লিখলে ইংরেজিতে উত্তর দেওয়া।
4. ব্যবহারকারী ট্রেন, শিয়ালদহ ডিভিশন, Eastern Railway, ট্রেনের সময়সূচি,
   স্টেশন, ট্রেন চলাচল ইত্যাদি সম্পর্কে প্রশ্ন করতে পারে।
5. তোমার কাছে live railway data না থাকলে কখনো নিজের থেকে ট্রেনের সময়,
   running status বা live location বানিয়ে বলবে না।
6. Live data না থাকলে পরিষ্কারভাবে বলবে যে live railway data বর্তমানে
   available নয়।
7. খুব অল্প কথায় কিন্তু কাজে লাগে এমন উত্তর দেবে।
8. অপ্রয়োজনীয় disclaimer বা দীর্ঘ উত্তর দেবে না।

বিশেষভাবে:
ব্যবহারকারী যদি জিজ্ঞাসা করে:
"আমি এখন শান্তিপুর থেকে শিয়ালদহ যাব, কোন ট্রেন পাব?"

তাহলে যদি live timetable data না থাকে, সেটা বানিয়ে বলবে না।
বলবে যে বর্তমান live timetable data পাওয়া যাচ্ছে না।

তুমি কোনো নির্দিষ্ট ব্যক্তিকে উত্তর দিচ্ছ না।
যে ব্যক্তি WhatsApp-এ প্রশ্ন করবে, তার প্রশ্নের উত্তর দেবে।
          `
        },
        {
          role: "user",
          content: userMessage
        }
      ],

      temperature: 0.2,
      max_tokens: 500
    });

    return (
      completion.choices?.[0]?.message?.content ||
      "দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।"
    );

  } catch (error) {
    console.error("Groq error:");

    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }

    return "দুঃখিত, AI service থেকে এখন উত্তর পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।";
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
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
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
   PRIVACY PAGE
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
          Sealdah Train Service WhatsApp AI Bot processes messages
          sent by users through WhatsApp for the purpose of generating
          automated responses.
        </p>

        <p>
          Messages may be processed by third-party AI services
          to generate responses.
        </p>

        <p>
          We do not intentionally sell personal information.
        </p>

        <p>
          For questions regarding this service, please contact
          the service administrator.
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
