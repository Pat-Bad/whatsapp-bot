import express from "express";
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
  } catch (error) {
    console.error("Errore nel salvataggio delle conversazioni:", error);
  }
};

// Middleware per express per gestire i dati inviati
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());

// Route principale (necessario per ngrok)
app.post("/", (req, res) => {
  console.log("Messaggio ricevuto sulla route principale:", req.body);
  // Reindirizza a /webhook
  req.url = "/webhook";
  app.handle(req, res);
});

// Webhook di Twilio
app.post("/webhook", async (req, res) => {
  console.log("Messaggio ricevuto da Twilio:", req.body);
  
  const from = req.body.From || '';
  const body = req.body.Body || '';
  const profileName = req.body.ProfileName || 'Utente';
  
  // Salva il messaggio nella conversazione
  if (!conversations[from]) {
    conversations[from] = {
      name: profileName,
      phone: from,
      messages: [],
      created: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };
  } else {
    conversations[from].lastActivity = new Date().toISOString();
  }
  
  // Aggiungi il messaggio ricevuto
  conversations[from].messages.push({
    direction: 'received',
    content: body,
    timestamp: new Date().toISOString()
  });
  
  // Salva le conversazioni
  saveConversations();
  
  try {
    // Chiedi la risposta a Gemini
    const aiResponse = await generateAIResponse(body);

    // Salva la risposta AI nella conversazione
    conversations[from].messages.push({
      direction: 'sent',
      content: aiResponse,
      timestamp: new Date().toISOString(),
      automatic: false
    });
    saveConversations();

    // Invia la risposta AI tramite Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${aiResponse}</Message>\n</Response>`;
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  } catch (error) {
    console.error("Errore nell'elaborazione della risposta AI:", error);
    res.status(500).send("Errore interno del server");
  }
});

// API per ottenere tutte le conversazioni
app.get("/api/conversations", (req, res) => {
  // Converte l'oggetto conversazioni in un array ordinato per attività recente
  const conversationsArray = Object.values(conversations)
    .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
    .map(conv => ({
      phone: conv.phone,
      name: conv.name,
      lastActivity: conv.lastActivity,
      lastMessage: conv.messages[conv.messages.length - 1]
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
    return res.status(400).json({ error: "Telefono e messaggio sono richiesti" });
  }
  
  try {
    // Configura client Twilio
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // Invia il messaggio tramite Twilio
    await client.messages.create({
      body: message,
      from: 'whatsapp:' + process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    
    // Aggiorna la conversazione
    if (conversations[phone]) {
      conversations[phone].lastActivity = new Date().toISOString();
      conversations[phone].messages.push({
        direction: 'sent',
        content: message,
        timestamp: new Date().toISOString(),
        automatic: false
      });
      
      // Salva le conversazioni
      saveConversations();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Errore nell'invio del messaggio:", error);
    res.status(500).json({ error: `Errore nell'invio del messaggio: ${error.message}` });
  }
});

// Avvio del server
app.listen(port, () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});
