// Importazione delle dipendenze necessarie
import React, { useState } from "react";
import { Container, Row, Col, Form, Button, Alert } from "react-bootstrap";

// Componente Login che accetta una prop onLogin per gestire l'autenticazione
const Login = ({ onLogin }) => {
  // Stati per gestire i dati del form, lo stato di caricamento e gli errori
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Gestisce i cambiamenti nei campi del form
  const handleChange = (e) => {
    const { name, value } = e.target;
    setLoginData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // Gestisce il submit del form
  const handleLogin = (e) => {
    e.preventDefault();
    setError("");

    const { username, password } = loginData;

    // Validazione dei campi
    if (!username) {
      setError("Per favore, inserisci lo username");
      return;
    }

    if (!password) {
      setError("Per favore, inserisci la password");
      return;
    }

    setLoading(true);

    // Verifica delle credenziali contro le variabili d'ambiente
    if (username === import.meta.env.VITE_APP_USR_UI && 
        password === import.meta.env.VITE_APP_PWD_UI) {
      // Simulazione di una chiamata API con setTimeout
      setTimeout(() => {
        setLoading(false);
        onLogin(); // Chiamata alla funzione di callback per l'autenticazione
      }, 1000);
    } else {
      // Gestione delle credenziali non valide
      setTimeout(() => {
        setLoading(false);
        setError("Username o password non validi");
      }, 1000);
    }
  };

  // Renderizzazione del form di login
  return (
    <Container className="container-fluid d-flex justify-content-center mt-5">
      <Row>
        <Col md={12}>
          <Form onSubmit={handleLogin}>
            {/* Campo username */}
            <Form.Group
              controlId="formUsername"
              className="mb-3"
            >
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                name="username"
                placeholder="Inserisci username"
                value={loginData.username}
                onChange={handleChange}
                disabled={loading}
              />
            </Form.Group>

            {/* Campo password */}
            <Form.Group
              controlId="formPassword"
              className="mb-3"
            >
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                name="password"
                placeholder="Inserisci password"
                value={loginData.password}
                onChange={handleChange}
                disabled={loading}
              />
            </Form.Group>

            {/* Pulsante di submit */}
            <Button
              variant="primary"
              type="submit"
              className="w-100"
              disabled={loading}
            >
              {loading ? "Accesso in corso..." : "Login"}
            </Button>

            {/* Visualizzazione degli errori */}
            {error && (
              <Alert
                variant="danger"
                className="mt-3"
              >
                {error}
              </Alert>
            )}
          </Form>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;
