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


// ==================================================
// HEALTH CHECK
// ==================================================

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp AI Bot is running.");
});

app.get("/api", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: "WhatsApp AI Bot"
  });
});


// ==================================================
// PRIVACY POLICY
// ==================================================

app.get("/privacy", (req, res) => {
  res.type("text/plain").send(`
Privacy Policy

This WhatsApp AI Bot receives messages sent by users through WhatsApp.

Messages may be processed by Google Gemini to generate AI responses.

Conversation history may be temporarily stored in server memory for maintaining conversation context.

We do not sell personal information.

Users may contact the bot owner to request deletion of their information.
`);
});


// ==================================================
// META WEBHOOK VERIFICATION
// ==================================================

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("================================");
  console.log("META WEBHOOK VERIFICATION");
  console.log("Mode:", mode);
  console.log("Token received:", token ? "YES" : "NO");
  console.log("Challenge:", challenge ? "YES" : "NO");
  console.log("================================");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    console.log("Webhook verification successful.");

    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed.");

  return res.sendStatus(403);
});


// ==================================================
// WHATSAPP WEBHOOK
// ==================================================

app.post("/webhook", async (req, res) => {

  console.log("================================");
  console.log("WHATSAPP WEBHOOK RECEIVED");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("================================");

  // Immediately tell Meta that webhook was received
  res.sendStatus(200);

  try {

    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;

    if (!value) {
      console.log("No webhook value.");
      return;
    }

    // Ignore delivery/read/status events
    const message = value.messages?.[0];

    if (!message) {
      console.log("No user message. Status/update event.");
      return;
    }

    const from = message.from;

    if (!from) {
      console.log("Sender number missing.");
      return;
    }

    // ------------------------------------------------
    // TEXT MESSAGE
    // ------------------------------------------------

    if (message.type !== "text") {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আমি বর্তমানে শুধু Text Message বুঝতে পারি।"
      );

      return;
    }

    const userMessage = message.text?.body?.trim();

    if (!userMessage) {
      return;
    }

    console.log("User:", from);
    console.log("Message:", userMessage);


    // ------------------------------------------------
    // GEMINI
    // ------------------------------------------------

    const aiReply = await callGemini(userMessage);

    console.log("AI Reply:", aiReply);


    // ------------------------------------------------
    // WHATSAPP REPLY
    // ------------------------------------------------

    await sendWhatsAppMessage(from, aiReply);

  } catch (error) {

    console.error(
      "Webhook processing error:",
      error.response?.data || error.message
    );

  }
});


// ==================================================
// GEMINI AI
// ==================================================

async function callGemini(userMessage) {

  if (!GEMINI_API_KEY) {

    console.error("GEMINI_API_KEY is missing.");

    return "দুঃখিত, AI service এখন configure করা হয়নি।";
  }


  const systemInstruction = `
তুমি একজন সহায়ক বাংলা AI assistant।

তুমি সাধারণ ব্যবহারকারীর প্রশ্নের উত্তর দেবে।

তুমি Eastern Railway এবং Sealdah Division সম্পর্কিত প্রশ্নেও সাহায্য করতে পারবে।

ব্যবহারকারী বাংলায় প্রশ্ন করলে বাংলায় উত্তর দেবে।

ব্যবহারকারী ইংরেজিতে প্রশ্ন করলে ইংরেজিতে উত্তর দিতে পারো।

উত্তর সহজ, স্বাভাবিক এবং সংক্ষিপ্ত রাখবে।

ট্রেনের সময়সূচি বা railway information সম্পর্কে নিশ্চিত তথ্য না থাকলে অনুমান করবে না।

প্রয়োজনে ব্যবহারকারীকে NTES বা Indian Railways-এর official enquiry system-এ যাচাই করতে বলবে।

WhatsApp-এর জন্য Markdown table ব্যবহার করবে না।
`;


  const models = [
    GEMINI_MODEL,
    "gemini-3.8-flash",
    "gemini-3.8-flash-lite"
  ];


  const uniqueModels = [...new Set(models)];

  let lastError = null;


  // ==================================================
  // TRY GEMINI MODELS
  // ==================================================

  for (const model of uniqueModels) {

    console.log("Trying Gemini model:", model);


    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;


    const requestBody = {

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


    // ==================================================
    // RETRY
    // ==================================================

    for (let attempt = 1; attempt <= 3; attempt++) {

      try {

        console.log(
          `Gemini attempt ${attempt}/3`
        );


        const response = await axios.post(
          url,
          requestBody,
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
            "Gemini response successful."
          );

          return reply.substring(0, 4000);
        }


        console.log("Gemini returned empty response.");

      } catch (error) {

        lastError =
          error.response?.data || error.message;


        const status =
          error.response?.status;


        console.error(
          "Gemini error:",
          lastError
        );


        // Model not available
        if (
          status === 404 ||
          error.response?.data?.error?.status === "NOT_FOUND"
        ) {

          console.log(
            `Model ${model} unavailable. Trying next model.`
          );

          break;
        }


        // Temporary errors
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
                : 7000;

            console.log(
              `Retrying after ${waitTime}ms...`
            );

            await sleep(waitTime);

            continue;
          }
        }


        break;
      }
    }
  }


  console.error(
    "All Gemini attempts failed:",
    lastError
  );


  return "দুঃখিত, AI service এই মুহূর্তে ব্যস্ত আছে। একটু পরে আবার চেষ্টা করুন।";
}


// ==================================================
// SLEEP
// ==================================================

function sleep(ms) {

  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}


// ==================================================
// SEND WHATSAPP MESSAGE
// ==================================================

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
      "Recipient number is missing."
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
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
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


// ==================================================
// START SERVER
// ==================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("================================");
    console.log("WhatsApp AI Bot is running.");
    console.log(`Server running on port ${PORT}`);
    console.log("Health: /api");
    console.log("Webhook: /webhook");
    console.log("================================");
  }
);
```
