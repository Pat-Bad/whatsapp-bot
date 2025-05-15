/**
 * Server principale per l'applicazione WhatsApp Bot
 * Gestisce le comunicazioni via WhatsApp, il salvataggio delle conversazioni
 * e l'integrazione con servizi esterni come Twilio e AI
 */

// Importazione delle dipendenze necessarie
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
import multer from "multer";
import { handleFileUpload } from "./rag/pharsingfile.mjs";
import { getDocumentsForUser } from "./rag/qdrant.mjs";

/**
 * Configurazione dei path e delle directory
 * Utilizza fileURLToPath per gestire correttamente i path in ambiente ES modules
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

// Inizializzazione delle variabili d'ambiente
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);

// Creazione della directory data se non esiste
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Configurazione del server Express e Socket.IO
 * Imposta CORS per permettere le richieste dal frontend
 */
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
const port = process.env.PORT || 3000;
const conversations = {}; // Storage in-memory per le conversazioni

/**
 * Caricamento delle conversazioni esistenti dal file JSON
 * Se il file non esiste o c'è un errore, parte con un oggetto vuoto
 */
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

/**
 * Funzione per salvare le conversazioni su file
 * Viene chiamata dopo ogni modifica alle conversazioni
 */
const saveConversations = () => {
  try {
    const conversationsFile = path.join(dataDir, "conversations.json");
    fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2));
    console.log("Conversazioni salvate con successo");
  } catch (error) {
    console.error("Errore nel salvataggio delle conversazioni:", error);
  }
};

/**
 * Funzione per inviare messaggi tramite Twilio
 * Gestisce il troncamento dei messaggi lunghi e gli errori comuni
 * @param {string} to - Numero di telefono del destinatario
 * @param {string} message - Contenuto del messaggio
 * @returns {Promise<boolean>} - True se l'invio ha successo, false altrimenti
 */
const sendTwilioMessage = async (to, message) => {
  try {
    // Gestione messaggi lunghi
    if (message.length > 1500) {
      console.warn("Messaggio troppo lungo, verrà troncato a 1500 caratteri");
      message = message.substring(0, 1500) + "...";
    }

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const twilioFromNumber = "whatsapp:" + process.env.TWILIO_PHONE_NUMBER;
    console.log(`Invio messaggio da ${twilioFromNumber} a ${to}`);

    await client.messages.create({
      body: message,
      from: twilioFromNumber,
      to: to,
    });

    console.log(`Messaggio inviato a ${to}: ${message.substring(0, 50)}...`);
    return true;
  } catch (error) {
    console.error("Errore nell'invio del messaggio tramite Twilio:", error);

    // Gestione errori specifici
    if (error.code === 63007) {
      console.error(
        "ERRORE: Impossibile trovare il Channel con l'indirizzo From specificato"
      );
    } else if (error.code === 21617) {
      console.error("ERRORE: Il messaggio supera il limite di 1600 caratteri");
    }

    return false;
  }
};

/**
 * Sistema di gestione dell'inattività degli utenti
 * Invia messaggi automatici dopo 15 minuti di inattività
 * Chiude la conversazione dopo altri 15 minuti
 */
const handleUserInactivity = () => {
  const inactivityLimit = 15 * 60 * 1000; // 15 minuti
  const now = Date.now();

  for (const from in conversations) {
    const user = conversations[from];
    const lastActivityTime = new Date(user.lastActivity).getTime();

    if (
      now - lastActivityTime >= inactivityLimit &&
      !user.inactivityMessageSent &&
      !user.closed
    ) {
      sendAutomaticMessage(from);
      user.inactivityMessageSent = true;

      setTimeout(() => {
        sendClosingMessage(from);
      }, inactivityLimit);
    }
  }
};

/**
 * Funzione per inviare il messaggio di inattività
 * @param {string} from - Numero di telefono dell'utente
 */
const sendAutomaticMessage = async (from) => {
  const automaticMessage =
    "Non scrivi da un po'. Se hai bisogno di assistenza, sono qui per aiutarti!";

  try {
    await sendTwilioMessage(from, automaticMessage);

    if (!conversations[from]) {
      conversations[from] = { messages: [] };
    }

    conversations[from].messages.push({
      direction: "sent",
      content: automaticMessage,
      timestamp: new Date().toISOString(),
      automatic: true,
    });

    saveConversations();
  } catch (error) {
    console.error("Errore nell'invio del messaggio automatico:", error);
  }
};

/**
 * Funzione per inviare il messaggio di chiusura conversazione
 * @param {string} from - Numero di telefono dell'utente
 */
const sendClosingMessage = async (from) => {
  const closingMessage =
    "La conversazione è stata chiusa per inattività. Se hai bisogno, non esitare a ricontattarmi 😄";

  try {
    await sendTwilioMessage(from, closingMessage);

    if (!conversations[from]) {
      conversations[from] = { messages: [] };
    }

    conversations[from].messages.push({
      direction: "sent",
      content: closingMessage,
      timestamp: new Date().toISOString(),
      automatic: true,
    });

    closeConversation(from);
    saveConversations();
  } catch (error) {
    console.error("Errore nell'invio del messaggio di chiusura:", error);
  }
};

/**
 * Funzione per chiudere formalmente una conversazione
 * @param {string} from - Numero di telefono dell'utente
 */
const closeConversation = (from) => {
  conversations[from].closed = true;
  conversations[from].closedAt = new Date().toISOString();
  console.log(`Conversazione con ${from} chiusa per inattività.`);
};

// Avvia il controllo dell'inattività ogni minuto
setInterval(handleUserInactivity, 60 * 1000);

// Configurazione middleware Express
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);

