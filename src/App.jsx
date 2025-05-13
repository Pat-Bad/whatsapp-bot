import "./App.css";
import Login from "./components/Login";
import Manager from "./components/Manager";
import { useState, useEffect } from "react";
import { Container } from "react-bootstrap";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Simulazione verifica token di autenticazione all'avvio
  useEffect(() => {
    const checkAuth = () => {
      // Controllare se esiste un token di autenticazione nel localStorage
      const token = localStorage.getItem("authToken");
      if (token) {
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    };
    
    // Simulazione di un breve ritardo per il controllo dell'autenticazione
    const timer = setTimeout(checkAuth, 500);
    return () => clearTimeout(timer);
  }, []);
  
  // Gestione del login
  const handleLogin = (token) => {
    localStorage.setItem("authToken", token);
    setIsLoggedIn(true);
  };
  
  // Gestione del logout
  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setIsLoggedIn(false);
  };
  
  // Mostro un indicatore di caricamento durante la verifica dell'autenticazione
  if (isLoading) {
    return (
      <Container className="d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Caricamento...</span>
          </div>
          <p className="mt-2">Caricamento in corso...</p>
        </div>
      </Container>
    );
  }
  
  return (
    <div className="app-container">
      {isLoggedIn ? (
        <Manager onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
