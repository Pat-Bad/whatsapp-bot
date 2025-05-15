// Importazione delle dipendenze necessarie per React e UI
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  ListGroup,
  Navbar,
  Nav,
  Modal,
  Table,
  Badge,
} from "react-bootstrap";
import axios from "axios"; // Per le chiamate HTTP
import io from "socket.io-client"; // Per la comunicazione in tempo reale

// Configurazione dell'URL base per le richieste API
const API_BASE_URL = "http://localhost:3000"; // URL del server backend
axios.defaults.baseURL = API_BASE_URL;

// Componente ScrollableChat: gestisce lo scroll automatico dei messaggi nella chat
const ScrollableChat = ({ children }) => {
  // Refs per gestire il contenitore esterno e interno della chat
  const outerDivRef = useRef(null);
  const innerDivRef = useRef(null);
  const prevInnerDivHeightRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Effetto per gestire lo scroll automatico quando arrivano nuovi messaggi
  useEffect(() => {
    if (!outerDivRef.current || !innerDivRef.current) return;

    const outerDivHeight = outerDivRef.current.clientHeight;
    const innerDivHeight = innerDivRef.current.clientHeight;
    const outerDivScrollTop = outerDivRef.current.scrollTop;

    // Logica per determinare se scrollare automaticamente:
    // 1. Primo render
    // 2. Utente era già in fondo alla chat
    // 3. Utente è vicino al fondo (entro 10px)
    if (
      !prevInnerDivHeightRef.current ||
      outerDivScrollTop === prevInnerDivHeightRef.current - outerDivHeight ||
      outerDivScrollTop + outerDivHeight >= prevInnerDivHeightRef.current - 10
    ) {
      outerDivRef.current.scrollTo({
        top: innerDivHeight - outerDivHeight,
        left: 0,
        behavior: prevInnerDivHeightRef.current ? "smooth" : "auto",
      });
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }

    prevInnerDivHeightRef.current = innerDivHeight;
  }, [children]);

  // Funzione per scrollare manualmente in fondo alla chat
  const scrollToBottom = useCallback(() => {
    if (!outerDivRef.current || !innerDivRef.current) return;

    const outerDivHeight = outerDivRef.current.clientHeight;
    const innerDivHeight = innerDivRef.current.clientHeight;

    outerDivRef.current.scrollTo({
      top: innerDivHeight - outerDivHeight,
      left: 0,
      behavior: "smooth",
    });

    setShowScrollButton(false);
  }, []);

  // Rendering del componente con il pulsante di scroll
  return (
    <div
      className="position-relative"
      style={{ height: "100%" }}
    >
      <div
        ref={outerDivRef}
        className="chat-container mb-3 flex-grow-1"
        style={{ overflowY: "auto", position: "relative" }}
      >
        <div
          ref={innerDivRef}
          style={{ position: "relative" }}
        >
          {children}
        </div>
      </div>
      {/* Pulsante per scrollare in fondo, visibile solo quando necessario */}
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
            justifyContent: "center",
          }}
          onClick={scrollToBottom}
        >
          ↓
        </Button>
      )}
    </div>
  );
};

