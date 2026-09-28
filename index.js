// --------------------------------------------------
// Privacy Policy
// --------------------------------------------------

app.get("/privacy", (req, res) => {
  res.type("text/plain").send(`
Privacy Policy

This WhatsApp AI Bot receives messages sent by users through WhatsApp.

Messages may be processed by Google Gemini to generate AI responses.

Conversation history is temporarily stored in server memory for the purpose of maintaining conversation context.

We do not sell personal information.

Users may contact the bot owner to request deletion of their information.
  `);
});
