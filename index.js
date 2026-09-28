```javascript
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
  GEMINI_API_KEY,
  GEMINI_MODEL = "gemini-3.8-flash"
} = process.env;

// --------------------------------------------------
// Basic health check
// --------------------------------------------------

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp AI Bot is running.");
});

app.get("/api", (req, res) => {
  res.status(200).json({
    status: "ok",
    whatsapp: "connected",
    ai: "ready"
  });
});

// --------------------------------------------------
// Privacy Policy
// --------------------------------------------------

app.get("/privacy", (req, res) => {
  res.type("text/plain").send(
`Privacy Policy

This WhatsApp AI Bot receives messages sent by users through WhatsApp.

Messages may be processed by Google Gemini to generate AI responses.

Conversation history is temporarily stored in server memory for the purpose of maintaining conversation context.

We do not sell personal information.

Users may contact the bot owner to request deletion of their information.`
  );
});

// --------------------------------------------------
// Meta WhatsApp Webhook Verification
// --------------------------------------------------

app.get("/webhook", (req, res) => {

  console.log("================================");
  console.log("META WEBHOOK VERIFICATION");
  console.log("Mode:", req.query["hub.mode"]);
  console.log(
    "Token received:",
    req.query["hub.verify_token"] ? "YES" : "NO"
  );
  console.log(
    "Challenge:",
    req.query["hub.challenge"] ? "YES" : "NO"
  );
  console.log("================================");

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("Webhook verification successful.");

    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed.");

  return res.sendStatus(403);
});

// --------------------------------------------------
// WhatsApp Incoming Messages
// --------------------------------------------------

app.post("/webhook", async (req, res) => {

  console.log("================================");
  console.log("WHATSAPP WEBHOOK RECEIVED");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("================================");

  // Respond to Meta immediately
  res.sendStatus(200);

  try {

    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;

    if (!value) {
      console.log("Webhook value missing.");
      return;
    }

    const message = value.messages?.[0];

    // Ignore status updates
    if (!message) {

      console.log(
        "No user message. Probably a status update."
      );

      return;
    }

    const from = message.from;
    const text = message.text?.body;

    if (!from) {
      console.log("Sender number missing.");
      return;
    }

    if (!text) {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আমি এখন শুধু লেখা মেসেজ বুঝতে পারি।"
      );

      return;
    }

    console.log("User:", from);
    console.log("Message:", text);

    // ------------------------------------------------
    // Call Gemini
    // ------------------------------------------------

    const reply = await callGemini(text);

    console.log("AI Reply:", reply);

    // ------------------------------------------------
    // Send WhatsApp reply
    // ------------------------------------------------

    await sendWhatsAppMessage(from, reply);

  } catch (error) {

    console.error(
      "Webhook processing error:",
      error.response?.data || error.message
    );

  }
});

// --------------------------------------------------
// Gemini AI
// --------------------------------------------------

async function callGemini(userMessage) {

  if (!GEMINI_API_KEY) {

    console.error("GEMINI_API_KEY is missing.");

    return "দুঃখিত, AI service এখন configure করা হয়নি।";
  }

  const systemInstruction =
`তুমি একজন সহায়ক বাংলা AI assistant।

তুমি মূলত Eastern Railway এবং Sealdah Division-এর ট্রেন সম্পর্কিত প্রশ্নের উত্তর দেবে।

ব্যবহারকারী বাংলায় প্রশ্ন করলে বাংলায় উত্তর দেবে।

উত্তর সংক্ষিপ্ত, সহজ এবং পরিষ্কার হবে।

ট্রেন সম্পর্কিত প্রশ্ন হলে:
- ট্রেনের নাম বা নম্বর
- কোথা থেকে ছাড়ে
- কখন ছাড়ে
- কোথায় যায়
- পৌঁছানোর সময়

যদি নিশ্চিত তথ্য না থাকে তাহলে অনুমান করে সময় বলবে না।

প্রয়োজনে ব্যবহারকারীকে NTES বা Indian Railways-এর official enquiry system-এ যাচাই করতে বলবে।

