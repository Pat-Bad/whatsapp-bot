import React, { useState } from "react";
import { Container, Row, Col, Form, Button, Alert } from "react-bootstrap";

const Login = () => {
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const navigate = useNavigate(); //da usare una volta collegato a be dopo login per portarlo al manager.jsx dove vede gli user con le card

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLoginData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    setTimeout(() => {
      // Da collegare a backend, lo faccio in intellij?
    }, 1000);
  };

  return (
    <Container className="container-fluid d-flex">
      <Row>
        <Col
          col-12
          className="d-flex justify-content-center"
        >
          <Form onSubmit={handleLogin}>
            <Form.Group
              controlId="formUsername"
              className="mb-3"
            >
              <Form.Label style={{ marginRight: "10px" }}>Username</Form.Label>
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
              <Form.Label style={{ marginRight: "10px" }}>Password</Form.Label>
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
              className="w-100 mt-3"
              disabled={loading}
            >
              {loading ? "Accesso in corso..." : "Login"}
            </Button>
          </Form>

          {error && (
            <Alert
              variant="danger"
              className="mt-3"
            >
              {error}
            </Alert>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default Login;
