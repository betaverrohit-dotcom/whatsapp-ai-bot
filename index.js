require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const {
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  GROQ_API_KEY,
  GROQ_MODEL = "openai/gpt-oss-20b"
} = process.env;


// ==================================================
// BASIC ROUTES
// ==================================================

app.get("/", (req, res) => {
  res.status(200).send("Sealdah Train Service AI Bot is running.");
});

app.get("/api", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Sealdah Train Service AI Bot",
    ai: "Groq",
    model: GROQ_MODEL
  });
});


// ==================================================
// PRIVACY POLICY
// ==================================================

app.get("/privacy", (req, res) => {
  res.type("text/plain").send(`
Privacy Policy

This WhatsApp AI Bot receives messages sent by users through WhatsApp.

Messages may be processed by an AI service to generate responses.

The bot is designed to provide information about Indian Railway and Sealdah Division train services.

Conversation information may be temporarily processed to provide responses.

We do not sell personal information.

Users may contact the bot owner regarding information or deletion requests.
`);
});


// ==================================================
// META WEBHOOK VERIFICATION
// ==================================================

app.get("/webhook", (req, res) => {

  console.log("================================");
  console.log("META WEBHOOK VERIFICATION");
  console.log("================================");

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Mode:", mode);
  console.log("Token received:", token ? "YES" : "NO");
  console.log("Challenge:", challenge ? "YES" : "NO");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("Webhook verification successful.");

    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed.");

  return res.sendStatus(403);
});


// ==================================================
// WHATSAPP INCOMING MESSAGE
// ==================================================

app.post("/webhook", async (req, res) => {

  console.log("================================");
  console.log("WHATSAPP WEBHOOK RECEIVED");
  console.log("================================");

  console.log(JSON.stringify(req.body, null, 2));

  // Meta-কে সঙ্গে সঙ্গে 200 response
  res.sendStatus(200);

  try {

    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;

    if (!value) {
      console.log("No webhook value.");
      return;
    }

    // Status update হলে messages থাকবে না
    const message = value.messages?.[0];

    if (!message) {
      console.log("No user message. Probably a status update.");
      return;
    }

    // যে নম্বর থেকে WhatsApp message এসেছে
    const from = message.from;

    // User-এর text
    const text = message.text?.body;

    if (!from) {
      console.log("Sender number not found.");
      return;
    }

    console.log("Message received from:", from);

    // Text না হলে
    if (!text) {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আমি এখন শুধু লেখা মেসেজ বুঝতে পারি।"
      );

      return;
    }

    console.log("User message:", text);

    // AI response
    const reply = await callGroq(text);

    console.log("AI reply:", reply);

    // IMPORTANT:
    // যে নম্বর থেকে message এসেছে,
    // reply সেই নম্বরেই যাবে
    await sendWhatsAppMessage(from, reply);

  } catch (error) {

    console.error(
      "Webhook processing error:",
      error.response?.data || error.message
    );

  }

});


// ==================================================
// GROQ AI
// ==================================================

