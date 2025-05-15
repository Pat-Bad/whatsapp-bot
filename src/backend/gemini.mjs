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
    
    // Verifica validità API key Gemini
    if (!process.env.GEMINI_API_KEY) {
      console.error("ERRORE: API key Gemini non configurata");
      return "Mi dispiace, si è verificato un errore di configurazione. L'assistente non è disponibile al momento.";
    }
    
    // Inizializza il modello con timeout
    const model = ai.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 800, // Limita la lunghezza della risposta
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
    });

    let context = "";
    let ragFailed = false;

    // Integrazione con RAG per utenti specifici
    if (userPhone) {
      try {
        console.log("Tentativo di recupero contesto RAG per l'utente:", userPhone);
        
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

            console.log("Contesto RAG aggiunto alla richiesta:", context.substring(0, 150) + "...");
          } else {
            console.log(
              `Nessun documento pertinente trovato per l'utente ${userPhone}`
            );
            ragFailed = true;
          }
        } else {
          console.log("Impossibile generare embedding per la query");
          ragFailed = true;
        }
      } catch (ragError) {
        console.error("Errore durante la ricerca RAG:", ragError);
        console.error("Stack trace:", ragError.stack);
        ragFailed = true;
        // Non interrompere l'esecuzione, procedi senza contesto RAG
      }
    }

    // Preparazione del prompt finale con o senza contesto RAG
    let finalPrompt = prompt;
    if (context) {
      finalPrompt = `${context}\n\nDomanda dell'utente: ${prompt}\n\nRispondi alla domanda dell'utente utilizzando le informazioni fornite sopra quando pertinenti. Se le informazioni non sono sufficienti, fornisci una risposta generale.`;
    } else if (ragFailed) {
      // Se RAG ha fallito, aggiungi una nota al prompt
      console.log("RAG ha fallito, si procede con risposta generica di Gemini");
    }

    // Aggiunta del vincolo di lunghezza alla risposta
    const promptWithConstraint = `${finalPrompt}\n\nLimita la tua risposta a un massimo di 1500 caratteri.`;

    console.log("Prompt finale inviato a Gemini (primi 150 caratteri):", 
      promptWithConstraint.substring(0, 150) + "...");

    // Imposta timeout per la risposta di Gemini
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout nella chiamata a Gemini API")), 30000);
    });

    // Generazione della risposta con Gemini con timeout
    const responsePromise = model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptWithConstraint }] }],
    });

    // Usa race per gestire il timeout
    const result = await Promise.race([responsePromise, timeoutPromise]);
    
    const response = result.response;
    let text = await response.text();

    // Verifica se la risposta è vuota
    if (!text || text.trim() === "") {
      console.warn("La risposta di Gemini è vuota, fornisco risposta di fallback");
      return "Mi dispiace, non sono riuscito a generare una risposta pertinente. Posso aiutarti in altro modo?";
    }

    // Troncamento della risposta se troppo lunga
    if (text.length > 1500) {
      text = text.substring(0, 1500) + "...";
      console.log("Risposta troncata a 1500 caratteri");
    }

    console.log("Risposta Gemini (primi 150 caratteri):", text.substring(0, 150) + "...");
    return text;
  } catch (error) {
    console.error("Errore nella generazione della risposta:", error);
    console.error("Stack trace:", error.stack);
    
    // Risposta di fallback in caso di errore
    if (error.message.includes("Timeout")) {
      return "Mi dispiace, la generazione della risposta sta richiedendo troppo tempo. Potresti riformulare la tua domanda o riprovare più tardi?";
    } else {
      return "Mi dispiace, si è verificato un errore nella generazione della risposta. Posso aiutarti in altro modo?";
    }
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
