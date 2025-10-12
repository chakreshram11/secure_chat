import React, { useState, useEffect } from "react";
import Login from "./pages/Login";
import Chat from "./pages/Chat";

// ✅ Import toastify
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
  // ✅ Use sessionStorage → supports multiple users in different tabs
  const [token, setToken] = useState(sessionStorage.getItem("token"));

  useEffect(() => {
    if (token) {
      sessionStorage.setItem("token", token);
    } else {
      sessionStorage.removeItem("token");
    }
  }, [token]);

  return (
    <>
      {/* ✅ Global Toast Notifications */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="colored"
      />

      {/* ✅ Show Login if no token, else Chat */}
      {!token ? (
        <Login onLogin={(t) => setToken(t)} />
      ) : (
        <div className="h-screen flex flex-col">
        <Chat token={token} onLogout={() => setToken(null)} />
        </div>
      )}
    </>
  );
}
