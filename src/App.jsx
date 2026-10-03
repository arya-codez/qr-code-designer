import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import "./App.css";

const TYPES = ["URL", "Text", "Email", "Phone", "Wi-Fi"];

// Wi-Fi string mein ye special characters aaye toh unke aage \ lagana padta hai
function escapeWifi(s) {
  return s.replace(/([\\;,:"])/g, "\\$1");
}

// Type aur fields leke QR mein jaane wali string banata hai.
// Agar input galat hai toh { error: "..." } return karta hai.
function buildPayload(type, f) {
  if (type === "URL") {
    const value = f.url.trim();
    if (!value) return { error: "Please enter a URL." };
    try {
      const u = new URL(value);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { error: "URL must start with http:// or https://" };
      }
    } catch {
      return { error: "Not a valid URL. Try something like https://example.com" };
    }
    return { payload: value };
  }

  if (type === "Text") {
    if (!f.text.trim()) return { error: "Please enter some text." };
    return { payload: f.text };
  }

  if (type === "Email") {
    const value = f.email.trim();
    if (!value) return { error: "Please enter an email address." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { error: "Not a valid email address." };
    }
    return { payload: `mailto:${value}` };
  }

  if (type === "Phone") {
    const cleaned = f.phone.replace(/[\s-]/g, "");
    if (!cleaned) return { error: "Please enter a phone number." };
    if (!/^\+?\d{7,15}$/.test(cleaned)) {
      return { error: "Phone must be 7-15 digits (a leading + is allowed)." };
    }
    return { payload: `tel:${cleaned}` };
  }

  if (type === "Wi-Fi") {
    if (!f.ssid.trim()) return { error: "Please enter the network name (SSID)." };
    if (f.security !== "nopass" && !f.password) {
      return { error: "Please enter the Wi-Fi password." };
    }
    if (f.security === "WPA" && f.password.length < 8) {
      return { error: "WPA passwords must be at least 8 characters." };
    }
    const pass = f.security === "nopass" ? "" : escapeWifi(f.password);
    return {
      payload: `WIFI:T:${f.security};S:${escapeWifi(f.ssid)};P:${pass};;`,
    };
  }

  return { error: "Unknown QR type." };
}

function App() {
  const [type, setType] = useState("URL");
  const [fields, setFields] = useState({
    url: "https://example.com",
    text: "",
    email: "",
    phone: "",
    ssid: "",
    password: "",
    security: "WPA",
  });
  const canvasRef = useRef(null);

  // ek field badalne ka helper
  const update = (key, value) => setFields({ ...fields, [key]: value });

  const { payload, error } = buildPayload(type, fields);

  // payload badle toh QR dobara draw karo (sirf tab jab input sahi ho)
  useEffect(() => {
    if (payload) {
      QRCode.toCanvas(canvasRef.current, payload, { width: 256 }, (err) => {
        if (err) console.error(err);
      });
    }
  }, [payload]);

  return (
    <div className="app">
      <h1>QR Code Designer</h1>

      <div className="tabs">
        {TYPES.map((t) => (
          <button
            key={t}
            className={t === type ? "tab active" : "tab"}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {type === "URL" && (
        <input
          value={fields.url}
          onChange={(e) => update("url", e.target.value)}
          placeholder="https://example.com"
        />
      )}

      {type === "Text" && (
        <textarea
          value={fields.text}
          onChange={(e) => update("text", e.target.value)}
          placeholder="Enter any text"
        />
      )}

      {type === "Email" && (
        <input
          value={fields.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="name@example.com"
        />
      )}

      {type === "Phone" && (
        <input
          value={fields.phone}
          onChange={(e) => update("phone", e.target.value)}
          placeholder="+91 98765 43210"
        />
      )}

      {type === "Wi-Fi" && (
        <>
          <input
            value={fields.ssid}
            onChange={(e) => update("ssid", e.target.value)}
            placeholder="Network name (SSID)"
          />
          <select
            value={fields.security}
            onChange={(e) => update("security", e.target.value)}
          >
            <option value="WPA">WPA/WPA2</option>
            <option value="WEP">WEP</option>
            <option value="nopass">No password</option>
          </select>
          {fields.security !== "nopass" && (
            <input
              value={fields.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Password"
            />
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      <canvas
        ref={canvasRef}
        style={{ display: error ? "none" : "inline-block" }}
      ></canvas>
    </div>
  );
}

export default App;