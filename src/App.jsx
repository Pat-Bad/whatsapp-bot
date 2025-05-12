import "./App.css";
import Login from "./components/Login";
import Manager from "./components/Manager";
import { useState } from "react";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  return (
    <>
      {isLoggedIn ? <Manager /> : <Login onLogin={() => setIsLoggedIn(true)} />}
    </>
  );
}

export default App;
