/**
 * Modulo per la gestione del database vettoriale Qdrant
 * Gestisce la connessione, l'inserimento e la ricerca di documenti vettorializzati
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";
import fetch from "node-fetch"; // Per le chiamate HTTP dirette

// Carica le variabili d'ambiente dal file .env
dotenv.config();

/**
 * Inizializza e configura il client Qdrant
 * @returns {Promise<QdrantClient|null>} Il client Qdrant configurato o null in caso di errore
 */
export async function getQdrantClient() {
  try {
    // Verifica la presenza delle credenziali cloud
    if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
      console.error("❌ Credenziali Qdrant Cloud mancanti nel file .env");
      return null;
    }
    
    console.log("🔑 Tentativo di connessione a Qdrant usando credenziali da variabili d'ambiente");
    
    // Purifica l'URL rimuovendo eventuali slash finali
    const cleanUrl = process.env.QDRANT_URL.replace(/\/+$/, "");
    
    // Inizializza il client con le credenziali cloud e timeout elevato
    const client = new QdrantClient({
      url: cleanUrl,
      apiKey: process.env.QDRANT_API_KEY,
      timeout: 60000, // 60 secondi di timeout per operazioni più lunghe
      retry: {
        attempts: 5, // Aumentato numero di tentativi in caso di errore
        delay: 1000, // Ritardo tra i tentativi (ms)
      },
      // Aggiungi header di autorizzazione espliciti
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${process.env.QDRANT_API_KEY}`
      }
    });

    // Imposta un timeout per la chiamata al server
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout nella connessione a Qdrant")), 10000);
    });

    try {
      // Verifica la connessione e ottieni le collezioni esistenti con timeout
      const collectionsPromise = client.getCollections();
      const collections = await Promise.race([collectionsPromise, timeoutPromise]);
      
      console.log("✅ Connessione a Qdrant Cloud stabilita con successo");
      
      // Stampa dettagli connessione per debug
      console.log(`🔗 URL Qdrant: ${cleanUrl}`);
      console.log(`🔐 API Key (primi 4 caratteri): ${process.env.QDRANT_API_KEY.substring(0, 4)}...`);

      // Configurazione della collezione principale
      const collectionName = "documenti";
      const collectionExists = collections.collections.some(
        (c) => c.name === collectionName
      );

      if (!collectionExists) {
        try {
          // Crea una nuova collezione con parametri ottimizzati
          await client.createCollection(collectionName, {
            vectors: {
              size: 768, // Dimensione dei vettori di embedding
              distance: "Cosine", // Metrica di similarità coseno
            },
            optimizers_config: {
              default_segment_number: 2, // Ridotto per migliorare compatibilità con Windows
              max_segment_size: 20000, // Ridotto per evitare problemi di memoria
            },
            hnsw_config: {
              m: 16, // Parametro di connettività HNSW
              ef_construct: 100, // Bilanciamento tra precisione e velocità costruzione
              full_scan_threshold: 1000, // Quando fare full scan invece di usare indice
            },
            on_disk_payload: true, // Ottimizzazione per dataset grandi, payload su disco
          });
          console.log(`✅ Collezione "${collectionName}" creata con successo`);
        } catch (createError) {
          console.error(`❌ Errore nella creazione della collezione: ${createError.message}`);
          // Continua anche se la creazione fallisce, potrebbe essere un errore temporaneo
          // o un problema di permessi
        }
      } else {
        console.log(`ℹ️ Collezione "${collectionName}" già esistente`);
      }

      // Verifica e log della configurazione
      try {
        const collectionInfo = await client.getCollection("documenti");
        console.log(
          "Configurazione collezione:",
          JSON.stringify(collectionInfo, null, 2)
        );
      } catch (infoError) {
        console.error(`❌ Errore nel recupero delle informazioni sulla collezione: ${infoError.message}`);
        // Non blocchiamo l'esecuzione per questo errore
      }

      return client;
    } catch (collectionsError) {
      if (collectionsError.message.includes("Timeout")) {
        console.error("❌ Timeout durante la connessione a Qdrant. Verifica che il servizio sia accessibile.");
      } else {
        console.error("❌ Errore durante la verifica delle collezioni:", collectionsError.message);
      }
      
      // Prova un ping semplice per diagnosticare problemi
      try {
        const response = await fetch(`${cleanUrl}/healthz`, {
          headers: {
            "Accept": "application/json",
            "API-Key": process.env.QDRANT_API_KEY
          },
          timeout: 5000
        });
        
        if (response.ok) {
          console.log("✅ Server Qdrant raggiungibile ma ci sono problemi con le operazioni API.");
        } else {
          console.error(`❌ Server Qdrant non risponde correttamente: ${response.status}`);
        }
      } catch (pingError) {
        console.error("❌ Server Qdrant completamente irraggiungibile:", pingError.message);
        console.log("⚠️ Su Windows potrebbe essere necessario installare Microsoft Visual C++ Redistributable");
      }
      
      return null;
    }
  } catch (error) {
    console.error("❌ Errore generale nella connessione a Qdrant:", error.message);
    console.error("❌ Stack trace:", error.stack);
    console.error(
      "❌ Risposta server:",
      error.response?.data || "Nessuna risposta"
    );
    
    // Suggerimenti specifici per Windows
    if (process.platform === "win32") {
      console.log("\n⚠️ Suggerimenti per risolvere problemi su Windows:");
      console.log("1. Installa Microsoft Visual C++ Redistributable (https://learn.microsoft.com/it-it/cpp/windows/latest-supported-vc-redist)");
      console.log("2. Assicurati che non ci siano firewall che bloccano la connessione");
      console.log("3. Prova a eseguire l'applicazione come amministratore");
    }
    
    return null;
  }
}

/**
 * Normalizza l'ID dell'organizzazione per l'uso nel database
 * @param {string} id - ID dell'organizzazione da normalizzare
 * @returns {string} ID normalizzato
 */
function normalizeOrganizationId(id) {
  return id.replace(/[^a-zA-Z0-9+:\-]/g, "_");
}

/**
 * Inserisce documenti vettorializzati nella collezione Qdrant
 * @param {Array} documents - Array di documenti da inserire
 * @param {string} organizationId - ID dell'organizzazione
 * @returns {Promise<boolean>} Esito dell'operazione
 */
export async function insertDocuments(documents, organizationId) {
  try {
    const client = await getQdrantClient();
    if (!client) {
      throw new Error("Client Qdrant non disponibile");
    }

    // Normalizza l'ID dell'organizzazione
    const normalizedId = normalizeOrganizationId(organizationId);

    // Prepara i punti per l'inserimento
    const points = documents.map((doc, index) => {
      // Genera ID numerici unici per ogni documento
      const numericId =
        typeof doc.id === "string"
          ? parseInt(Date.now().toString() + index.toString())
          : doc.id;

      return {
        id: numericId,
        vector: doc.vector,
        payload: {
          ...doc.payload,
          organizationId: normalizedId,
        },
      };
    });

    // Log per debugging
    console.log(
      `Tentativo di inserimento di ${points.length} documenti per organizationId: ${organizationId}`
    );
    
    if (points.length > 0) {
      console.log("Esempio punto:", JSON.stringify(points[0], null, 2));
    }

    // Riduco dimensione del batch e aggiungo ritardo tra batch per evitare rate limiting
    const BATCH_SIZE = 5; // Dimensione più piccola per evitare payload troppo grandi
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      try {
        const batch = points.slice(i, i + BATCH_SIZE);
        await client.upsert("documenti", { points: batch, wait: true });
        
        successCount += batch.length;
        console.log(
          `✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
            points.length / BATCH_SIZE
          )} inserito (${batch.length} punti)`
        );
        
        // Aggiungo un piccolo ritardo tra i batch per evitare rate limiting
        if (i + BATCH_SIZE < points.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (batchError) {
        errorCount += Math.min(BATCH_SIZE, points.length - i);
        console.error(
          `❌ Errore nell'inserimento del batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          batchError.message
        );
        
        if (batchError.response) {
          console.error("Dettagli errore:", batchError.response.data);
        }
      }
    }

    console.log(
      `✅ Completato: inseriti ${successCount}/${points.length} documenti, ${errorCount} falliti`
    );
    
    // Considera l'operazione un successo se almeno un documento è stato inserito
    return successCount > 0;
  } catch (error) {
    console.error(
      "❌ Errore durante l'inserimento dei documenti:",
      error.message
    );
    if (error.response) {
      console.error("Dettagli errore:", error.response.data);
    }
    return false;
  }
}

