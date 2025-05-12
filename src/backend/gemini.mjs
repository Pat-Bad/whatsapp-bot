import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import readline from "readline";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateAIResponse(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    console.log("Risposta Gemini:", response.text);
    return response.text;
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

      await generateAIResponse(prompt);
      askQuestion();
    });
  };

  askQuestion();
}

// Avvio dell'applicazione
main().catch(console.error);

export default generateAIResponse;