async function callGroq(userMessage) {

  if (!GROQ_API_KEY) {

    console.error("GROQ_API_KEY is missing.");

    return "দুঃখিত, AI service এখন configure করা হয়নি।";
  }

  const systemPrompt = `
তুমি "Sealdah Train Service" WhatsApp AI Assistant।

তোমার প্রধান কাজ হলো Indian Railways এবং বিশেষ করে Eastern Railway ও Sealdah Division-এর ট্রেন সংক্রান্ত তথ্য নিয়ে ব্যবহারকারীকে সাহায্য করা।

ব্যবহারকারী বাংলায় প্রশ্ন করলে বাংলায় উত্তর দেবে।

উত্তর সহজ, ছোট এবং পরিষ্কার হবে।

ব্যবহারকারী যদি ট্রেন সম্পর্কে প্রশ্ন করে তাহলে সম্ভব হলে:

• ট্রেনের নাম
• ট্রেন নম্বর
• কোথা থেকে ছাড়ে
• কখন ছাড়ে
• কোন স্টেশনে যায়
• পৌঁছানোর সময়
• route
• available information

দেবে।

গুরুত্বপূর্ণ:

তুমি নিশ্চিত না হলে কোনো ট্রেনের সময় বা live running status অনুমান করে বলবে না।

Live train location বা বর্তমান running status নিশ্চিতভাবে জানা না থাকলে পরিষ্কারভাবে বলবে যে live data যাচাই করা প্রয়োজন।

ব্যবহারকারী চাইলে তাকে NTES বা Indian Railways-এর official enquiry system-এ যাচাই করতে বলবে।

সাধারণ প্রশ্ন করলে সাধারণভাবেও সাহায্য করবে।

WhatsApp-এর জন্য Markdown table ব্যবহার করবে না।

উত্তর খুব বেশি বড় করবে না।

ব্যবহারকারী যদি শুধু "Hi", "Hello", "হ্যালো" ইত্যাদি বলে, তাহলে স্বাভাবিকভাবে অভিবাদন জানিয়ে বলবে যে সে ট্রেনের নাম, নম্বর বা route লিখে জানতে পারে।

উদাহরণ:

User:
Sealdah থেকে Santipur যাওয়ার ট্রেন কখন?

Assistant:
শিয়ালদহ থেকে শান্তিপুর যাওয়ার ট্রেনের সময় জানতে আপনি চাইলে ট্রেনের নাম বা "Sealdah to Santipur today" লিখতে পারেন।

সবসময় বাস্তব তথ্য নিশ্চিত না হলে সময় বানিয়ে বলবে না।
`;

  const url = "https://api.groq.com/openai/v1/chat/completions";

  try {

    const response = await axios.post(
      url,
      {
        model: GROQ_MODEL,

        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userMessage
          }
        ],

        temperature: 0.2,

        max_tokens: 700
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
      response.data?.choices?.[0]?.message?.content
        ?.trim();

    if (!reply) {

      return "দুঃখিত, এই মুহূর্তে AI থেকে কোনো উত্তর পাওয়া যাচ্ছে না।";
    }

    // WhatsApp message maximum safe length
    return reply.substring(0, 4000);

  } catch (error) {

    console.error(
      "Groq API error:",
      error.response?.data || error.message
    );

    return "দুঃখিত, AI service থেকে এখন উত্তর পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।";
  }

}


// ==================================================
// SEND WHATSAPP MESSAGE
// ==================================================

async function sendWhatsAppMessage(to, text) {

  if (!WHATSAPP_TOKEN) {

    console.error("WHATSAPP_TOKEN is missing.");

    return;
  }

  if (!PHONE_NUMBER_ID) {

    console.error("PHONE_NUMBER_ID is missing.");

    return;
  }

  if (!to) {

    console.error("Recipient number is missing.");

    return;
  }

  const url =
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  try {

    const response = await axios.post(
      url,

      {
        messaging_product: "whatsapp",

        recipient_type: "individual",

        // IMPORTANT:
        // from = যে user message করেছে
        // তাই reply সেই user-এর নম্বরেই যাবে
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
        },

        timeout: 30000
      }
    );

    console.log(
      "WhatsApp reply sent successfully to:",
      to
    );

    console.log(
      "WhatsApp API response:",
      JSON.stringify(response.data)
    );

  } catch (error) {

    console.error(
      "WhatsApp API error:",
      error.response?.data || error.message
    );
  }

}


// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log("================================");
  console.log("Sealdah Train Service AI Bot");
  console.log("================================");

  console.log("Server running on port:", PORT);

  console.log("Health:", "/api");

  console.log("Webhook:", "/webhook");

  console.log("Privacy:", "/privacy");

  console.log("AI:", "Groq");

  console.log("Model:", GROQ_MODEL);

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

  console.log("================================");

});
