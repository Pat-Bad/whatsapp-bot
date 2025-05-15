/**
 * Modulo per l'integrazione con Google Gemini AI
 * Gestisce la generazione di risposte AI e l'interazione con il sistema RAG
 */

// Importazione delle dipendenze necessarie
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getEmbeddings } from "./rag/pharsingfile.mjs";
import { searchDocumentsForUser } from "./rag/qdrant.mjs";

// Configurazione dei path per ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caricamento delle variabili d'ambiente
dotenv.config({ path: path.join(__dirname, "../../.env") });
console.log("API KEY:", process.env.GEMINI_API_KEY);

// Inizializzazione del client Gemini AI
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
console.log("API KEY presente:", !!process.env.GEMINI_API_KEY);

/**
 * Genera una risposta AI utilizzando Gemini e opzionalmente il sistema RAG
 * @param {string} prompt - Il prompt dell'utente
 * @param {string|null} userPhone - Il numero di telefono dell'utente per il RAG
 * @returns {Promise<string>} La risposta generata
 */
async function generateAIResponse(prompt, userPhone = null) {
  try {
    console.log(
      `Prompt inviato a Gemini per l'utente ${userPhone || "sconosciuto"}:`,
      prompt
    );
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

    let context = "";

    // Integrazione con RAG per utenti specifici
    if (userPhone) {
      try {
        // Generazione embedding per la ricerca semantica
        const queryEmbedding = await getEmbeddings(prompt);

        if (queryEmbedding) {
          // Ricerca documenti pertinenti nel database vettoriale
          const relevantDocs = await searchDocumentsForUser(
            queryEmbedding,
            userPhone,
            3
          );

          if (relevantDocs && relevantDocs.length > 0) {
            console.log(
              `Trovati ${relevantDocs.length} documenti pertinenti per l'utente ${userPhone}`
            );

            // Costruzione del contesto dai documenti trovati
            context = "Informazioni rilevanti dai documenti dell'utente:\n\n";

            relevantDocs.forEach((doc, index) => {
              if (doc.payload && doc.payload.text) {
                context += `Documento ${index + 1} (fonte: ${
                  doc.payload.metadata?.source || "sconosciuta"
                }, pagina: ${doc.payload.metadata?.page || "N/A"}):\n${
                  doc.payload.text
                }\n\n`;
              }
            });

            console.log("Contesto RAG aggiunto alla richiesta");
          } else {
            console.log(
              `Nessun documento pertinente trovato per l'utente ${userPhone}`
            );
          }
        }
      } catch (ragError) {
        console.error("Errore durante la ricerca RAG:", ragError);
        // Fallback a risposta senza RAG in caso di errore
      }
    }

    // Preparazione del prompt finale con contesto RAG
    let finalPrompt = prompt;
    if (context) {
      finalPrompt = `${context}\n\nDomanda dell'utente: ${prompt}\n\nRispondi alla domanda dell'utente utilizzando le informazioni fornite sopra quando pertinenti. Se le informazioni non sono sufficienti, fornisci una risposta generale.`;
    }

    // Aggiunta del vincolo di lunghezza alla risposta
    const promptWithConstraint = `${finalPrompt}\n\nLimita la tua risposta a un massimo di 1500 caratteri.`;

    // Generazione della risposta con Gemini
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptWithConstraint }] }],
    });

    const response = result.response;
    let text = await response.text();

    // Troncamento della risposta se troppo lunga
    if (text.length > 1500) {
      text = text.substring(0, 1500) + "...";
      console.log("Risposta troncata a 1500 caratteri");
    }

    console.log("Risposta Gemini:", text);
    return text;
  } catch (error) {
    console.error("Errore nella generazione della risposta:", error);
    return "Mi dispiace, si è verificato un errore nella generazione della risposta.";
  }
}

/**
 * Configurazione dell'interfaccia CLI per testing
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Funzione principale per l'interazione da console
 * Utilizzata per testing e debugging
 */
async function main() {
  console.log("Benvenuto! Scrivi 'exit' per uscire.");

  const askQuestion = () => {
    rl.question("Inserisci la tua domanda: ", async (prompt) => {
      if (prompt.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      const response = await generateAIResponse(prompt);
      console.log("Risposta del bot:", response);
      askQuestion();
    });
  };

  askQuestion();
}

// Avvio dell'applicazione CLI
main().catch(console.error);

export default generateAIResponse;