/**
 * Webhook per la gestione dei messaggi WhatsApp
 * Processa i messaggi in arrivo e genera risposte automatiche o manuali
 */
app.post("/webhook", async (req, res) => {
  try {
    const messageText = req.body.Body;
    const userPhone = req.body.From;

    if (!messageText) {
      console.log("Messaggio vuoto o non valido");
      return res.sendStatus(200);
    }

    console.log(`Messaggio ricevuto da ${userPhone}: ${messageText}`);

    // Aggiorna la conversazione in memoria
    if (!conversations[userPhone]) {
      conversations[userPhone] = {
        phone: userPhone,
        messages: [],
        lastActivity: new Date().toISOString(),
        inactivityMessageSent: false,
        closed: false,
      };
    }

    conversations[userPhone].messages.push({
      direction: "received",
      content: messageText,
      timestamp: new Date().toISOString(),
    });
    conversations[userPhone].lastActivity = new Date().toISOString();
    conversations[userPhone].inactivityMessageSent = false; // Reset dopo attività
    conversations[userPhone].closed = false;

    saveConversations();

    // Generazione della risposta AI
    const response = await generateAIResponse(messageText, userPhone);

    // Invio della risposta via Twilio
    await client.messages.create({
      body: response,
      from: "whatsapp:" + process.env.TWILIO_PHONE_NUMBER,
      to: userPhone,
    });

    conversations[userPhone].messages.push({
      direction: "sent",
      content: response,
      timestamp: new Date().toISOString(),
    });

    saveConversations();
  } catch (error) {
    console.error("Errore nella gestione del webhook:", error);
    res.sendStatus(500);
  }
});

/**
 * Endpoint per upload PDF
 * Riceve file PDF via multipart/form-data
 * Salva il file e attiva la funzione di parsing per indicizzazione
 */
// Configurazione di multer per il caricamento dei file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Crea la directory temporanea se non esiste
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Genera un nome file univoco
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

// Filtra per accettare solo PDF
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Solo file PDF sono supportati"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite di 10MB
});

// API per caricare un file PDF e associarlo a un utente
app.post("/api/upload-pdf", upload.single("pdfFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Nessun file caricato" });
    }

    const organizationId = req.body.organizationId;
    if (!organizationId) {
      return res
        .status(400)
        .json({ success: false, message: "OrganizationId non specificato" });
    }

    console.log(
      `File ricevuto: ${req.file.originalname} per organizationId: ${organizationId}`
    );

    // Il percorso del file temporaneo
    const tempPath = req.file.path;

    // Elabora il file e carica su Qdrant
    const result = await handleFileUpload(req.file, tempPath, organizationId);

    return res.json({
      success: result.success,
      message: result.message,
      recordsCount: result.recordsCount || 0,
      fileName: req.file.originalname,
    });
  } catch (error) {
    console.error("Errore durante l'upload del file:", error);
    return res.status(500).json({
      success: false,
      message: `Errore durante l'elaborazione: ${error.message}`,
    });
  }
});
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

/**
 * Endpoint per recuperare le conversazioni di un utente
 * Restituisce l'array dei messaggi per il numero richiesto
 */
app.get("/api/conversations/:phone", (req, res) => {
  const { phone } = req.params;
  if (conversations[phone]) {
    res.json(conversations[phone]);
  } else {
    res.status(404).json({ error: "Conversazione non trovata" });
  }
});
app.post("/api/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res
      .status(400)
      .json({ error: "Telefono e messaggio sono richiesti" });
  }

  try {
    await sendTwilioMessage(phone, message);

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

/**
 * Endpoint per recuperare i documenti indicizzati per un utente
 */
app.get("/api/documents/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;
    console.log(`Richiesta documenti per l'utente: ${phone}`);

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "ID utente non specificato" });
    }

    // Ottieni i documenti per l'utente
    const documents = await getDocumentsForUser(phone);
    console.log(`Documenti trovati: ${documents.length || 0}`);

    return res.json({
      success: true,
      documents: documents || [],
      message: `Recuperati ${documents.length || 0} documenti`,
    });
  } catch (error) {
    console.error("Errore nel recupero dei documenti:", error);
    return res.status(500).json({
      success: false,
      message: `Errore nel recupero dei documenti: ${error.message}`,
    });
  }
});

// In server.mjs, aggiungi queste funzioni
const settingsFile = path.join(dataDir, "settings.json");
let appSettings = {
  responseMode: "auto",
  defaultResponse:
    "Grazie per il tuo messaggio! Un operatore ti risponderà a breve.",
};

// Carica le impostazioni dal file se esiste
try {
  if (fs.existsSync(settingsFile)) {
    appSettings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  }
} catch (error) {
  console.error("Errore nel caricamento delle impostazioni:", error);
}

// Funzione per ottenere le impostazioni
async function getSettings() {
  return appSettings;
}

// Salva le impostazioni su file
const saveSettings = () => {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(appSettings, null, 2));
  } catch (error) {
    console.error("Errore nel salvataggio delle impostazioni:", error);
  }
};

// Endpoint per ottenere le impostazioni
app.get("/api/settings", (req, res) => {
  res.json(appSettings);
});

// Endpoint per aggiornare le impostazioni
app.post("/api/settings", (req, res) => {
  if (req.body.responseMode !== undefined) {
    appSettings.responseMode = req.body.responseMode;
  }
  if (req.body.defaultResponse !== undefined) {
    appSettings.defaultResponse = req.body.defaultResponse;
  }
  saveSettings();
  res.json(appSettings);
});

httpServer.listen(port, () => {
  console.log(`Server avviato su http://localhost:${port}`);
});
