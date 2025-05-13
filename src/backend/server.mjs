import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import twilio from "twilio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import generateAIResponse from "./gemini.mjs";

// Configurazione path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

// Carica le variabili d'ambiente prima di utilizzarle
dotenv.config();

// Assicura che la directory data esista
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
const port = process.env.PORT || 3000;
const conversations = {}; // Archivio delle conversazioni in memoria

// Carica le conversazioni dal file se esiste
try {
  const conversationsFile = path.join(dataDir, "conversations.json");
  if (fs.existsSync(conversationsFile)) {
    const data = fs.readFileSync(conversationsFile, "utf8");
    Object.assign(conversations, JSON.parse(data));
    console.log("Conversazioni caricate dal file");
  }
} catch (error) {
  console.error("Errore nel caricamento delle conversazioni:", error);
}

// Salva le conversazioni su file
const saveConversations = () => {
  try {
    const conversationsFile = path.join(dataDir, "conversations.json");
    fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2));
    console.log("Conversazioni salvate con successo");
  } catch (error) {
    console.error("Errore nel salvataggio delle conversazioni:", error);
  }
};

// Funzione per gestire l'inattività e inviare un messaggio automatico
const handleUserInactivity = () => {
  const inactivityLimit = 15 * 60 * 1000; // 15 minuti
  const now = Date.now();

  for (const from in conversations) {
    const user = conversations[from];
    const lastActivityTime = new Date(user.lastActivity).getTime();

    // Se sono passati almeno 15 minuti e non abbiamo già inviato il messaggio automatico
    if (
      now - lastActivityTime >= inactivityLimit &&
      !user.inactivityMessageSent
    ) {
      sendAutomaticMessage(from);
      user.inactivityMessageSent = true;

      // Timer per il messaggio di chiusura dopo altri 15 minuti
      setTimeout(() => {
        sendClosingMessage(from);
      }, inactivityLimit);
    }
  }
};

// Funzione per inviare il messaggio automatico
const sendAutomaticMessage = async (from) => {
  const automaticMessage =
    "Non scrivi da un po'. Se hai bisogno di assistenza, sono qui per aiutarti!";

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.messages.create({
      body: automaticMessage,
      from: "whatsapp:" + process.env.TWILIO_PHONE_NUMBER,
      to: from,
    });

    console.log(`Messaggio automatico inviato a ${from}`);

    // Aggiungi il messaggio automatico alla conversazione
    conversations[from].messages.push({
      direction: "sent",
      content: automaticMessage,
      timestamp: new Date().toISOString(),
      automatic: true,
    });

    // Salva le conversazioni
    saveConversations();
  } catch (error) {
    console.error("Errore nell'invio del messaggio automatico:", error);
  }
};

// Funzione per inviare il messaggio di chiusura
const sendClosingMessage = async (from) => {
  const closingMessage =
    "La conversazione è stata chiusa per inattività. Se hai bisogno, non esitare ricontattarmi 😄";

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.messages.create({
      body: closingMessage,
      from: "whatsapp:" + process.env.TWILIO_PHONE_NUMBER,
      to: from,
    });

    console.log(`Messaggio di chiusura inviato a ${from}`);

    // Aggiungi il messaggio di chiusura alla conversazione
    conversations[from].messages.push({
      direction: "sent",
      content: closingMessage,
      timestamp: new Date().toISOString(),
      automatic: true,
    });

    // Chiudi la conversazione
    closeConversation(from);

    // Salva le conversazioni
    saveConversations();
  } catch (error) {
    console.error("Errore nell'invio del messaggio di chiusura:", error);
  }
};

// Funzione per chiudere formalmente una conversazione
const closeConversation = (from) => {
  conversations[from].closed = true;
  conversations[from].closedAt = new Date().toISOString();
  console.log(`Conversazione con ${from} chiusa per inattività.`);
};

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);

// Route principale (necessario per ngrok)
app.post("/", (req, res) => {
  console.log("Messaggio ricevuto sulla route principale:", req.body);
  req.url = "/webhook";
  app.handle(req, res);
});

// Webhook di Twilio
app.post("/webhook", async (req, res) => {
  console.log("Messaggio ricevuto da Twilio:", req.body);

  const from = req.body.From || "";
  const body = req.body.Body || "";
  const profileName = req.body.ProfileName || "Utente";

  // Salva il messaggio nella conversazione
  if (!conversations[from]) {
    console.log(`Creando nuova conversazione per ${from}`);
    conversations[from] = {
      name: profileName,
      phone: from,
      messages: [],
      created: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
  } else {
    console.log(`Conversazione esistente per ${from}, aggiornando attività`);
    conversations[from].lastActivity = new Date().toISOString();
  }

  // Aggiungi il messaggio ricevuto
  conversations[from].messages.push({
    direction: "received",
    content: body,
    timestamp: new Date().toISOString(),
  });

  // Salva le conversazioni
  saveConversations();

  try {
    // Chiedi la risposta a Gemini
    const aiResponse = await generateAIResponse(body);

    // Salva la risposta AI nella conversazione
    conversations[from].messages.push({
      direction: "sent",
      content: aiResponse,
      timestamp: new Date().toISOString(),
      automatic: false,
    });

    // Salva le conversazioni
    saveConversations();

    // Invia la risposta AI tramite Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${aiResponse}</Message>\n</Response>`;
    console.log("Risposta da inviare a Twilio:", twiml);
    res.set("Content-Type", "text/xml");
    res.send(twiml);

    // Reset dell'inactivityMessageSent quando l'utente invia un messaggio
    conversations[from].inactivityMessageSent = false;

    // Controlla l'inattività dell'utente
    handleUserInactivity(from);
  } catch (error) {
    console.error("Errore nell'elaborazione della risposta AI:", error);
    res.status(500).send("Errore interno del server");
  }
});

// API per ottenere tutte le conversazioni
app.get("/api/conversations", (req, res) => {
  console.log("Oggetto conversations:", conversations);
  const conversationsArray = Object.values(conversations)
    .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
    .map((conv) => ({
      phone: conv.phone,
      name: conv.name,
      lastActivity: conv.lastActivity,
      lastMessage:
        conv.messages.length > 0
          ? conv.messages[conv.messages.length - 1]
          : null,
    }));

  res.json(conversationsArray);
});

// API per ottenere una conversazione specifica
app.get("/api/conversations/:phone", (req, res) => {
  const { phone } = req.params;
  if (conversations[phone]) {
    res.json(conversations[phone]);
  } else {
    res.status(404).json({ error: "Conversazione non trovata" });
  }
});

// API per inviare un messaggio personalizzato
app.post("/api/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res
      .status(400)
      .json({ error: "Telefono e messaggio sono richiesti" });
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.messages.create({
      body: message,
      from: "whatsapp:" + process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    // Aggiungi il messaggio personalizzato alla conversazione
    if (!conversations[phone]) {
      conversations[phone] = {
        messages: [],
      };
    }

    conversations[phone].messages.push({
      direction: "sent",
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Salva le conversazioni
    saveConversations();

    res.json({ status: "Messaggio inviato con successo" });
  } catch (error) {
    console.error("Errore nell'invio del messaggio:", error);
    res.status(500).json({ error: "Errore nell'invio del messaggio" });
  }
});

httpServer.listen(port, () => {
  console.log(`Server avviato su http://localhost:${port}`);
});
