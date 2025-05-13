import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica le variabili d'ambiente dal file .env
dotenv.config({ path: path.join(__dirname, "../../.env") });
console.log("API KEY:", process.env.GEMINI_API_KEY);

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateAIResponse(prompt) {
  try {
    console.log("Prompt inviato a Gemini:", prompt);
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    // Aggiungiamo istruzioni esplicite per limitare la lunghezza della risposta
    const promptWithConstraint = `${prompt}\n\nLimita la tua risposta a un massimo di 1500 caratteri.`;
    
    const result = await model.generateContent(promptWithConstraint);
    const response = result.response;

    // Inizializza la variabile text correttamente prima di usarla
    let text = await response.text();
    
    // Assicuriamoci che la risposta non superi i 1500 caratteri
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

// Configurazione dell'interfaccia readline per l'input da console
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Funzione principale per gestire l'interazione da console
async function main() {
  console.log("Benvenuto! Scrivi 'exit' per uscire.");

  const askQuestion = () => {
    rl.question("Inserisci la tua domanda: ", async (prompt) => {
      if (prompt.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      const response = await generateAIResponse(prompt);
      console.log("Risposta del bot:", response); // Aggiungi questo per stampare la risposta
      askQuestion();
    });
  };

  askQuestion();
}

// Avvio dell'applicazione
main().catch(console.error);

export default generateAIResponse;
