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
  GEMINI_MODEL = "gemini-2.5-flash"
} = process.env;


// ==================================================
// HOME
// ==================================================

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp AI Bot is running.");
});


// ==================================================
// HEALTH CHECK
// ==================================================

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

Conversation history is temporarily stored in server memory for maintaining conversation context.

We do not sell personal information.

Users may contact the bot owner to request deletion of their information.
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
  console.log("Challenge received:", challenge ? "YES" : "NO");


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


  // ------------------------------------------------
  // Respond to Meta immediately
  // ------------------------------------------------

  res.sendStatus(200);


  try {

    const value =
      req.body?.entry?.[0]?.changes?.[0]?.value;


    if (!value) {
      console.log("No webhook value found.");
      return;
    }


    // ------------------------------------------------
    // IMPORTANT
    // This is the WhatsApp Business number ID
    // that received the message.
    // ------------------------------------------------

    const incomingPhoneNumberId =
      value.metadata?.phone_number_id;


    console.log(
      "Incoming WhatsApp Phone Number ID:",
      incomingPhoneNumberId
    );


    // ------------------------------------------------
    // Get message
    // ------------------------------------------------

    const message = value.messages?.[0];


    // Ignore status updates
    if (!message) {

      console.log(
        "No user message. Probably a status update."
      );

      return;
    }


    // ------------------------------------------------
    // USER'S WHATSAPP NUMBER
    // ------------------------------------------------

    const from = message.from;


    console.log(
      "Message received from:",
      from
    );


    // ------------------------------------------------
    // TEXT MESSAGE
    // ------------------------------------------------

    const text = message.text?.body;


    if (!from) {

      console.log("Sender number not found.");

      return;
    }


    // ------------------------------------------------
    // Non-text message
    // ------------------------------------------------

    if (!text) {

      await sendWhatsAppMessage(
        from,
        "দুঃখিত, আমি এখন শুধু লেখা মেসেজ বুঝতে পারি।",
        incomingPhoneNumberId
      );

      return;
    }


    console.log("User message:");
    console.log(text);


    // ------------------------------------------------
    // GEMINI AI
    // ------------------------------------------------

    const reply = await callGemini(text);


    console.log("AI Reply:");
    console.log(reply);


    // ------------------------------------------------
    // SEND REPLY
    //
    // IMPORTANT:
    // reply goes to the ORIGINAL USER
    // from = user who sent the message
    //
    // sender/business number is selected by
    // incomingPhoneNumberId
    // ------------------------------------------------

    await sendWhatsAppMessage(
      from,
      reply,
      incomingPhoneNumberId
    );


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

    console.error(
      "GEMINI_API_KEY is missing."
    );

    return "দুঃখিত, AI service এখন configure করা হয়নি।";
  }


  const systemInstruction = `
তুমি একজন সহায়ক বাংলা AI assistant।

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
`;


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;


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


  try {

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


    if (!reply) {

      return "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।";
    }


    return reply.substring(0, 4000);


  } catch (error) {

    console.error(
      "Gemini error:",
      error.response?.data || error.message
    );


    return "দুঃখিত, AI service থেকে এখন উত্তর পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।";
  }

}


// ==================================================
// SEND WHATSAPP MESSAGE
// ==================================================

async function sendWhatsAppMessage(
  to,
  text,
  phoneNumberId
) {


  // ------------------------------------------------
  // If webhook metadata has phone number ID,
  // use that.
  //
  // Otherwise use Render Environment Variable.
  // ------------------------------------------------

  const senderPhoneNumberId =
    phoneNumberId || PHONE_NUMBER_ID;


  if (!WHATSAPP_TOKEN) {

    console.error(
      "WHATSAPP_TOKEN is missing."
    );

    return;
  }


  if (!senderPhoneNumberId) {

    console.error(
      "PHONE_NUMBER_ID is missing."
    );

    return;
  }


  console.log(
    "Sending WhatsApp reply..."
  );

  console.log(
    "From Phone Number ID:",
    senderPhoneNumberId
  );

  console.log(
    "To:",
    to
  );


  // ------------------------------------------------
  // WhatsApp Cloud API URL
  // ------------------------------------------------

  const url =
    `https://graph.facebook.com/v20.0/${senderPhoneNumberId}/messages`;


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
      "WhatsApp message sent successfully."
    );

    console.log(
      "Recipient:",
      to
    );

    console.log(
      "Message ID:",
      response.data?.messages?.[0]?.id
    );


  } catch (error) {

    console.error(
      "WhatsApp API error:"
    );

    console.error(
      error.response?.data ||
      error.message
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

    console.log(
      "================================"
    );

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

    console.log(
      "Privacy: /privacy"
    );

    console.log(
      "================================"
    );

  }
);
