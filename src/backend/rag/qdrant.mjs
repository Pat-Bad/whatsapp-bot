import {QdrantClient} from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Funzione per ottenere il client Qdrant appropriato
export async function getQdrantClient() {
    try {
        // Se sono specificate le credenziali cloud, usa il client cloud
        if (process.env.QDRANT_URL && process.env.QDRANT_API_KEY) {
            const client = new QdrantClient({
                url: process.env.QDRANT_URL,
                apiKey: process.env.QDRANT_API_KEY,
            });
            
            // Verifica la connessione
            await client.getCollections();
            console.log('✅ Connessione a Qdrant Cloud stabilita con successo');
            return client;
        } else {
            console.error('❌ Credenziali Qdrant Cloud non trovate nel file .env');
            return null;
        }
    } catch (error) {
        console.error('❌ Errore durante la connessione a Qdrant Cloud:', error.message);
        return null;
    }
}

// Esporta il client per uso immediato
export const qdrantClient = await getQdrantClient();
