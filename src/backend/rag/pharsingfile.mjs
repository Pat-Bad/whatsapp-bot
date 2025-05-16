// Importazione delle librerie necessarie per il funzionamento del modulo
import { PDFExtract } from "pdf.js-extract"; // Libreria per estrarre il testo da file PDF
import path from "path"; // Libreria per gestire i percorsi dei file in modo cross-platform
import { fileURLToPath } from "url"; // Utility per convertire URL in percorsi file
import fetch from "node-fetch"; // Libreria per effettuare chiamate HTTP
import dotenv from "dotenv"; // Libreria per gestire le variabili d'ambiente
import fs from "fs/promises"; // Libreria per operazioni file asincrone
import { insertDocuments } from "./qdrant.mjs"; // Funzione per inserire documenti nel database vettoriale Qdrant

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Configurazione delle costanti per l'API Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Chiave API per Gemini
const GEMINI_EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=${GEMINI_API_KEY}`; // URL endpoint per gli embedding

// Ottieni il percorso del file corrente e la directory
const __filename = fileURLToPath(import.meta.url); // Percorso assoluto del file corrente
const __dirname = path.dirname(__filename); // Directory contenente il file corrente

/**
 * Divide il testo in chunks di dimensione specificata per facilitare l'elaborazione
 * @param {string} text - Il testo da dividere in chunks
 * @param {number} chunkSize - Dimensione di ogni chunk (default: 500 caratteri)
 * @param {number} overlap - Sovrapposizione tra chunks consecutivi (default: 100 caratteri)
 * @returns {string[]} Array di chunks di testo
 */
function splitIntoChunks(text, chunkSize = 500, overlap = 100) {
  if (!text || text.length === 0) {
    return [];
  }
  
  const chunks = []; // Array per memorizzare i chunks
  let startIndex = 0; // Indice iniziale per l'estrazione del chunk

  // Continua a estrarre chunks finché non si raggiunge la fine del testo
  while (startIndex < text.length) {
    // Calcola l'indice finale del chunk corrente
    let endIndex = Math.min(startIndex + chunkSize, text.length);
    
    // Cerca la fine di una frase o un punto all'interno degli ultimi 100 caratteri
    // del chunk per spezzare in punti logici
    if (endIndex < text.length) {
      const lastPart = text.substring(endIndex - 100, endIndex);
      const sentenceEnd = Math.max(
        lastPart.lastIndexOf(". "),
        lastPart.lastIndexOf(".\n"),
        lastPart.lastIndexOf("? "),
        lastPart.lastIndexOf("?\n"),
        lastPart.lastIndexOf("! "),
        lastPart.lastIndexOf("!\n")
      );
      
      if (sentenceEnd !== -1) {
        // Aggiusta l'indice finale per terminare alla fine di una frase
        endIndex = endIndex - 100 + sentenceEnd + 2; // +2 per includere il punto e lo spazio
      }
    }
    
    // Estrae il chunk e lo aggiunge all'array
    chunks.push(text.slice(startIndex, endIndex));
    
    // Calcola il prossimo indice di inizio tenendo conto della sovrapposizione
    startIndex = endIndex - overlap;
    
    // Se il prossimo chunk sarebbe troppo piccolo, terminare
    if (startIndex + chunkSize > text.length && startIndex < text.length) {
      chunks.push(text.slice(startIndex));
      break;
    }
  }
  
  return chunks;
}

/**
 * Genera embedding per un testo utilizzando l'API Gemini
 * Gli embedding sono rappresentazioni vettoriali del testo che catturano il suo significato semantico
 * @param {string} text - Il testo per cui generare l'embedding
 * @returns {Promise<number[]|null>} Array di valori dell'embedding o null in caso di errore
 */
export async function getEmbeddings(text) {
  try {
    // Verifica che il testo esista e non sia vuoto
    if (!text || text.trim().length === 0) {
      console.error("Errore: testo vuoto o non valido per embedding");
      return null;
    }

    // Verifica che la chiave API sia disponibile
    if (!GEMINI_API_KEY) {
      console.error("Errore: GEMINI_API_KEY non configurata o non valida");
      return null;
    }

    console.log(`🔄 Generazione embedding per testo (lunghezza: ${text.length} caratteri)`);

    // Effettua una chiamata POST all'API Gemini per generare l'embedding
    const response = await fetch(GEMINI_EMBEDDING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          parts: [{ text: text }],
        },
      }),
      timeout: 15000, // 15 secondi di timeout
    });

    // Verifica se la risposta è valida
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Errore API Embedding: ${response.status} ${response.statusText}`);
      console.error(`Dettaglio errore: ${errorBody}`);
      return null;
    }

    try {
      const data = await response.json();
      
      // Verifica che i dati contenano l'embedding
      if (!data.embedding || !data.embedding.values || !Array.isArray(data.embedding.values)) {
        console.error("Formato di risposta embedding non valido:", JSON.stringify(data));
        return null;
      }
      
      console.log(`✅ Embedding generato con successo - dimensione: ${data.embedding.values.length}`);
      return data.embedding.values; // Restituisce i valori dell'embedding
    } catch (jsonError) {
      console.error("Errore nel parsing della risposta JSON:", jsonError);
      return null;
    }
  } catch (error) {
    console.error("Errore durante la generazione degli embedding:", error.message);
    console.error("Stack trace:", error.stack);
    return null;
  }
}