// Componente principale Manager: gestisce l'interfaccia di amministrazione WhatsApp
const Manager = ({ onLogout }) => {
  // Stati per la gestione delle conversazioni e messaggi
  const [conversations, setConversations] = useState([]); // Lista delle conversazioni
  const [selectedConversation, setSelectedConversation] = useState(null); // Conversazione attiva
  const [messages, setMessages] = useState([]); // Messaggi della conversazione
  const [newMessage, setNewMessage] = useState(""); // Input nuovo messaggio
  const [loading, setLoading] = useState(true); // Stato di caricamento
  const [responseMode, setResponseMode] = useState("auto"); // Modalità risposta (auto/manual)
  const [customDefaultResponse, setCustomDefaultResponse] = useState(
    "Grazie per il tuo messaggio! Un operatore ti risponderà a breve."
  ); // Risposta automatica
  const [showSettings, setShowSettings] = useState(false); // Visibilità impostazioni
  const [showMobileConversations, setShowMobileConversations] = useState(true); // Gestione layout mobile

  // Stati per la gestione dei documenti
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userDocuments, setUserDocuments] = useState({});
  const [viewingDocumentsFor, setViewingDocumentsFor] = useState(null);

  // Ref per la connessione socket.io
  const socketRef = useRef(null);

  // Gestione della connessione socket.io e degli eventi in tempo reale
  useEffect(() => {
    // Inizializzazione socket
    socketRef.current = io(API_BASE_URL);

    // Gestione ricezione conversazioni
    socketRef.current.on("conversations", (data) => {
      setConversations(data);
      setLoading(false);
    });

    // Gestione nuovi messaggi in arrivo
    socketRef.current.on("new_message", (data) => {
      // Aggiornamento lista conversazioni
      setConversations((prevConversations) => {
        const updatedConversations = [...prevConversations];
        const index = updatedConversations.findIndex(
          (c) => c.phone === data.phone
        );

        if (index !== -1) {
          // Aggiornamento conversazione esistente
          updatedConversations[index] = {
            ...updatedConversations[index],
            lastActivity: new Date().toISOString(),
            lastMessage: data.message,
          };
        } else {
          // Aggiunta nuova conversazione
          updatedConversations.push({
            phone: data.phone,
            name: data.conversation.name,
            lastActivity: data.conversation.lastActivity,
            lastMessage: data.message,
          });
        }

        // Ordinamento per attività recente
        return updatedConversations.sort(
          (a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)
        );
      });

      // Aggiornamento messaggi se la conversazione è selezionata
      if (selectedConversation === data.phone) {
        setMessages((prev) => [...prev, data.message]);
      }
    });

    // Pulizia socket al dismount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [selectedConversation]);

  // Caricamento impostazioni all'avvio
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
      // Gestione layout mobile
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
        message: newMessage,
      });

      // Aggiornamento dei messaggi dopo l'invio
      const response = await axios.get(
        `/api/conversations/${selectedConversation}`
      );
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Funzione per aggiornare la risposta automatica predefinita
  const updateDefaultResponse = async () => {
    try {
      await axios.post("/api/settings", {
        defaultResponse: customDefaultResponse,
      });
      alert("Risposta predefinita aggiornata con successo");
    } catch (error) {
      console.error(
        "Errore nell'aggiornamento della risposta predefinita:",
        error
      );
    }
  };

  // Funzione per cambiare la modalità di risposta (auto/manual)
  const toggleResponseMode = async () => {
    const newMode = responseMode === "auto" ? "manual" : "auto";
    try {
      await axios.post("/api/settings", {
        responseMode: newMode,
      });
      setResponseMode(newMode);
      alert(
        `Modalità di risposta impostata su: ${
          newMode === "auto" ? "Automatica" : "Manuale"
        }`
      );
    } catch (error) {
      console.error("Errore nel cambio della modalità di risposta:", error);
    }
  };

  // Funzione per tornare alla lista conversazioni (mobile)
  const backToConversations = () => {
    setShowMobileConversations(true);
  };

  /**
   * Funzione per aprire la modale di gestione documenti per un utente specifico
   * @param {string} phone - Il numero di telefono dell'utente
   * Carica i documenti esistenti dell'utente e mostra la modale
   */
  const openDocumentModal = async (phone) => {
    setViewingDocumentsFor(phone);
    setShowDocumentModal(true);

    // Carica i documenti esistenti per questo utente
    try {
      const response = await axios.get(`/api/documents/${phone}`);
      if (response.data.success) {
        setUserDocuments((prevDocs) => ({
          ...prevDocs,
          [phone]: response.data.documents,
        }));
      }
    } catch (error) {
      console.error("Errore nel caricamento dei documenti:", error);
    }
  };

  /**
   * Gestisce il cambiamento del file selezionato nell'input file
   * @param {Event} event - L'evento del cambio file
   * Verifica che il file sia un PDF valido
   */
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
    } else {
      alert("Per favore seleziona un file PDF valido.");
      setSelectedFile(null);
      event.target.value = null;
    }
  };

  /**
   * Carica il file PDF selezionato sul server
   * Gestisce il progresso dell'upload e aggiorna la lista dei documenti
   */
  const uploadFile = async () => {
    if (!selectedFile || !viewingDocumentsFor) return;

    // Prepara i dati per l'upload
    const formData = new FormData();
    formData.append("pdfFile", selectedFile);
    formData.append("organizationId", viewingDocumentsFor);

    setDocumentLoading(true);
    setUploadProgress(0);

    try {
      // Effettua l'upload del file con tracciamento del progresso
      const response = await axios.post("/api/upload-pdf", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      if (response.data.success) {
        alert(`File caricato con successo! ${response.data.message}`);

        // Aggiorna la lista dei documenti dopo l'upload
        const updatedDocsResponse = await axios.get(
          `/api/documents/${viewingDocumentsFor}`
        );
        if (updatedDocsResponse.data.success) {
          setUserDocuments((prevDocs) => ({
            ...prevDocs,
            [viewingDocumentsFor]: updatedDocsResponse.data.documents,
          }));
        }

        // Resetta il form dopo l'upload riuscito
        setSelectedFile(null);
        document.getElementById("pdf-upload").value = "";
      } else {
        alert(`Errore: ${response.data.message}`);
      }
    } catch (error) {
      console.error("Errore durante l'upload:", error);
      alert(`Errore durante l'upload: ${error.message}`);
    } finally {
      setDocumentLoading(false);
      setUploadProgress(0);
    }
  };

  // Rendering dell'interfaccia utente
  return (
    <div className="manager-container">
      {/* Barra di navigazione principale con logo e pulsanti di controllo */}
      <Navbar
        bg="dark"
        variant="dark"
        expand="lg"
        className="mb-3"
      >
        <Container>
          <Navbar.Brand>WhatsApp Business Manager</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse
            id="basic-navbar-nav"
            className="justify-content-end"
          >
            <Nav>
              {/* Pulsante per mostrare/nascondere le impostazioni */}
              <Button
                variant="outline-light"
                size="sm"
                className="me-2"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? "Nascondi Impostazioni" : "Impostazioni"}
              </Button>
              {/* Pulsante di logout */}
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

      <Container
        fluid
        className="px-md-4"
      >
        <Row>
          {/* Colonna sinistra: lista delle conversazioni */}
          <Col
            md={4}
            className={showMobileConversations ? "" : "d-none d-md-block"}
            style={{ height: "calc(100vh - 80px)", overflowY: "auto" }}
          >
            <h2 className="mb-3">Conversazioni</h2>
            {/* Stato di caricamento */}
            {loading ? (
              <div className="text-center p-3">
                <div
                  className="spinner-border text-primary"
                  role="status"
                >
                  <span className="visually-hidden">Caricamento...</span>
                </div>
                <p className="mt-2">Caricamento conversazioni...</p>
              </div>
            ) : conversations.length === 0 ? (
              // Messaggio quando non ci sono conversazioni
              <Card className="text-center p-3">
                <Card.Body>
                  <p>Nessuna conversazione disponibile</p>
                </Card.Body>
              </Card>
            ) : (
              // Lista delle conversazioni
              <ListGroup className="conversation-list">
                {Array.isArray(conversations) ? (
                  conversations.map((conv) => (
                    <ListGroup.Item
                      key={conv.phone}
                      className="p-0 border"
                      action
                      onClick={() => selectConversation(conv.phone)}
                    >
                      {/* Informazioni della conversazione */}
                      <div className="d-flex justify-content-between align-items-center p-2">
                        <div className="flex-grow-1">
                          <strong>{conv.name || "Utente"}</strong>
                          <br />
                          <small>{conv.phone}</small>
                          {conv.lastMessage && (
                            <p
                              className="text-truncate mb-0"
                              style={{ maxWidth: "150px" }}
                            >
                              {conv.lastMessage.content}
                            </p>
                          )}
                        </div>
                        <div className="d-flex flex-column align-items-end">
                          <small className="text-muted">
                            {conv.lastMessage &&
                              new Date(
                                conv.lastMessage.timestamp
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                          </small>
                        </div>
                      </div>
                      {/* Pulsante per gestire i documenti */}
                      <div className="border-top p-1 text-center">
                        <span
                          className="btn btn-sm btn-outline-primary w-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDocumentModal(conv.phone);
                          }}
                        >
                          Documenti
                        </span>
                      </div>
                    </ListGroup.Item>
                  ))
                ) : (
                  <p>Formato dati non valido</p>
                )}
              </ListGroup>
            )}

            {/* Card delle impostazioni risposte automatiche */}
            {showSettings && (
              <Card className="mt-4 mb-3 settings-card">
                <Card.Header className="bg-primary text-white">
                  Impostazioni Risposte
                </Card.Header>
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

          {/* Colonna destra: area chat */}
          <Col
            md={8}
            className={
              !showMobileConversations || window.innerWidth > 768
                ? ""
                : "d-none"
            }
            style={{
              height: "calc(100vh - 80px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {selectedConversation ? (
              <>
                {/* Header della chat con pulsante back per mobile */}
                <div className="d-flex align-items-center mb-3">
                  {/* Pulsante per tornare alla lista conversazioni (visibile solo su mobile) */}
                  <Button
                    variant="outline-primary"
                    className="d-md-none me-2"
                    onClick={backToConversations}
                  >
                    ←
                  </Button>
                  {/* Titolo della chat con nome dell'utente */}
                  <h2 className="mb-0">
                    Chat con{" "}
                    {conversations.find((c) => c.phone === selectedConversation)
                      ?.name || "Utente"}
                  </h2>
                </div>

                {/* Componente per la visualizzazione scrollabile dei messaggi */}
                <ScrollableChat>
                  {messages.length === 0 ? (
                    // Messaggio quando non ci sono messaggi nella chat
                    <div className="text-center text-muted p-4">
                      <p>Nessun messaggio in questa chat.</p>
                      <p>Inizia una conversazione!</p>
                    </div>
                  ) : (
                    // Container dei messaggi con mapping di tutti i messaggi
                    <div className="messages-container">
                      {messages.map((msg, index) => (
                        <div
                          key={index}
                          className="chat-message-container"
                        >
                          {/* Messaggio singolo con stile diverso per inviati/ricevuti */}
                          <div
                            className={`chat-message ${
                              msg.direction === "sent"
                                ? "sent-message"
                                : "received-message"
                            }`}
                          >
                            <div>{msg.content}</div>
                            {/* Timestamp e stato del messaggio */}
                            <div className="message-timestamp">
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {msg.status && (
                                <span className="ms-2">({msg.status})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollableChat>

                {/* Form per l'inserimento di nuovi messaggi */}
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
              // Messaggio quando nessuna conversazione è selezionata
              <div className="text-center p-5">
                <h3>Seleziona una conversazione</h3>
                <p className="text-muted">
                  Scegli una chat dalla lista per visualizzare i messaggi
                </p>
              </div>
            )}
          </Col>
        </Row>
      </Container>

      {/* Modale per la gestione dei documenti PDF */}
      <Modal
        show={showDocumentModal}
        onHide={() => setShowDocumentModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Gestione Documenti
            {/* Mostra il nome dell'utente per cui si stanno gestendo i documenti */}
            {viewingDocumentsFor && (
              <span className="ms-2 text-muted">
                {conversations.find((c) => c.phone === viewingDocumentsFor)
                  ?.name || viewingDocumentsFor}
              </span>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Sezione per il caricamento di nuovi documenti */}
          <h5>Carica Nuovo Documento</h5>
          <Form.Group className="mb-3">
            <Form.Label>Seleziona un file PDF</Form.Label>
            <Form.Control
              type="file"
              id="pdf-upload"
              onChange={handleFileChange}
              accept="application/pdf"
              disabled={documentLoading}
            />
          </Form.Group>

          {/* Barra di progresso durante il caricamento */}
          {documentLoading && (
            <div className="mb-3">
              <Form.Label>Caricamento in corso...</Form.Label>
              <div className="progress">
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{ width: `${uploadProgress}%` }}
                  aria-valuenow={uploadProgress}
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  {uploadProgress}%
                </div>
              </div>
            </div>
          )}

          {/* Pulsante per avviare il caricamento */}
          <Button
            variant="primary"
            onClick={uploadFile}
            disabled={!selectedFile || documentLoading}
            className="mb-4"
          >
            {documentLoading ? "Caricamento..." : "Carica Documento"}
          </Button>

          {/* Sezione per la visualizzazione dei documenti esistenti */}
          <h5>Documenti Esistenti</h5>
          {viewingDocumentsFor && userDocuments[viewingDocumentsFor] ? (
            userDocuments[viewingDocumentsFor].length > 0 ? (
              <Table
                striped
                bordered
                hover
              >
                <thead>
                  <tr>
                    <th>Nome Documento</th>
                    <th>Chunks</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Lista dei documenti caricati con relativi chunks */}
                  {userDocuments[viewingDocumentsFor].map((doc, index) => (
                    <tr key={index}>
                      <td>{doc.source}</td>
                      <td>
                        <Badge bg="info">{doc.chunks}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-center">
                Nessun documento caricato per questo utente.
              </p>
            )
          ) : (
            // Spinner di caricamento durante il recupero dei documenti
            <div className="text-center p-3">
              <div
                className="spinner-border text-primary"
                role="status"
              >
                <span className="visually-hidden">Caricamento...</span>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowDocumentModal(false)}
          >
            Chiudi
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Manager;
