/**
 * Server principale per l'applicazione WhatsApp Bot
 * Gestisce le comunicazioni via WhatsApp, il salvataggio delle conversazioni
 * e l'integrazione con servizi esterni come Twilio e AI
 * 
 * NOTA IMPORTANTE: Questo server utilizza il numero della Sandbox WhatsApp di Twilio (+14155238886)
 * per inviare e ricevere messaggi. Assicurarsi di aver attivato la sandbox su:
 * https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-sandbox
 * e di aver inviato il messaggio di attivazione dal proprio WhatsApp.
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
import fetch from "node-fetch"; // Per chiamate HTTP dirette

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
 * @param {string} from - Numero di telefono mittente (optional, utilizza TWILIO_PHONE_NUMBER se non specificato)
 * @returns {Promise<boolean>} - True se l'invio ha successo, false altrimenti
 */
const sendTwilioMessage = async (to, message, from = null) => {
  try {
    if (!to || !message) {
      console.error("Errore: numero di telefono o messaggio mancante");
      return false;
    }
    
    // Assicurati che 'to' abbia il prefisso whatsapp: se non è già presente
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    // Gestione messaggi lunghi
    if (message.length > 1500) {
      console.warn("Messaggio troppo lungo, verrà troncato a 1500 caratteri");
      message = message.substring(0, 1500) + "...";
    }

    // Assicurati che il client sia correttamente inizializzato con credenziali valide
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.error("Credenziali Twilio mancanti");
      return false;
    }
    
    // Crea una nuova istanza del client per ogni chiamata
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    // Assicurati che il numero di telefono Twilio sia formattato correttamente
    // CORREZIONE: Usa il numero da cui è arrivato il messaggio come mittente se fornito
    const twilioNumber = from || process.env.TWILIO_PHONE_NUMBER;
    const fromFormatted = twilioNumber.startsWith('whatsapp:') 
      ? twilioNumber 
      : `whatsapp:${twilioNumber}`;
      
    console.log(`Invio messaggio da ${fromFormatted} a ${toFormatted}`);
    console.log(`Contenuto messaggio: "${message}"`);

    // Invia il messaggio e attendi la risposta
    const messageResponse = await client.messages.create({
      body: message,
      from: fromFormatted,
      to: toFormatted,
    });

    console.log(`Messaggio inviato con SID: ${messageResponse.sid}`);
    console.log(`Messaggio inviato a ${toFormatted}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    return true;
  } catch (error) {
    console.error("Errore nell'invio del messaggio tramite Twilio:", error);

    // Log dettagliato dell'errore
    console.error("Codice errore:", error.code);
    console.error("Messaggio errore:", error.message);
    
    if (error.moreInfo) {
      console.error("Ulteriori informazioni:", error.moreInfo);
    }

    // Gestione errori specifici
    if (error.code === 63007) {
      console.error(
        "ERRORE: Impossibile trovare il Channel con l'indirizzo From specificato. Verifica che il tuo account Twilio sia correttamente configurato per WhatsApp e che il numero sia registrato nel sandbox WhatsApp di Twilio."
      );
    } else if (error.code === 21617) {
      console.error("ERRORE: Il messaggio supera il limite di 1600 caratteri");
    } else if (error.code === 21211) {
      console.error("ERRORE: Numero di telefono invalido. Verifica il formato del numero.");
    } else if (error.code === 20003) {
      console.error("ERRORE: Autenticazione fallita. Verifica le tue credenziali TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN.");
    } else if (error.code === 21608) {
      console.error("ERRORE: Il numero di telefono WhatsApp non è stato trovato o non è stato confermato nella sandbox.");
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
    // Usa il numero ufficiale della sandbox WhatsApp di Twilio come mittente
    const sandboxNumber = "whatsapp:+14155238886"; // Numero ufficiale della Sandbox WhatsApp di Twilio
    await sendTwilioMessage(from, automaticMessage, sandboxNumber);

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
    // Usa il numero ufficiale della sandbox WhatsApp di Twilio come mittente
    const sandboxNumber = "whatsapp:+14155238886"; // Numero ufficiale della Sandbox WhatsApp di Twilio
    await sendTwilioMessage(from, closingMessage, sandboxNumber);

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
    // Invia una risposta immediata a Twilio per evitare timeout
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
    console.log("Webhook ricevuto da Twilio:", JSON.stringify(req.body));
    
    const messageText = req.body.Body;
    const userPhone = req.body.From;
    const twilioNumber = req.body.To; // Cattura il numero Twilio da cui è arrivato il messaggio

    if (!messageText) {
      console.log("Messaggio vuoto o non valido");
      return;
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

    // Invia messaggio "sto pensando" dopo 7 secondi se la risposta non è ancora pronta
    let thinkingMessageSent = false;
    const thinkingTimeout = setTimeout(async () => {
      try {
        console.log("Invio messaggio 'sto pensando'...");
        await sendTwilioMessage(
          userPhone,
          "Sto pensando alla risposta, dammi qualche secondo...",
          twilioNumber // Usa il numero da cui è arrivato il messaggio
        );
        thinkingMessageSent = true;
      } catch (timeoutError) {
        console.error("Errore nell'invio del messaggio di attesa:", timeoutError);
      }
    }, 7000);

    // Generazione della risposta AI con gestione errori migliorata
    let response;
    try {
      console.log("Chiamata a generateAIResponse con prompt:", messageText);
      response = await generateAIResponse(messageText, userPhone);
      console.log("Risposta ricevuta da generateAIResponse:", response);
      
      if (!response || response.trim() === "") {
        console.error("Risposta vuota da Gemini, uso risposta di fallback");
        response = "Mi dispiace, non sono riuscito a generare una risposta. Posso aiutarti in altro modo?";
      }
    } catch (aiError) {
      console.error("Errore critico nella generazione della risposta AI:", aiError);
      response = "Mi dispiace, si è verificato un errore nella generazione della risposta. Posso aiutarti in altro modo?";
    }

    // Cancella il timeout del messaggio "sto pensando" se non ancora inviato
    clearTimeout(thinkingTimeout);

    // Aspetta un momento se è stato inviato il messaggio "sto pensando" per evitare sovrapposizioni
    if (thinkingMessageSent) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Invio della risposta via Twilio con gestione errori robusta
    try {
      console.log(`Tentativo di invio risposta a ${userPhone} tramite Twilio...`);
      const sent = await sendTwilioMessage(userPhone, response, twilioNumber); // Usa il numero da cui è arrivato il messaggio
      
      if (sent) {
        console.log(`✅ Risposta inviata con successo a ${userPhone}`);
      } else {
        console.error(`❌ Invio risposta fallito a ${userPhone}`);
      }
    } catch (twilioError) {
      console.error("Errore nell'invio della risposta tramite Twilio:", twilioError);
      // Tentativo aggiuntivo con messaggio di errore in caso di fallimento
      try {
        await sendTwilioMessage(
          userPhone,
          "Mi dispiace, si è verificato un errore nell'invio della risposta. Per favore, riprova più tardi.",
          twilioNumber // Usa il numero da cui è arrivato il messaggio
        );
      } catch (retryError) {
        console.error("Anche il tentativo di invio del messaggio di errore è fallito:", retryError);
      }
    }

    // Aggiorna la conversazione con la risposta
    conversations[userPhone].messages.push({
      direction: "sent",
      content: response,
      timestamp: new Date().toISOString(),
    });

    saveConversations();
  } catch (error) {
    console.error("Errore nella gestione del webhook:", error);
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
    // Usa il numero ufficiale della sandbox WhatsApp di Twilio come mittente
    const sandboxNumber = "whatsapp:+14155238886"; // Numero ufficiale della Sandbox WhatsApp di Twilio
    await sendTwilioMessage(phone, message, sandboxNumber);

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

// Funzione per recuperare documenti direttamente tramite API HTTP di Qdrant
async function fetchDocumentsDirectly(organizationId) {
  console.log(`🔄 Tentativo recupero diretto documenti per: ${organizationId}`);
  
  // Ottieni URL e API key dalle variabili d'ambiente
  const qdrantUrl = process.env.QDRANT_URL?.replace(/\/+$/, "");
  const apiKey = process.env.QDRANT_API_KEY;
  
  if (!qdrantUrl || !apiKey) {
    console.error("❌ Credenziali Qdrant mancanti per chiamata diretta");
    return [];
  }

  try {
    // Configurazione della richiesta
    const normalizedId = organizationId.replace(/[^a-zA-Z0-9+:\-]/g, "_");
    
    const requestBody = {
      filter: {
        must: [
          {
            key: "organizationId",
            match: {
              value: normalizedId
            }
          }
        ]
      },
      limit: 100,
      with_payload: true,
      with_vectors: false
    };
    
    console.log(`🔗 Chiamata a ${qdrantUrl}/collections/documenti/points/scroll`);
    
    // Effettua la richiesta HTTP direttamente
    const response = await fetch(`${qdrantUrl}/collections/documenti/points/scroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': apiKey
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Errore HTTP: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.result && data.result.points && data.result.points.length > 0) {
      console.log(`✅ Recuperati ${data.result.points.length} documenti con API diretta`);
      return data.result.points;
    } else {
      console.log("ℹ️ Nessun documento trovato con API diretta");
      return [];
    }
  } catch (error) {
    console.error(`❌ Errore nella richiesta HTTP diretta: ${error.message}`);
    return [];
  }
}

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

    // Ottieni i documenti per l'utente provando vari metodi
    let documentsRaw = await getDocumentsForUser(phone);
    
    // Se il metodo standard fallisce, prova con la chiamata HTTP diretta
    if (!documentsRaw || documentsRaw.length === 0) {
      console.log("🔄 Il metodo standard ha fallito, tentativo con API diretta...");
      documentsRaw = await fetchDocumentsDirectly(phone);
    }
    
    console.log(`Documenti trovati: ${documentsRaw.length || 0}`);

    // Trasforma i documenti in un formato più utile per l'interfaccia utente
    // Raggruppa i chunks per nome documento
    const documentMap = {};
    for (const doc of documentsRaw) {
      const source = doc.payload?.metadata?.source;
      
      if (!documentMap[source]) {
        documentMap[source] = {
          source,
          chunks: 0,
          lastUpdated: doc.payload?.metadata?.timestamp || new Date().toISOString(),
        };
      }
      
      documentMap[source].chunks += 1;
    }
    
    // Converti la mappa in un array
    const formattedDocuments = Object.values(documentMap);

    return res.json({
      success: true,
      documents: formattedDocuments || [],
      message: `Recuperati ${documentsRaw.length || 0} chunks da ${formattedDocuments.length} documenti`,
    });
  } catch (error) {
    console.error("❌ Errore durante il recupero dei documenti:", error);
    
    // Log dettagliato dell'errore per il debug
    if (error.response) {
      console.error("Dettagli errore dal server:", error.response.data);
      console.error("Stato HTTP:", error.response.status);
    }
    
    return res.status(500).json({
      success: false,
      message: `Errore nel recupero dei documenti: ${error.message}`,
      details: error.response?.data || null,
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

/**
 * Verifica le configurazioni e le dipendenze all'avvio
 * Controlla tutte le variabili d'ambiente, connessioni e dipendenze necessarie
 */
async function checkDependencies() {
  console.log("🔍 Verificando configurazioni e dipendenze...");
  let isConfigValid = true;

  // Verifica variabili d'ambiente Twilio
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.error("❌ Manca TWILIO_ACCOUNT_SID nel file .env");
    isConfigValid = false;
  } else {
    console.log("✅ TWILIO_ACCOUNT_SID configurato");
  }

  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.error("❌ Manca TWILIO_AUTH_TOKEN nel file .env");
    isConfigValid = false;
  } else {
    console.log("✅ TWILIO_AUTH_TOKEN configurato");
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    console.error("❌ Manca TWILIO_PHONE_NUMBER nel file .env");
    isConfigValid = false;
  } else {
    // Verifica formato del numero WhatsApp
    const formattedNumber = process.env.TWILIO_PHONE_NUMBER.startsWith('whatsapp:') 
      ? process.env.TWILIO_PHONE_NUMBER 
      : `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;
    console.log(`✅ TWILIO_PHONE_NUMBER configurato: ${formattedNumber}`);
  }

  // Verifica API key Gemini
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Manca GEMINI_API_KEY nel file .env");
    isConfigValid = false;
  } else {
    console.log(`✅ GEMINI_API_KEY configurata: ${process.env.GEMINI_API_KEY.substring(0, 4)}...`);
  }

  // Verifica credenziali Qdrant
  if (!process.env.QDRANT_URL) {
    console.error("❌ Manca QDRANT_URL nel file .env");
    isConfigValid = false;
  } else {
    console.log(`✅ QDRANT_URL configurato: ${process.env.QDRANT_URL}`);
  }

  if (!process.env.QDRANT_API_KEY) {
    console.error("❌ Manca QDRANT_API_KEY nel file .env");
    isConfigValid = false;
  } else {
    console.log(`✅ QDRANT_API_KEY configurata: ${process.env.QDRANT_API_KEY.substring(0, 4)}...`);
  }

  // Test connessione Twilio
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const accounts = await client.api.accounts.list({limit: 1});
    console.log("✅ Connessione a Twilio verificata con successo");
    
    // Verifica configurazione WhatsApp
    try {
      // Ottieni informazioni sui canali WhatsApp associati all'account
      const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
      const formattedNumber = phoneNumber.startsWith('whatsapp:') 
        ? phoneNumber 
        : `whatsapp:${phoneNumber}`;
      
      // Controlla se il numero è nel formato corretto per WhatsApp
      console.log(`🔍 Verifica numero WhatsApp: ${formattedNumber}`);
      
      // Verifica se è configurato per WhatsApp Sandbox
      console.log("\n⚠️ IMPORTANTE: Verifica questi punti se hai problemi con WhatsApp:");
      console.log("1. Hai registrato il tuo numero nel Sandbox WhatsApp di Twilio?");
      console.log("2. Hai seguito le istruzioni per l'attivazione del Sandbox su https://www.twilio.com/console/sms/whatsapp/sandbox");
      console.log("3. Hai inviato il codice di attivazione al numero WhatsApp di Twilio?");
      console.log("4. In caso di errore 63007, verifica che il tuo account sia attivo per WhatsApp Business API\n");
    } catch (whatsappError) {
      console.warn("⚠️ Impossibile verificare la configurazione WhatsApp:", whatsappError.message);
    }
  } catch (error) {
    console.error("❌ Errore di connessione a Twilio:", error.message);
    isConfigValid = false;
  }
  
  // Log informazioni di sistema
  console.log("\n🖥️ Informazioni di sistema:");
  console.log(`Sistema operativo: ${process.platform} ${process.arch}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Directory di lavoro: ${process.cwd()}`);
  
  // Verifica percorsi directory fondamentali
  if (!fs.existsSync(dataDir)) {
    console.warn("⚠️ Directory data non trovata, verrà creata");
  }
  
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    console.warn("⚠️ Directory temp non trovata, verrà creata");
    fs.mkdirSync(tempDir, { recursive: true });
  }

  if (isConfigValid) {
    console.log("\n✅ Tutte le verifiche completate con successo!");
  } else {
    console.error("\n⚠️ Alcune verifiche hanno rilevato problemi. Potrebbero esserci malfunzionamenti.");
  }
  
  return isConfigValid;
}

// Avvia il server dopo la verifica delle dipendenze
checkDependencies().then((isValid) => {
  httpServer.listen(port, () => {
    console.log(`\n🚀 Server avviato su http://localhost:${port}`);
    console.log("📱 Pronto per gestire messaggi WhatsApp");
    
    if (!isValid) {
      console.warn("⚠️ Server avviato con errori di configurazione, alcune funzionalità potrebbero non essere disponibili");
    }
  });
});
