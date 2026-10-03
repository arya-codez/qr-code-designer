import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import "./App.css";

const TYPES = ["URL", "Text", "Email", "Phone", "Wi-Fi"];

// localStorage mein recent QR codes isi naam se save honge, aur max kitne rakhne hain
const RECENT_KEY = "qr-designer-recent";
const MAX_RECENT = 10;

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

// ---------- Readability (scan reliability) helpers ----------

// "#rrggbb" ko [r, g, b] numbers mein badalta hai
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Color kitna "bright" hai (0 = kaala, 1 = safed). WCAG ka standard formula.
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Do colors ke beech contrast ratio (1 = same color, 21 = kaala vs safed)
function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Style aur content dekh ke warnings ki list banata hai
function getWarnings(style, payload) {
  const warnings = [];
  if (!payload) return warnings;

  const ratio = contrastRatio(style.fg, style.bg);

  if (luminance(style.fg) > luminance(style.bg)) {
    warnings.push(
      "Foreground is lighter than the background (inverted). Many scanners cannot read inverted QR codes."
    );
  }
  if (ratio < 3) {
    warnings.push(
      `Very low contrast (${ratio.toFixed(1)}:1). This QR code will likely not scan.`
    );
  } else if (ratio < 4.5) {
    warnings.push(
      `Low contrast (${ratio.toFixed(1)}:1). It may be hard to scan in poor light.`
    );
  }
  if (style.margin < 2) {
    warnings.push(
      "Margin is very small. Scanners need empty space around the QR code (4 is recommended)."
    );
  }
  if (style.size < 160) {
    warnings.push("The QR code is small. It may be hard to scan from a distance.");
  }
  if (payload.length > 300) {
    warnings.push(
      "Long content makes a dense QR code. Use a larger size or a lower error correction level."
    );
  }
  return warnings;
}

// ---------- Recent QR codes helpers ----------

// Page khulte hi localStorage se purane recent codes padhta hai.
// Kuch galat ho (khaali, corrupt data) toh khaali list de deta hai.
function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Recent list mein dikhane ke liye chhota label (Wi-Fi ka password nahi dikhata)
function describe(type, f) {
  let text = "";
  if (type === "URL") text = f.url.trim();
  if (type === "Text") text = f.text.trim();
  if (type === "Email") text = f.email.trim();
  if (type === "Phone") text = f.phone.trim();
  if (type === "Wi-Fi") text = f.ssid.trim();
  if (text.length > 28) text = text.slice(0, 28) + "...";
  return `${type}: ${text}`;
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

  // recent QR codes. useState(loadRecent) ek baar page khulte waqt chalta hai,
  // isliye refresh ke baad bhi list wapas aa jaati hai.
  const [recent, setRecent] = useState(loadRecent);

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

  const { payload, error } = buildPayload(type, fields);
  const warnings = getWarnings(style, payload);

  // abhi ka QR recent list mein sabse upar save karta hai.
  // Same content + same look pehle se ho toh duplicate nahi banta, bas upar aa jaata hai.
  const saveRecent = () => {
    if (error) return;
    const key = JSON.stringify([type, payload, style]);
    const item = {
      key,
      type,
      fields,
      style,
      label: describe(type, fields),
      thumb: canvasRef.current.toDataURL("image/png"),
    };
    setRecent((prev) =>
      [item, ...prev.filter((r) => r.key !== key)].slice(0, MAX_RECENT)
    );
  };

  // recent list mein se kisi item par click karne par uski saari settings wapas aa jaati hain
  const reuseRecent = (item) => {
    setType(item.type);
    setFields(item.fields);
    setStyle(item.style);
    setPresetSize(item.style.size);
  };

  // canvas ko PNG image bana ke download karwata hai.
  // Canvas hi preview hai, isliye download bilkul preview jaisa hota hai.
  // Download karte waqt QR recent mein bhi save ho jaata hai.
  const downloadPng = () => {
    const link = document.createElement("a");
    link.download = "qr-code.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    saveRecent();
  };

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

  // recent list badle toh localStorage mein save karo
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (err) {
      console.error("Could not save recent QR codes:", err);
    }
  }, [recent]);

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

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w) => (
            <p key={w} className="warning">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <div className="actions">
        <button className="download" onClick={downloadPng} disabled={!!error}>
          Download PNG
        </button>
        <button className="secondary" onClick={saveRecent} disabled={!!error}>
          Save to recent
        </button>
      </div>

      <div className="recent">
        <div className="recent-header">
          <h2>Recent QR codes</h2>
          {recent.length > 0 && (
            <button className="link-button" onClick={() => setRecent([])}>
              Clear all
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="empty">
            Nothing yet. QR codes you download or save will show up here.
          </p>
        ) : (
          <ul className="recent-list">
            {recent.map((item) => (
              <li key={item.key}>
                <button className="recent-item" onClick={() => reuseRecent(item)}>
                  <img src={item.thumb} alt="" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;