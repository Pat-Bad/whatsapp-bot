// Importazione delle dipendenze necessarie
import { useState, useEffect, useRef, useCallback } from "react";
import { Container, Row, Col, Card, Button, Form, ListGroup, Navbar, Nav } from "react-bootstrap";
import axios from "axios";
import io from "socket.io-client";

// Configurazione dell'URL base per le richieste API
const API_BASE_URL = "http://localhost:3000"; // Cambia con l'URL del tuo server
axios.defaults.baseURL = API_BASE_URL;

// Componente ScrollableChat per gestire correttamente lo scroll dei messaggi
const ScrollableChat = ({ children }) => {
  const outerDivRef = useRef(null);
  const innerDivRef = useRef(null);
  const prevInnerDivHeightRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    if (!outerDivRef.current || !innerDivRef.current) return;

    const outerDivHeight = outerDivRef.current.clientHeight;
    const innerDivHeight = innerDivRef.current.clientHeight;
    const outerDivScrollTop = outerDivRef.current.scrollTop;

    // Controllo se siamo al primo render o se l'utente era già scrollato in fondo
    if (
      !prevInnerDivHeightRef.current ||
      outerDivScrollTop === prevInnerDivHeightRef.current - outerDivHeight ||
      outerDivScrollTop + outerDivHeight >= prevInnerDivHeightRef.current - 10 // Tolleranza per lo scroll
    ) {
      outerDivRef.current.scrollTo({
        top: innerDivHeight - outerDivHeight,
        left: 0,
        behavior: prevInnerDivHeightRef.current ? "smooth" : "auto"
      });
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }

    prevInnerDivHeightRef.current = innerDivHeight;
  }, [children]);

  const scrollToBottom = useCallback(() => {
    if (!outerDivRef.current || !innerDivRef.current) return;

    const outerDivHeight = outerDivRef.current.clientHeight;
    const innerDivHeight = innerDivRef.current.clientHeight;

    outerDivRef.current.scrollTo({
      top: innerDivHeight - outerDivHeight,
      left: 0,
      behavior: "smooth"
    });

    setShowScrollButton(false);
  }, []);

  return (
    <div className="position-relative" style={{ height: "100%" }}>
      <div
        ref={outerDivRef}
        className="chat-container mb-3 flex-grow-1"
        style={{ overflowY: "auto", position: "relative" }}
      >
        <div ref={innerDivRef} style={{ position: "relative" }}>
          {children}
        </div>
      </div>
      {showScrollButton && (
        <Button
          variant="primary"
          size="sm"
          className="position-absolute"
          style={{
            bottom: "20px",
            right: "20px",
            zIndex: 10,
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={scrollToBottom}
        >
          ↓
        </Button>
      )}
    </div>
  );
};

const Manager = ({ onLogout }) => {
  // Stati per gestire le conversazioni e i messaggi
  const [conversations, setConversations] = useState([]); // Lista delle conversazioni
  const [selectedConversation, setSelectedConversation] = useState(null); // Conversazione selezionata
  const [messages, setMessages] = useState([]); // Messaggi della conversazione selezionata
  const [newMessage, setNewMessage] = useState(""); // Nuovo messaggio da inviare
  const [loading, setLoading] = useState(true); // Stato di caricamento
  const [responseMode, setResponseMode] = useState("auto"); // Modalità di risposta (auto/manual)
  const [customDefaultResponse, setCustomDefaultResponse] = useState("Grazie per il tuo messaggio! Un operatore ti risponderà a breve."); // Risposta automatica predefinita
  const [showSettings, setShowSettings] = useState(false); // Mostrare/nascondere impostazioni
  const [showMobileConversations, setShowMobileConversations] = useState(true); // Gestione visualizzazione mobile
  
  // Refs per gestire socket
  const socketRef = useRef(null);

  // Gestione della connessione socket.io e degli eventi in tempo reale
  useEffect(() => {
    // Inizializzazione della connessione socket
    socketRef.current = io(API_BASE_URL);
    
    // Gestione delle conversazioni iniziali
    socketRef.current.on("conversations", (data) => {
      setConversations(data);
      setLoading(false);
    });
    
    // Gestione dei nuovi messaggi in arrivo
    socketRef.current.on("new_message", (data) => {
      // Aggiornamento della lista conversazioni
      setConversations(prevConversations => {
        const updatedConversations = [...prevConversations];
        const index = updatedConversations.findIndex(c => c.phone === data.phone);
        
        if (index !== -1) {
          // Aggiornamento conversazione esistente
          updatedConversations[index] = {
            ...updatedConversations[index],
            lastActivity: new Date().toISOString(),
            lastMessage: data.message
          };
        } else {
          // Aggiunta nuova conversazione
          updatedConversations.push({
            phone: data.phone,
            name: data.conversation.name,
            lastActivity: data.conversation.lastActivity,
            lastMessage: data.message
          });
        }
        
        // Ordinamento conversazioni per attività recente
        return updatedConversations.sort((a, b) => 
          new Date(b.lastActivity) - new Date(a.lastActivity)
        );
      });
      
      // Aggiornamento messaggi se la conversazione è selezionata
      if (selectedConversation === data.phone) {
        setMessages(prev => [...prev, data.message]);
      }
    });
    
    // Pulizia della connessione al termine
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [selectedConversation]);

  // Caricamento delle impostazioni all'avvio
  useEffect(() => {
    fetchSettings();
  }, []);

  // Caricamento e aggiornamento periodico delle conversazioni
  useEffect(() => {
    fetchConversations();
    // Aggiornamento ogni 10 secondi
    const intervalId = setInterval(fetchConversations, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // Funzione per caricare le conversazioni dal server
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
  
  // Funzione per caricare le impostazioni dal server
  const fetchSettings = async () => {
    try {
      const response = await axios.get("/api/settings");
      setCustomDefaultResponse(response.data.defaultResponse);
      setResponseMode(response.data.responseMode);
    } catch (error) {
      console.error("Errore nel caricamento delle impostazioni:", error);
    }
  };

  // Funzione per selezionare una conversazione
  const selectConversation = async (phone) => {
    try {
      const response = await axios.get(`/api/conversations/${phone}`);
      setSelectedConversation(phone);
      setMessages(response.data.messages);
      // In modalità mobile, nascondi la lista conversazioni quando una conversazione è selezionata
      if (window.innerWidth <= 768) {
        setShowMobileConversations(false);
      }
    } catch (error) {
      console.error("Errore nel caricamento dei messaggi:", error);
    }
  };

  // Funzione per inviare un nuovo messaggio
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      await axios.post("/api/send", {
        phone: selectedConversation,
        message: newMessage
      });
      
      // Aggiornamento dei messaggi dopo l'invio
      const response = await axios.get(`/api/conversations/${selectedConversation}`);
      setMessages(response.data.messages);
      setNewMessage("");
      
      // Aggiornamento della lista conversazioni
      fetchConversations();
    } catch (error) {
      console.error("Errore nell'invio del messaggio:", error);
    }
  };
  
  // Gestione dell'invio messaggio con tasto Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Funzione per aggiornare la risposta automatica predefinita
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

  // Funzione per cambiare la modalità di risposta (auto/manual)
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

  // Funzione per tornare alla lista conversazioni (mobile)
  const backToConversations = () => {
    setShowMobileConversations(true);
  };

  // Rendering dell'interfaccia utente
  return (
    <div className="manager-container">
      {/* Barra di navigazione principale */}
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-3">
        <Container>
          <Navbar.Brand>WhatsApp Business Manager</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav" className="justify-content-end">
            <Nav>
              <Button 
                variant="outline-light" 
                size="sm" 
                className="me-2"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? "Nascondi Impostazioni" : "Impostazioni"}
              </Button>
              <Button 
                variant="outline-danger" 
                size="sm"
                onClick={onLogout}
              >
                Logout
              </Button>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container fluid className="px-md-4">
        <Row>
          {/* Colonna sinistra: lista conversazioni (visibile sempre su desktop, condizionale su mobile) */}
          <Col 
            md={4} 
            className={showMobileConversations ? "" : "d-none d-md-block"} 
            style={{ height: "calc(100vh - 80px)", overflowY: "auto" }}
          >
            <h2 className="mb-3">Conversazioni</h2>
            {loading ? (
              <div className="text-center p-3">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Caricamento...</span>
                </div>
                <p className="mt-2">Caricamento conversazioni...</p>
              </div>
            ) : conversations.length === 0 ? (
              <Card className="text-center p-3">
                <Card.Body>
                  <p>Nessuna conversazione disponibile</p>
                </Card.Body>
              </Card>
            ) : (
              <ListGroup className="conversation-list">
                {Array.isArray(conversations) ? conversations.map((conv) => (
                  <ListGroup.Item 
                    key={conv.phone} 
                    action 
                    active={selectedConversation === conv.phone}
                    onClick={() => selectConversation(conv.phone)}
                    className="conversation-item d-flex justify-content-between align-items-center"
                  >
                    <div>
                      <strong>{conv.name}</strong>
                      <br />
                      <small>{conv.phone}</small>
                      {conv.lastMessage && (
                        <p className="text-truncate mb-0" style={{ maxWidth: "150px" }}>
                          {conv.lastMessage.content}
                        </p>
                      )}
                    </div>
                    <div className="text-end">
                      <small className="text-muted">
                        {conv.lastMessage && new Date(conv.lastMessage.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </small>
                    </div>
                  </ListGroup.Item>
                )) : <p>Formato dati non valido</p>}
              </ListGroup>
            )}
            
            {/* Card delle impostazioni risposte (visibile solo quando showSettings è true) */}
            {showSettings && (
              <Card className="mt-4 mb-3 settings-card">
                <Card.Header className="bg-primary text-white">Impostazioni Risposte</Card.Header>
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
            )}
          </Col>

          {/* Colonna destra: chat (visibile sempre su desktop, condizionale su mobile) */}
          <Col 
            md={8} 
            className={!showMobileConversations || window.innerWidth > 768 ? "" : "d-none"}
            style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}
          >
            {selectedConversation ? (
              <>
                <div className="d-flex align-items-center mb-3">
                  {/* Pulsante Back visibile solo su mobile */}
                  <Button 
                    variant="outline-primary" 
                    className="d-md-none me-2"
                    onClick={backToConversations}
                  >
                    ←
                  </Button>
                  <h2 className="mb-0">
                    Chat con {conversations.find(c => c.phone === selectedConversation)?.name || 'Utente'}
                  </h2>
                </div>
                
                <ScrollableChat>
                  {messages.length === 0 ? (
                    <div className="text-center text-muted p-4">
                      <p>Nessun messaggio in questa chat.</p>
                      <p>Inizia una conversazione!</p>
                    </div>
                  ) : (
                    <div className="messages-container">
                      {messages.map((msg, index) => (
                        <div key={index} className="chat-message-container">
                          <div 
                            className={`chat-message ${msg.direction === 'sent' ? 'sent-message' : 'received-message'}`}
                          >
                            <div>{msg.content}</div>
                            <div className="message-timestamp">
                              {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              {msg.status && <span className="ms-2">({msg.status})</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollableChat>
                
                <Form className="message-input-container mb-3">
                  <Form.Control
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Scrivi un messaggio..."
                    className="me-2"
                  />
                  <Button 
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    variant="primary"
                  >
                    Invia
                  </Button>
                </Form>
              </>
            ) : (
              <div className="text-center p-5">
                <h3>Seleziona una conversazione</h3>
                <p className="text-muted">Scegli una chat dalla lista per visualizzare i messaggi</p>
              </div>
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Manager;
