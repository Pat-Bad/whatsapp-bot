# WHAIx2 - Bot WhatsApp con Intelligenza Artificiale

![Versione](https://img.shields.io/badge/versione-1.0.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-4-646CFF?logo=vite)
![Twilio](https://img.shields.io/badge/Twilio-API-F22F46?logo=twilio)
![Google Gemini](https://img.shields.io/badge/Google-Gemini%20AI-4285F4?logo=google)

Un bot WhatsApp avanzato che utilizza l'intelligenza artificiale di Google Gemini per generare risposte automatiche alle conversazioni. Integrazione completa con Twilio per la gestione dei messaggi WhatsApp e interfaccia web per monitorare e gestire le conversazioni.

## 📑 Indice

- [Panoramica](#panoramica)
- [Funzionalità](#funzionalità)
- [Tecnologie](#tecnologie)
- [Prerequisiti](#prerequisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Architettura](#architettura)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Workflow](#workflow)
- [Sviluppo](#sviluppo)
- [Licenza](#licenza)

## 🔍 Panoramica

WHAIx2 è un sistema completo per automatizzare e gestire conversazioni WhatsApp utilizzando intelligenza artificiale avanzata. Il sistema riceve messaggi tramite webhook Twilio, li elabora con modelli AI di Google Gemini e genera risposte automatiche contestuali.

## ✨ Funzionalità

- **Integrazione WhatsApp**: Ricezione e invio di messaggi WhatsApp tramite API Twilio
- **Risposte AI**: Generazione automatica di risposte utilizzando Google Gemini AI
- **Archiviazione Conversazioni**: Memorizzazione e gestione di tutte le conversazioni
- **Dashboard Web**: Interfaccia di amministrazione per monitorare e gestire le conversazioni
- **Autenticazione**: Sistema di login per proteggere l'accesso all'interfaccia amministrativa
- **Ricerca Avanzata**: Utilizzo di RAG (Retrieval Augmented Generation) per risposte contestualizzate
- **Personalizzazione**: Possibilità di inviare messaggi personalizzati tramite dashboard

## 🛠️ Tecnologie

- **Frontend**: React, Vite, CSS moderno
- **Backend**: Node.js, Express
- **AI**: Google Gemini API
- **Messaging**: Twilio WhatsApp API
- **Vector DB**: Qdrant per funzionalità RAG
- **Tunneling**: Ngrok per esposizione webhook

## 📋 Prerequisiti

- Node.js (v16+)
- Account Twilio con API WhatsApp abilitata
- Chiave API Google Gemini
- Ngrok per lo sviluppo locale

## 📥 Installazione

```bash
# Clona il repository
git clone https://github.com/Pat-Bad/whatsapp-bot.git
cd whatsapp-bot

# Installa le dipendenze
npm install
```

## ⚙️ Configurazione

Crea un file `.env` nella directory principale con le seguenti variabili:

```env
# Twilio
TWILIO_ACCOUNT_SID=il_tuo_sid
TWILIO_AUTH_TOKEN=il_tuo_token
TWILIO_PHONE_NUMBER=il_tuo_numero_whatsapp

# Server
PORT=3000

# UI Auth
VITE_APP_USR_UI=admin
VITE_APP_PWD_UI=password

# Google Gemini AI
GEMINI_API_KEY=la_tua_chiave_api_gemini
```

## 🚀 Utilizzo

### Avvio del server

```bash
# Avvio in modalità sviluppo
npm run dev

# Oppure in produzione
npm run build
npm run start
```

### Configurazione webhook Twilio

1. Avvia Ngrok per esporre il server locale: `./ngrok http 3000`
2. Configura il webhook Twilio WhatsApp con l'URL Ngrok: `https://tuo-tunnel.ngrok.io/webhook`

## 🏗️ Architettura

### Backend

Il backend è costruito su Node.js con Express e gestisce:

- **Webhook Twilio**: Ricezione messaggi WhatsApp (`/webhook`)
- **Elaborazione AI**: Integrazione con Google Gemini per generare risposte
- **Archiviazione**: Salvataggio conversazioni in memoria e su file JSON
- **API RESTful**:
  - `GET /api/conversations`: Lista di tutte le conversazioni
  - `GET /api/conversations/:phone`: Dettagli conversazione specifica
  - `POST /api/send`: Invio messaggi personalizzati
  - `POST /api/login`: Autenticazione dashboard

### Frontend

L'interfaccia React include:

- **Autenticazione**: Schermata di login per accedere alla dashboard
- **Dashboard**: Visualizzazione e gestione di tutte le conversazioni
- **Dettaglio Conversazione**: Visualizzazione cronologia messaggi
- **Invio Messaggi**: Interfaccia per inviare messaggi personalizzati

## 🔄 Workflow

1. **Ricezione Messaggio**:
   - Utente invia messaggio via WhatsApp
   - Twilio inoltra il messaggio al webhook dell'applicazione

2. **Elaborazione**:
   - Il server riceve il messaggio e lo salva
   - Il contesto della conversazione viene recuperato
   - La query viene elaborata tramite sistema RAG se necessario

3. **Generazione Risposta**:
   - Il messaggio e il contesto vengono inviati a Google Gemini
   - L'AI genera una risposta appropriata

4. **Invio Risposta**:
   - La risposta viene inviata all'utente tramite Twilio
   - La conversazione viene aggiornata con la nuova risposta

5. **Monitoraggio**:
   - Amministratori possono visualizzare tutte le conversazioni nella dashboard
   - Possibilità di intervenire manualmente quando necessario

## 👨‍💻 Sviluppo

### Struttura del progetto

```
whatsapp-bot/
├── src/
│   ├── assets/           # Risorse statiche
│   ├── backend/          # Server e logica backend
│   │   ├── rag/          # Sistema Retrieval Augmented Generation
│   │   └── temp/         # File temporanei
│   ├── components/       # Componenti React
│   └── data/             # Dati e configurazioni
├── .env                  # Variabili d'ambiente (da creare)
└── package.json          # Dipendenze e script
```

### Estensione

Per estendere le funzionalità del bot:

1. Modifica `src/backend/gemini.mjs` per personalizzare il comportamento AI
2. Aggiorna `src/backend/rag/pharsingfile.mjs` per migliorare il retrieval
3. Aggiungi nuovi endpoint in `src/backend/server.mjs`
4. Estendi l'interfaccia utente in `src/components/Manager.jsx`