সাধারণ প্রশ্ন করলে সাধারণভাবেই সাহায্য করবে।

WhatsApp-এর জন্য Markdown table ব্যবহার করবে না।

কোনো তথ্য নিশ্চিত না হলে স্পষ্টভাবে বলবে যে তথ্যটি নিশ্চিত নয়।`;

  // ------------------------------------------------
  // Models to try
  // ------------------------------------------------

  const models = [
    GEMINI_MODEL,
    "gemini-3.8-flash",
    "gemini-3.8-flash-lite"
  ];

  // Remove duplicates
  const uniqueModels = [...new Set(models)];

  let lastError = null;

  // ------------------------------------------------
  // Try models
  // ------------------------------------------------

  for (const model of uniqueModels) {

    console.log("Trying Gemini model:", model);

    const url =
`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const body = {

      system_instruction: {
        parts: [
          {
            text: systemInstruction
          }
        ]
      },

      contents: [
        {
          role: "user",
          parts: [
            {
              text: userMessage
            }
          ]
        }
      ]
    };

    // ------------------------------------------------
    // Retry up to 3 times
    // ------------------------------------------------

    for (let attempt = 1; attempt <= 3; attempt++) {

      try {

        console.log(
          `Gemini attempt ${attempt}/3 using ${model}`
        );

        const response = await axios.post(
          url,
          body,
          {
            headers: {
              "Content-Type": "application/json"
            },

            timeout: 30000
          }
        );

        const parts =
          response.data?.candidates?.[0]?.content?.parts || [];

        const reply = parts
          .map(part => part.text || "")
          .join("")
          .trim();

        if (reply) {

          console.log(
            `Gemini success using ${model}`
          );

          return reply.substring(0, 4000);
        }

        console.log(
          "Gemini returned empty response."
        );

      } catch (error) {

        lastError =
          error.response?.data || error.message;

        const status =
          error.response?.status;

        console.error(
          `Gemini error on attempt ${attempt}:`,
          lastError
        );

        // --------------------------------------------
        // Model unavailable / not found
        // --------------------------------------------

        if (
          status === 404 ||
          error.response?.data?.error?.status === "NOT_FOUND"
        ) {

          console.log(
            `Model ${model} unavailable. Trying next model.`
          );

          break;
        }

        // --------------------------------------------
        // Rate limit / server busy / temporary error
        // --------------------------------------------

        if (
          status === 429 ||
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504
        ) {

          if (attempt < 3) {

            const waitTime =
              attempt === 1
                ? 3000
                : attempt === 2
                  ? 7000
                  : 12000;

            console.log(
              `Waiting ${waitTime}ms before retry...`
            );

            await sleep(waitTime);

            continue;
          }
        }

        // Other errors
        break;
      }
    }
  }

  console.error(
    "All Gemini attempts failed:",
    lastError
  );

  return "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। ১০-১৫ সেকেন্ড পরে আবার চেষ্টা করুন।";
}

// --------------------------------------------------
// Sleep helper
// --------------------------------------------------

function sleep(ms) {

  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// --------------------------------------------------
// Send WhatsApp Message
// --------------------------------------------------

async function sendWhatsAppMessage(to, text) {

  if (!WHATSAPP_TOKEN) {

    console.error(
      "WHATSAPP_TOKEN is missing."
    );

    return;
  }

  if (!PHONE_NUMBER_ID) {

    console.error(
      "PHONE_NUMBER_ID is missing."
    );

    return;
  }

  if (!to) {

    console.error(
      "WhatsApp recipient number is missing."
    );

    return;
  }

  const url =
`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  try {

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
        },

        timeout: 30000
      }
    );

    console.log(
      "WhatsApp message sent to:",
      to
    );

  } catch (error) {

    console.error(
      "WhatsApp API error:",
      error.response?.data || error.message
    );
  }
}

// --------------------------------------------------
// Start Server
// --------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("================================");

    console.log(
      "WhatsApp AI Bot is running."
    );

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      "Health: /api"
    );

    console.log(
      "Webhook: /webhook"
    );

    console.log("================================");
  }
);
```
