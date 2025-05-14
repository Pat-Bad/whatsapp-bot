// Importazione delle librerie necessarie
import { PDFExtract } from 'pdf.js-extract';  // Per l'estrazione del testo da PDF
import path from 'path';  // Per la gestione dei percorsi file
import { fileURLToPath } from 'url';  // Per ottenere il percorso del file corrente
import fetch from 'node-fetch';  // Per le chiamate HTTP
import dotenv from 'dotenv';  // Per la gestione delle variabili d'ambiente

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Configurazione delle costanti per l'API Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=${GEMINI_API_KEY}`;

// Ottieni il percorso del file corrente e la directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurazione del percorso del file PDF da processare
const pdfPath = path.join(__dirname, '../../assets/mockups/Agenzia_Viaggi_Mondo_Esotico_.pdf');

/**
 * Divide il testo in chunks di dimensione specificata
 * @param {string} text - Il testo da dividere
 * @param {number} chunkSize - Dimensione di ogni chunk (default: 1000 caratteri)
 * @returns {string[]} Array di chunks di testo
 */
function splitIntoChunks(text, chunkSize = 1000) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

/**
 * Genera embedding per un testo utilizzando l'API Gemini
 * @param {string} text - Il testo per cui generare l'embedding
 * @returns {Promise<number[]|null>} Array di valori dell'embedding o null in caso di errore
 */
async function getEmbeddings(text) {
  try {
    // Chiamata API a Gemini per generare l'embedding
    const response = await fetch(GEMINI_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: {
          parts: [
            { text: text }
          ]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Errore API: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding.values;
  } catch (error) {
    console.error('Errore durante la generazione degli embedding:', error);
    return null;
  }
}

/**
 * Funzione principale che estrae il testo dal PDF e genera gli embedding
 * Processa il documento pagina per pagina e crea vettori per Qdrant
 */
async function extractTextAndCreateEmbeddings() {
  try {
    // Verifica la presenza dell'API Key
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY non trovata. Assicurati di averla impostata nel file .env');
    }

    // Configurazione dell'estrattore PDF
    const pdfExtract = new PDFExtract();
    const options = {
      normalizeWhitespace: true,  // Normalizza gli spazi bianchi
      disableCombineTextItems: false  // Permette la combinazione degli elementi di testo
    };

    console.log('Estrazione del testo dal PDF in corso...');
    const data = await pdfExtract.extract(pdfPath, options);
    
    // Log dei metadati del PDF
    console.log('Metadati del PDF:', data.meta);
    
    console.log('Generazione degli embedding in corso...');
    
    // Processa ogni pagina del PDF
    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      const pageText = page.content.map(item => item.str).join(' ');
      
      console.log(`\nProcesso pagina ${i + 1}:`);
      
      // Divide il testo della pagina in chunks
      const chunks = splitIntoChunks(pageText);
      console.log(`Pagina divisa in ${chunks.length} chunks`);
      
      // Processa ogni chunk
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        console.log(`\nChunk ${j+1}/${chunks.length} (${chunk.length} caratteri):`);
        console.log(`Testo: ${chunk.substring(0, 100)}...`);
        
        // Genera l'embedding per il chunk
        const embedding = await getEmbeddings(chunk);
        
        if (embedding) {
          console.log(`Embedding generato - Dimensione: ${embedding.length}`);
          console.log(`Primi 5 valori: [${embedding.slice(0, 5).join(', ')}]`);
          
          // Crea il record vettoriale per Qdrant
          const vectorRecord = {
            id: `page${i+1}_chunk${j+1}`,  // ID univoco per ogni chunk
            vector: embedding,  // Vettore dell'embedding
            payload: {
              text: chunk,  // Testo originale
              metadata: {
                source: path.basename(pdfPath),  // Nome del file sorgente
                page: i + 1  // Numero della pagina
              }
            }
          };
          
          console.log('Vettore per Qdrant:', JSON.stringify(vectorRecord));
        }
      }
    }

  } catch (error) {
    console.error('Errore durante l\'elaborazione:', error);
  }
}

// Esegui il processo di estrazione e generazione degli embedding
extractTextAndCreateEmbeddings();
