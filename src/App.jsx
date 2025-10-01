import React, { useState, useEffect } from "react";
import Login from "./pages/Login";
import Chat from "./pages/Chat";

// ✅ Import toastify
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  return (
    <>
      {/* ✅ Toast container for global notifications */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
      />

      {/* ✅ Conditional rendering for auth */}
      {!token ? (
        <Login onLogin={(t) => setToken(t)} />
      ) : (
        <Chat token={token} onLogout={() => setToken(null)} />
      )}
    </>
  );
}