/**
 * Processa un PDF per un'organizzazione, estrae il testo, genera embedding e li memorizza
 * @param {string} filePath - Percorso del file PDF
 * @param {string} organizationId - ID dell'organizzazione
 * @returns {Promise<Array>} Array di record vettoriali creati
 */
export async function processPDFForOrganization(filePath, organizationId) {
  try {
    // Verifica la presenza dell'API key di Gemini
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY non trovata. Assicurati di averla impostata nel file .env"
      );
    }

    // Configurazione dell'estrattore PDF con opzioni ottimizzate
    const pdfExtract = new PDFExtract();
    const options = {
      normalizeWhitespace: true, // Normalizza gli spazi bianchi per una migliore leggibilità
      disableCombineTextItems: false, // Permette la combinazione degli elementi di testo
    };

    console.log(
      `📄 Estrazione del testo dal PDF per organizationId: ${organizationId}...`
    );
    console.log(`📄 Percorso file: ${filePath}`);

    // Verifica l'esistenza del file PDF
    try {
      await fs.access(filePath);
    } catch (err) {
      throw new Error(`Il file PDF non esiste al percorso: ${filePath}`);
    }

    // Estrae il contenuto dal PDF
    const data = await pdfExtract.extract(filePath, options);

    // Log dei metadati e informazioni sul PDF
    console.log("📄 Metadati del PDF:", data.meta);
    console.log(`📄 Numero di pagine trovate: ${data.pages.length}`);

    console.log("🔄 Generazione degli embedding in corso...");

    const vectorRecords = []; // Array per memorizzare i record vettoriali
    const fileName = path.basename(filePath); // Nome del file senza percorso
    const timestamp = Date.now(); // Timestamp per generare ID unici

    // Contatori per log riassuntivo
    let totalChunks = 0;
    let successfulEmbeddings = 0;
    let failedEmbeddings = 0;

    // Processa ogni pagina del PDF
    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      const pageText = page.content.map((item) => item.str).join(" "); // Combina il testo della pagina

      // Divide il testo della pagina in chunks gestibili
      const chunks = splitIntoChunks(pageText);
      totalChunks += chunks.length;
      
      // Log solo all'inizio della pagina
      console.log(`📄 Processo pagina ${i + 1}/${data.pages.length} - ${chunks.length} chunks`);

      // Processa ogni chunk della pagina
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        
        // Log ridotto solo per monitorare l'avanzamento
        if (j % 5 === 0 || j === chunks.length - 1) {
          console.log(`📝 Progresso: chunk ${j + 1}/${chunks.length} nella pagina ${i + 1}`);
        }

        // Genera l'embedding per il chunk corrente
        try {
          const embedding = await getEmbeddings(chunk);

          if (embedding) {
            successfulEmbeddings++;

            // Crea un ID univoco combinando timestamp e indici
            const uniqueId = parseInt(`${timestamp}${i}${j}`);

            // Crea il record vettoriale completo
            const vectorRecord = {
              id: uniqueId, // ID numerico univoco
              vector: embedding, // Vettore dell'embedding
              payload: {
                text: chunk, // Testo originale del chunk
                metadata: {
                  source: fileName, // Nome del file sorgente
                  page: i + 1, // Numero della pagina
                  chunk: j + 1, // Numero del chunk
                  organizationId: organizationId, // ID dell'organizzazione/utente
                },
                organizationId: organizationId, // Duplicato a livello root per facilità di ricerca
              },
            };

            vectorRecords.push(vectorRecord);
          } else {
            failedEmbeddings++;
            console.error(`❌ Impossibile generare embedding per il chunk ${j + 1} nella pagina ${i + 1}`);
          }
        } catch (error) {
          failedEmbeddings++;
          console.error(`❌ Errore durante la generazione dell'embedding per il chunk ${j + 1} nella pagina ${i + 1}:`, error.message);
        }
      }
    }

    // Log riassuntivo finale
    console.log(
      `\n📊 Riepilogo elaborazione PDF:
      - Pagine totali: ${data.pages.length}
      - Chunks totali: ${totalChunks}
      - Embedding generati con successo: ${successfulEmbeddings}
      - Embedding falliti: ${failedEmbeddings}
      - Record vettoriali creati: ${vectorRecords.length}`
    );

    // Inserisci i record vettoriali in Qdrant se ce ne sono
    if (vectorRecords.length > 0) {
      console.log(
        `🔄 Inserimento di ${vectorRecords.length} record in Qdrant...`
      );
      const result = await insertDocuments(vectorRecords, organizationId);
      if (result) {
        console.log(
          "✅ I record sono stati inseriti correttamente in Qdrant"
        );
      } else {
        console.error(
          "❌ Si è verificato un errore durante l'inserimento dei record in Qdrant"
        );
      }
    } else {
      console.warn(
        "⚠️ Nessun record vettoriale creato, nessun inserimento in Qdrant"
      );
    }

    return vectorRecords;
  } catch (error) {
    console.error("❌ Errore durante l'elaborazione:", error);
    throw error;
  }
}

