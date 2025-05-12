# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and
some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react)
  uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc)
  uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript
with type-aware lint rules enabled. Check out the
[TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts)
for information on how to integrate TypeScript and
[`typescript-eslint`](https://typescript-eslint.io) in your project.

## Logica dell'Applicazione WhatsApp Bot

### Backend (server.mjs)

Il file `server.mjs` implementa un server Express che gestisce le interazioni
con WhatsApp tramite Twilio. Ecco le principali funzionalità:

- **Gestione Webhook**: Riceve messaggi WhatsApp attraverso webhook Twilio
- **Archiviazione Conversazioni**: Salva tutte le conversazioni in memoria e su
  file JSON
- **Integrazione AI**: Genera risposte automatiche utilizzando Gemini AI
- **API RESTful**:
  - `GET /api/conversations` - Ottiene tutte le conversazioni
  - `GET /api/conversations/:phone` - Ottiene una conversazione specifica
  - `POST /api/send` - Invia messaggi personalizzati tramite Twilio

Il server mantiene le conversazioni organizzate per numero di telefono, salvando
sia i messaggi ricevuti che quelli inviati con relativi timestamp.

### Integrazione AI (gemini.mjs)

Il file `gemini.mjs` gestisce l'integrazione con Google Gemini AI:

- Utilizza la libreria ufficiale `@google/genai` per comunicare con l'API Gemini
- Implementa la funzione `generateAIResponse` che accetta un prompt e
  restituisce la risposta generata dall'AI
- Utilizza il modello `gemini-2.0-flash` per generare risposte rapide
- Include funzionalità di test tramite console per interagire direttamente con
  l'AI

L'integrazione richiede una chiave API Gemini valida configurata nelle variabili
d'ambiente.

Crea file .env con variabili

TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_PHONE_NUMBER=

(classica port 3000 per il server) PORT=

(credenziali se vuoi usare UI ) VITE_APP_USR_UI VITE_APP_PWD_UI

(gratuita per la maggior parte. Serve per far funzionare chiamate gemini)

GEMINI_API_KEY

---