/**
 * Cerca documenti simili per un utente specifico
 * @param {Array} query - Vettore di query
 * @param {string} organizationId - ID dell'organizzazione
 * @param {number} limit - Numero massimo di risultati
 * @returns {Promise<Array>} Risultati della ricerca
 */
export async function searchDocumentsForUser(query, organizationId, limit = 5) {
  try {
    // Verifica dell'input
    if (!query || !Array.isArray(query)) {
      console.error("❌ Errore: il vettore di query non è valido", typeof query);
      return [];
    }

    if (!organizationId) {
      console.error("❌ Errore: organizationId non specificato");
      return [];
    }

    // Verifica e ottieni il client Qdrant
    const client = await getQdrantClient();
    if (!client) {
      console.error("❌ Client Qdrant non disponibile");
      return [];
    }

    // Imposta dimensione vettore attesa
    const expectedVectorSize = 768;
    if (query.length !== expectedVectorSize) {
      console.warn(`⚠️ Dimensione vettore (${query.length}) diversa da quella attesa (${expectedVectorSize})`);
    }

    const normalizedId = normalizeOrganizationId(organizationId);
    console.log(`🔍 Ricerca documenti per organizationId: ${normalizedId}`);
    console.log(`🔍 Dimensione vettore query: ${query.length}`);

    try {
      // Esegue la ricerca semantica
      const searchResults = await client.search("documenti", {
        vector: query,
        filter: {
          must: [
            {
              key: "organizationId",
              match: {
                value: normalizedId,
              },
            },
          ],
        },
        limit: limit,
        with_payload: true,
      });

      // Verifica i risultati
      if (!searchResults || !Array.isArray(searchResults)) {
        console.error("❌ Formato risposta non valido dalla ricerca");
        return [];
      }

      console.log(`✅ Trovati ${searchResults.length} risultati`);
      
      // Stampa dettagli per debug
      if (searchResults.length > 0) {
        console.log(`🔍 Primo risultato - score: ${searchResults[0].score}`);
      }
      
      return searchResults;
    } catch (searchError) {
      console.error(`❌ Errore durante l'esecuzione della ricerca: ${searchError.message}`);
      
      // Log dettagliato dell'errore per il debug
      if (searchError.response) {
        console.error("Stato HTTP:", searchError.response.status);
        console.error("Dettagli errore:", searchError.response.data);
      }
      
      // Controlla se l'errore è dovuto a problemi specifici
      if (searchError.message.includes("Payload") && searchError.message.includes("larger than allowed")) {
        console.error("⚠️ Il payload della query è troppo grande.");
      } else if (searchError.message.includes("timeout")) {
        console.error("⚠️ Timeout nella richiesta a Qdrant.");
      } else if (searchError.message.includes("network")) {
        console.error("⚠️ Errore di rete nella comunicazione con Qdrant.");
      }
      
      return [];
    }
  } catch (error) {
    console.error(`❌ Errore generale in searchDocumentsForUser: ${error.message}`);
    console.error("Stack trace:", error.stack);
    return [];
  }
}

