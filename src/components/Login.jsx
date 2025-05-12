import React, { useState } from "react";
import { Container, Row, Col, Form, Button, Alert } from "react-bootstrap";

const Login = ({ onLogin }) => {
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLoginData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");

    const { username, password } = loginData;

    if (!username) {
      setError("Per favore, inserisci lo username");
      return;
    }

    if (!password) {
      setError("Per favore, inserisci la password");
      return;
    }

    setLoading(true);

    // Verifica le credenziali con le variabili d'ambiente
    if (username === import.meta.env.VITE_APP_USR_UI && 
        password === import.meta.env.VITE_APP_PWD_UI) {
      setTimeout(() => {
        setLoading(false);
        onLogin(); // Chiama la funzione onLogin passata come prop
      }, 1000);
    } else {
      setTimeout(() => {
        setLoading(false);
        setError("Username o password non validi");
      }, 1000);
    }
  };

  return (
    <Container className="container-fluid d-flex justify-content-center mt-5">
      <Row>
        <Col md={12}>
          <Form onSubmit={handleLogin}>
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

            <Button
              variant="primary"
              type="submit"
              className="w-100"
              disabled={loading}
            >
              {loading ? "Accesso in corso..." : "Login"}
            </Button>

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
