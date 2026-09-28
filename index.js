const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ===============================
// ENVIRONMENT VARIABLES
// ===============================
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-20b";

// ===============================
// BASIC CHECK
// ===============================
console.log("================================");
console.log("WhatsApp AI Bot is starting...");
console.log("Groq API Key:", GROQ_API_KEY ? "OK" : "MISSING");
console.log("WhatsApp Token:", WHATSAPP_TOKEN ? "OK" : "MISSING");
console.log("Phone Number ID:", PHONE_NUMBER_ID ? "OK" : "MISSING");
console.log("================================");

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot is running");
});

app.get("/api", (req, res) => {
  res.json({
    status: "ok",
    service: "WhatsApp AI Bot",
    ai: "Groq",
    model: GROQ_MODEL
  });
});

// ===============================
// META WEBHOOK VERIFICATION
// ===============================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");

  return res.sendStatus(403);
});

// ===============================
// GROQ AI
// ===============================
async function getAIReply(userMessage) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `
তুমি একজন দ্রুত, ভদ্র এবং সহায়ক বাংলা AI assistant।

তোমার প্রধান কাজ:
- ব্যবহারকারীর প্রশ্ন বুঝে সহজ বাংলায় উত্তর দেওয়া।
- প্রয়োজনে বাংলা ও English দুটোই ব্যবহার করা।
- উত্তর সংক্ষিপ্ত, পরিষ্কার এবং সরাসরি রাখা।
- ব্যবহারকারী যদি ট্রেন বা Eastern Railway / Sealdah Division সম্পর্কে প্রশ্ন করে, তাহলে সাহায্য করার চেষ্টা করবে।
- তোমার কাছে লাইভ ট্রেন ডেটা না থাকলে কখনো বানিয়ে ট্রেনের সময়, নম্বর বা availability বলবে না।
- নিশ্চিত তথ্য না থাকলে স্পষ্টভাবে বলবে যে লাইভ তথ্য যাচাই করা দরকার।
- অপ্রয়োজনীয় দীর্ঘ উত্তর দেবে না।
`
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Groq API Error:", data);
    throw new Error(
      data?.error?.message || "Groq API request failed"
    );
  }

  const reply =
    data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error("Empty response from Groq");
  }

  return reply;
}

// ===============================
// SEND WHATSAPP MESSAGE
// ===============================
async function sendWhatsAppMessage(to, message) {
  const url =
    `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: {
        preview_url: false,
        body: message
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("WhatsApp API Error:", data);
    throw new Error(
      data?.error?.message || "WhatsApp message failed"
    );
  }

  console.log("WhatsApp message sent:", data);
  return data;
}

// ===============================
// WEBHOOK RECEIVE
// ===============================
app.post("/webhook", async (req, res) => {
  try {
    // Respond to Meta immediately
    res.sendStatus(200);

    const body = req.body;

    console.log(
      "Incoming webhook:",
      JSON.stringify(body)
    );

    if (body.object !== "whatsapp_business_account") {
      return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;

        if (!value) {
          continue;
        }

        const messages = value.messages || [];

        for (const message of messages) {

          // Only process text messages
          if (message.type !== "text") {
            continue;
          }

          const from = message.from;
          const userMessage =
            message.text?.body?.trim();

          if (!from || !userMessage) {
            continue;
          }

          console.log(
            `Message from ${from}: ${userMessage}`
          );

          try {
            // Get AI response
            const reply =
              await getAIReply(userMessage);

            console.log(
              `AI Reply: ${reply}`
            );

            // Send WhatsApp reply
            await sendWhatsAppMessage(
              from,
              reply
            );

          } catch (error) {
            console.error(
              "Message processing error:",
              error
            );

            // Send friendly fallback
            try {
              await sendWhatsAppMessage(
                from,
                "দুঃখিত, এই মুহূর্তে AI service থেকে উত্তর পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।"
              );
            } catch (sendError) {
              console.error(
                "Fallback message failed:",
                sendError
              );
            }
          }
        }
      }
    }

  } catch (error) {
    console.error(
      "Webhook error:",
      error
    );

    // Meta already received 200
  }
});

// ===============================
// PRIVACY POLICY
// ===============================
app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy</title>
      </head>
      <body>
        <h1>Privacy Policy</h1>

        <p>
          This WhatsApp AI Bot processes messages
          submitted by users to provide automated
          responses.
        </p>

        <p>
          Messages are processed only for providing
          the requested service.
        </p>

        <p>
          This service does not intentionally sell
          personal information to third parties.
        </p>

        <p>
          Contact: music@sumanmusix.info
        </p>
      </body>
    </html>
  `);
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log("================================");
  console.log("WhatsApp AI Bot is running.");
  console.log(`Server running on port ${PORT}`);
  console.log("Health: /api");
  console.log("Webhook: /webhook");
  console.log("Privacy: /privacy");
  console.log("AI: Groq");
  console.log(`Model: ${GROQ_MODEL}`);
  console.log("================================");
});
