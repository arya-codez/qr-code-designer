import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import "./App.css";

const TYPES = ["URL", "Text", "Email", "Phone", "Wi-Fi"];

// Predefined looks. Sab mein dark foreground aur light background rakha hai,
// kyunki ulta (light on dark) QR kai scanners padh nahi pate.
const PRESETS = [
  { name: "Classic", fg: "#000000", bg: "#ffffff", ecl: "M", margin: 4 },
  { name: "Ocean", fg: "#0b3d91", bg: "#e8f1ff", ecl: "M", margin: 4 },
  { name: "Forest", fg: "#14532d", bg: "#ecfdf5", ecl: "Q", margin: 4 },
  { name: "Sunset", fg: "#9a3412", bg: "#fff7ed", ecl: "Q", margin: 4 },
  { name: "Slate", fg: "#1f2937", bg: "#e5e7eb", ecl: "H", margin: 4 },
];

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

  // QR ke look se jude saare settings ek object mein
  const [style, setStyle] = useState({
    size: 256,
    margin: 4,
    fg: "#000000",
    bg: "#ffffff",
    ecl: "M",
  });

  // preset lagate waqt size kya tha (initial Classic preset 256 par hai)
  const [presetSize, setPresetSize] = useState(256);

  const canvasRef = useRef(null);

  // ek field / ek style setting badalne ke helpers
  const update = (key, value) => setFields({ ...fields, [key]: value });
  const updateStyle = (key, value) => setStyle({ ...style, [key]: value });

  // preset chunne par sirf colors, ecl aur margin badlte hain.
  // size nahi badalta, bas yaad rakhte hain ki preset kis size par laga tha.
  const applyPreset = (p) => {
    setStyle({ ...style, fg: p.fg, bg: p.bg, ecl: p.ecl, margin: p.margin });
    setPresetSize(style.size);
  };

  // abhi ke settings kis preset se match karte hain (agar karte hain).
  // size alag ho gaya ho toh koi preset active nahi maana jaata.
  const activePreset =
    style.size === presetSize
      ? PRESETS.find(
          (p) =>
            p.fg === style.fg &&
            p.bg === style.bg &&
            p.ecl === style.ecl &&
            p.margin === style.margin
        )
      : undefined;

  // canvas ko PNG image bana ke download karwata hai.
  // Canvas hi preview hai, isliye download bilkul preview jaisa hota hai.
  const downloadPng = () => {
    const link = document.createElement("a");
    link.download = "qr-code.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const { payload, error } = buildPayload(type, fields);

  // payload ya style badle toh QR dobara draw karo (sirf tab jab input sahi ho)
  useEffect(() => {
    if (payload) {
      QRCode.toCanvas(
        canvasRef.current,
        payload,
        {
          width: style.size,
          margin: style.margin,
          errorCorrectionLevel: style.ecl,
          color: { dark: style.fg, light: style.bg },
        },
        (err) => {
          if (err) console.error(err);
        }
      );
    }
  }, [payload, style]);

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

      <div className="customize">
        <h2>Presets</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className={p === activePreset ? "preset active" : "preset"}
              onClick={() => applyPreset(p)}
            >
              <span
                className="swatch"
                style={{ background: p.bg, borderColor: p.fg }}
              >
                <span className="dot" style={{ background: p.fg }}></span>
              </span>
              {p.name}
            </button>
          ))}
        </div>

        <h2>Customize</h2>

        <label className="control">
          Size: {style.size}px
          <input
            type="range"
            min="128"
            max="512"
            step="16"
            value={style.size}
            onChange={(e) => updateStyle("size", Number(e.target.value))}
          />
        </label>

        <label className="control">
          Margin: {style.margin}
          <input
            type="range"
            min="0"
            max="10"
            value={style.margin}
            onChange={(e) => updateStyle("margin", Number(e.target.value))}
          />
        </label>

        <div className="color-row">
          <label className="control">
            Foreground
            <input
              type="color"
              value={style.fg}
              onChange={(e) => updateStyle("fg", e.target.value)}
            />
          </label>
          <label className="control">
            Background
            <input
              type="color"
              value={style.bg}
              onChange={(e) => updateStyle("bg", e.target.value)}
            />
          </label>
        </div>

        <label className="control">
          Error correction
          <select
            value={style.ecl}
            onChange={(e) => updateStyle("ecl", e.target.value)}
          >
            <option value="L">Low (7%)</option>
            <option value="M">Medium (15%)</option>
            <option value="Q">Quartile (25%)</option>
            <option value="H">High (30%)</option>
          </select>
        </label>
      </div>

      <canvas
        ref={canvasRef}
        style={{ display: error ? "none" : "inline-block" }}
      ></canvas>

      <button className="download" onClick={downloadPng} disabled={!!error}>
        Download PNG
      </button>
    </div>
  );
}

export default App;