import { Container, Row, Col } from "react-bootstrap";

const Manager = () => {
  return (
    <Container className="container-fluid">
      <Row>
        <Col>
          <h1 className="mb-3">Manage your users</h1>
          {/* mappare gli user e poi mostrare:
          <Card
            style={{
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              border: "none",
            }}
          >
            <Card.Body>
              <Card.Title>{user.companyName}</Card.Title>
              <Card.Text>
                <strong>ID:</strong> {user.OrganizationID}
                <br />
                <strong>Telefono:</strong> {user.phone}
              </Card.Text>
            </Card.Body>
          </Card>
          */}
        </Col>
      </Row>
    </Container>
  );
};
export default Manager;
