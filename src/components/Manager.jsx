import { useState, useEffect, useRef } from "react";
import { Container, Row, Col, Card, Button, Form, ListGroup } from "react-bootstrap";
import axios from "axios";
import io from "socket.io-client";

// Configura l'URL di base per le richieste API
const API_BASE_URL = "http://localhost:3000"; // Cambia con l'URL del tuo server
axios.defaults.baseURL = API_BASE_URL;

const Manager = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [responseMode, setResponseMode] = useState("auto"); // auto o manual
  const [customDefaultResponse, setCustomDefaultResponse] = useState("Grazie per il tuo messaggio! Un operatore ti risponderà a breve.");
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Connessione socket.io e gestione eventi
  useEffect(() => {
    socketRef.current = io(API_BASE_URL);
    
    // Ricevi le conversazioni iniziali
    socketRef.current.on("conversations", (data) => {
      setConversations(data);
      setLoading(false);
    });
    
    // Gestisci i nuovi messaggi
    socketRef.current.on("new_message", (data) => {
      // Aggiorna la conversazione corrispondente nella lista
      setConversations(prevConversations => {
        const updatedConversations = [...prevConversations];
        const index = updatedConversations.findIndex(c => c.phone === data.phone);
        
        if (index !== -1) {
          updatedConversations[index] = {
            ...updatedConversations[index],
            lastActivity: new Date().toISOString(),
            lastMessage: data.message
          };
        } else {
          // Nuova conversazione
          updatedConversations.push({
            phone: data.phone,
            name: data.conversation.name,
            lastActivity: data.conversation.lastActivity,
            lastMessage: data.message
          });
        }
        
        // Ordina le conversazioni per attività più recente
        return updatedConversations.sort((a, b) => 
          new Date(b.lastActivity) - new Date(a.lastActivity)
        );
      });
      
      // Se la conversazione è attualmente selezionata, aggiorna i messaggi
      if (selectedConversation === data.phone) {
        setMessages(prev => [...prev, data.message]);
        
        // Scroll alla fine della chat
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    });
    
    // Pulisci la connessione al termine
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [selectedConversation]);

  // Carica le impostazioni all'avvio
  useEffect(() => {
    fetchSettings();
  }, []);
  
  // Scroll alla fine della chat quando vengono caricati i messaggi o quando viene inviato un nuovo messaggio
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Carica le conversazioni all'avvio
  useEffect(() => {
    fetchConversations();
    // Aggiorna le conversazioni ogni 10 secondi
    const intervalId = setInterval(fetchConversations, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // Carica le conversazioni
  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/conversations");
      setConversations(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (error) {
      console.error("Errore nel caricamento delle conversazioni:", error);
      setLoading(false);
      setConversations([]);
    }
  };
  
  // Carica le impostazioni
  const fetchSettings = async () => {
    try {
      const response = await axios.get("/api/settings");
      setCustomDefaultResponse(response.data.defaultResponse);
      setResponseMode(response.data.responseMode);
    } catch (error) {
      console.error("Errore nel caricamento delle impostazioni:", error);
    }
  };

  // Seleziona una conversazione
  const selectConversation = async (phone) => {
    try {
      const response = await axios.get(`/api/conversations/${phone}`);
      setSelectedConversation(phone);
      setMessages(response.data.messages);
    } catch (error) {
      console.error("Errore nel caricamento dei messaggi:", error);
    }
  };

  // Invia un messaggio
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      await axios.post("/api/send", {
        phone: selectedConversation,
        message: newMessage
      });
      
      // Aggiorna i messaggi
      const response = await axios.get(`/api/conversations/${selectedConversation}`);
      setMessages(response.data.messages);
      setNewMessage("");
      
      // Aggiorna anche la lista delle conversazioni
      fetchConversations();
    } catch (error) {
      console.error("Errore nell'invio del messaggio:", error);
    }
  };
  
  // Gestisci invio messaggio con il tasto Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Aggiorna la risposta automatica predefinita
  const updateDefaultResponse = async () => {
    try {
      await axios.post("/api/settings", {
        defaultResponse: customDefaultResponse
      });
      alert("Risposta predefinita aggiornata con successo");
    } catch (error) {
      console.error("Errore nell'aggiornamento della risposta predefinita:", error);
    }
  };

  // Cambia la modalità di risposta
  const toggleResponseMode = async () => {
    const newMode = responseMode === "auto" ? "manual" : "auto";
    try {
      await axios.post("/api/settings", {
        responseMode: newMode
      });
      setResponseMode(newMode);
      alert(`Modalità di risposta impostata su: ${newMode === "auto" ? "Automatica" : "Manuale"}`);
    } catch (error) {
      console.error("Errore nel cambio della modalità di risposta:", error);
    }
  };

  return (
    <Container className="container-fluid mt-4">
      <Row>
        <Col md={4}>
          <h2 className="mb-3">Conversazioni</h2>
          {loading ? (
            <p>Caricamento...</p>
          ) : conversations.length === 0 ? (
            <p>Nessuna conversazione disponibile</p>
          ) : (
            <ListGroup>
              {Array.isArray(conversations) ? conversations.map((conv) => (
                <ListGroup.Item 
                  key={conv.phone} 
                  action 
                  active={selectedConversation === conv.phone}
                  onClick={() => selectConversation(conv.phone)}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <strong>{conv.name}</strong>
                    <br />
                    <small>{conv.phone}</small>
                  </div>
                  <small>{new Date(conv.lastMessage.timestamp).toLocaleTimeString()}</small>
                </ListGroup.Item>
              )) : <p>Formato dati non valido</p>}
            </ListGroup>
          )}
          
          <Card className="mt-4 mb-3">
            <Card.Header>Impostazioni Risposte</Card.Header>
            <Card.Body>
              <Form.Group className="mb-3">
                <Form.Label>Risposta Automatica</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={customDefaultResponse}
                  onChange={(e) => setCustomDefaultResponse(e.target.value)}
                />
              </Form.Group>
              <div className="d-flex justify-content-between">
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  onClick={updateDefaultResponse}
                >
                  Salva Risposta
                </Button>
                <Button 
                  variant={responseMode === "auto" ? "success" : "warning"} 
                  size="sm"
                  onClick={toggleResponseMode}
                >
                  {responseMode === "auto" ? "Automatica" : "Manuale"}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={8}>
          {selectedConversation ? (
            <>
              <h2 className="mb-3">
                Chat con {conversations.find(c => c.phone === selectedConversation)?.name || 'Utente'}
              </h2>
              <Card 
                className="chat-container mb-3" 
                style={{ height: "400px", overflowY: "auto" }}
                ref={chatContainerRef}
              >
                <Card.Body>
                  {messages.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`mb-2 p-2 rounded ${msg.direction === 'sent' ? 'text-end bg-primary text-white' : 'bg-light'}`}
                      style={{ maxWidth: "75%", marginLeft: msg.direction === 'sent' ? 'auto' : '0' }}
                    >
                      <div>{msg.content}</div>
                      <small>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                        {msg.status && <span className="ms-2">({msg.status})</span>}
                      </small>
                    </div>
                  ))}
                </Card.Body>
              </Card>
              <Form>
                <Form.Group className="d-flex">
                  <Form.Control
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Scrivi un messaggio..."
                    className="me-2"
                  />
                  <Button onClick={sendMessage}>Invia</Button>
                </Form.Group>
              </Form>
            </>
          ) : (
            <p className="text-center mt-5">Seleziona una conversazione per visualizzare i messaggi</p>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default Manager;