/**
 * Recupera tutti i documenti di un utente specifico
 * @param {string} organizationId - ID dell'organizzazione
 * @returns {Promise<Array>} Documenti dell'utente
 */
export async function getDocumentsForUser(organizationId) {
  try {
    const client = await getQdrantClient();
    if (!client) {
      throw new Error("Client Qdrant non disponibile");
    }

    const normalizedId = normalizeOrganizationId(organizationId);
    let allDocuments = [];
    
    console.log(`🔍 Recupero documenti per organizationId: ${normalizedId}`);
    
    // Ottieni URL e API key dalle variabili d'ambiente
    const qdrantUrl = process.env.QDRANT_URL?.replace(/\/+$/, "");
    const apiKey = process.env.QDRANT_API_KEY;
    
    if (!qdrantUrl || !apiKey) {
      throw new Error("Credenziali Qdrant mancanti");
    }

    try {
      // Approccio diretto usando fetch per recuperare i documenti
      console.log("🔄 Tentativo con chiamata HTTP diretta...");
      
      // Configurazione della richiesta
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
        limit: 50,
        with_payload: true,
        with_vectors: false
      };
      
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
        allDocuments = data.result.points;
        console.log(`✅ Recuperati ${allDocuments.length} documenti con chiamata HTTP diretta`);
      } else {
        console.log("ℹ️ Nessun documento trovato con chiamata HTTP diretta");
        
        // Prova con i metodi precedenti se la chiamata diretta non ha prodotto risultati
        try {
          // Usa un metodo più semplice che sappiamo funzionare: search con limite alto
          const response = await client.search("documenti", {
            vector: Array(768).fill(0), // Vettore neutro di 768 dimensioni
            filter: {
              must: [
                {
                  key: "organizationId",
                  match: {
                    value: normalizedId,
                  },
                },
              ],
            },
            limit: 100, // Limite alto ma non troppo
            with_payload: true,
            with_vectors: false,
            score_threshold: 0.0, // Accetta tutti i risultati
          });
          
          if (response && response.length > 0) {
            allDocuments = response;
            console.log(`✅ Recuperati ${response.length} documenti in totale`);
          } else {
            console.log(`ℹ️ Nessun documento trovato per ${normalizedId}`);
          }
        } catch (searchError) {
          console.error(`❌ Errore nella ricerca: ${searchError.message}`);
        }
      }
    } catch (directError) {
      console.error(`❌ Errore nella chiamata HTTP diretta: ${directError.message}`);
      
      // Prova con scroll
      try {
        console.log("🔄 Tentativo alternativo usando scroll...");
        const scrollResponse = await client.scroll("documenti", {
          filter: {
            must: [
              {
                key: "organizationId",
                match: {
                  value: normalizedId,
                },
              },
            ],
          },
          limit: 20,
          with_payload: true,
          with_vectors: false,
        });
        
        if (scrollResponse.points && scrollResponse.points.length > 0) {
          allDocuments = scrollResponse.points;
          console.log(`✅ Recuperati ${allDocuments.length} documenti con metodo alternativo`);
        }
      } catch (scrollError) {
        console.error(`❌ Anche il metodo alternativo è fallito: ${scrollError.message}`);
      }
    }

    return allDocuments;
  } catch (error) {
    console.error(
      "❌ Errore durante il recupero dei documenti:",
      error.message
    );
    if (error.response) {
      console.error("Dettagli errore:", error.response.data);
    }
    return [];
  }
}

// Esporta il client inizializzato
export const qdrantClient = await getQdrantClient();