/**
 * Gestisce il caricamento di un file PDF dall'interfaccia utente
 * Questa funzione gestisce l'intero processo di upload e elaborazione
 * @param {Object} file - Oggetto file caricato
 * @param {string} organizationId - ID dell'organizzazione/utente
 * @returns {Promise<Object>} Risultato dell'elaborazione
 */
export async function handleFileUpload(file, tempPath, organizationId) {
  try {
    console.log(
      `🔄 Inizio elaborazione file: ${file.originalname} per organizationId: ${organizationId}`
    );
    console.log(`🔄 Percorso temporaneo: ${tempPath}`);

    // Verifica che il file esista
    try {
      await fs.access(tempPath);
      console.log("✅ File temporaneo accessibile");
    } catch (err) {
      throw new Error(`Il file temporaneo non è accessibile: ${err.message}`);
    }

    // Processa il PDF e crea gli embedding
    const vectorRecords = await processPDFForOrganization(
      tempPath,
      organizationId
    );

    // Elimina il file temporaneo
    await fs.unlink(tempPath);
    console.log("✅ File temporaneo eliminato");

    return {
      success: true,
      message: `File elaborato con successo: ${vectorRecords.length} chunks creati`,
      recordsCount: vectorRecords.length,
      fileName: file.originalname,
    };
  } catch (error) {
    console.error("❌ Errore durante l'upload del file:", error);

    // Assicurati che il file temporaneo venga eliminato anche in caso di errore
    try {
      await fs.unlink(tempPath);
      console.log("✅ File temporaneo eliminato dopo errore");
    } catch (unlinkError) {
      console.error(
        "❌ Errore durante l'eliminazione del file temporaneo:",
        unlinkError
      );
    }

    return {
      success: false,
      message: `Errore durante l'elaborazione del file: ${error.message}`,
      fileName: file.originalname,
    };
  }
}

// Esporta la funzione extractTextAndCreateEmbeddings per uso autonomo
export async function extractTextAndCreateEmbeddings() {
  const pdfPath = path.join(
    __dirname,
    "../../assets/mockups/Agenzia_Viaggi_Mondo_Esotico_.pdf"
  );
  return await processPDFForOrganization(pdfPath, "default");
}

// Se il file è stato eseguito direttamente
if (import.meta.url === `file://${process.argv[1]}`) {
  extractTextAndCreateEmbeddings();
}
