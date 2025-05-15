/**
 * Modulo per la gestione del database vettoriale Qdrant
 * Gestisce la connessione, l'inserimento e la ricerca di documenti vettorializzati
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";

// Carica le variabili d'ambiente dal file .env
dotenv.config();

/**
 * Inizializza e configura il client Qdrant
 * @returns {Promise<QdrantClient|null>} Il client Qdrant configurato o null in caso di errore
 */
export async function getQdrantClient() {
  try {
    // Verifica la presenza delle credenziali cloud
    if (process.env.QDRANT_URL && process.env.QDRANT_API_KEY) {
      // Inizializza il client con le credenziali cloud
      const client = new QdrantClient({
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
        timeout: 15000, // Timeout aumentato per operazioni più lunghe
      });

      // Verifica la connessione e ottieni le collezioni esistenti
      const collections = await client.getCollections();
      console.log("✅ Connessione a Qdrant Cloud stabilita con successo");

      // Configurazione della collezione principale
      const collectionName = "documenti";
      const collectionExists = collections.collections.some(
        (c) => c.name === collectionName
      );

      if (!collectionExists) {
        // Crea una nuova collezione con parametri ottimizzati
        await client.createCollection(collectionName, {
          vectors: {
            size: 768, // Dimensione dei vettori di embedding
            distance: "Cosine", // Metrica di similarità coseno
          },
          optimizers_config: {
            default_segment_number: 2, // Ottimizzazione per piccole collezioni
          },
        });
        console.log(`✅ Collezione "${collectionName}" creata con successo`);
      } else {
        console.log(`ℹ️ Collezione "${collectionName}" già esistente`);
      }

      // Verifica e log della configurazione
      const collectionInfo = await client.getCollection("documenti");
      console.log(
        "Configurazione collezione:",
        JSON.stringify(collectionInfo, null, 2)
      );

      return client;
    } else {
      console.error("❌ Credenziali Qdrant Cloud non trovate nel file .env");
      return null;
    }
  } catch (error) {
    console.error("❌ Errore completo:", error);
    console.error(
      "❌ Risposta server:",
      error.response?.data || "Nessuna risposta"
    );
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
    console.log("Esempio punto:", JSON.stringify(points[0], null, 2));

    // Inserimento in batch per ottimizzare le performance
    const BATCH_SIZE = 10;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await client.upsert("documenti", { points: batch, wait: true });
      console.log(
        `✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          points.length / BATCH_SIZE
        )} inserito`
      );
    }

    console.log(
      `✅ Inseriti ${points.length} documenti per organizationId: ${organizationId}`
    );
    return true;
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
    const client = await getQdrantClient();
    if (!client) {
      throw new Error("Client Qdrant non disponibile");
    }

    const normalizedId = normalizeOrganizationId(organizationId);

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

    return searchResults;
  } catch (error) {
    console.error("❌ Errore durante la ricerca dei documenti:", error.message);
    if (error.response) {
      console.error("Dettagli errore:", error.response.data);
    }
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

    // Utilizza search invece di scroll per problemi di permessi
    const response = await client.search("documenti", {
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
      limit: 100,
      with_payload: true,
      with_vectors: false,
    });

    return response;
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
