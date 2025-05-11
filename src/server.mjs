import express from "express";

const app = express();
const port = process.env.PORT || 3000;

// Middleware per leggere i dati da Twilio
app.use(express.urlencoded({ extended: false }));

// Webhook di Twilio
app.post("/webhook", (req, res) => {
  console.log("Messaggio ricevuto da Twilio:", req.body);
  res.set("Content-Type", "text/plain");
  res.send("OK");
});

// Avvio del server
app.listen(port, () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});
