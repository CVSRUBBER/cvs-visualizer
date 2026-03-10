import { useState, useRef, useEffect } from "react";

// ─── Persistent texture storage using window.storage ───────────────────────
const STORAGE_KEY = "cvs-textures";

async function loadTextures() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    return result ? JSON.parse(result.value) : [];
  } catch {
    return [];
  }
}

async function saveTextures(textures) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(textures));
  } catch (e) {
    console.error("Storage error", e);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function base64Data(dataUrl) {
  return dataUrl.split(",")[1];
}

function mimeType(dataUrl) {
  return dataUrl.match(/data:([^;]+);/)[1];
}

// ─── AI Surface Replacement via Claude ──────────────────────────────────────
async function generateVisualization(propertyPhoto, texturePhoto, textureName, surface) {
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mimeType(propertyPhoto), data: base64Data(propertyPhoto) }
        },
        {
          type: "image",
          source: { type: "base64", media_type: mimeType(texturePhoto), data: base64Data(texturePhoto) }
        },
        {
          type: "text",
          text: `You are a photorealistic rendering assistant for CVS Rubber Paving & Construction.

The first image is a photo of a client's property (${surface}).
The second image is a rubber paving texture/colour sample called "${textureName}".

Describe in vivid, specific detail exactly how this property would look after the ${surface} is professionally resurfaced with the "${textureName}" rubber paving shown in the second image. 

Be extremely specific about:
- How the colour and texture of the rubber paving changes the surface
- How it interacts with the lighting, shadows, and surroundings in the photo
- The exact areas that would be covered
- The overall transformation and curb appeal improvement

Write this as a professional 3-4 sentence visual description that a salesperson can read aloud to a client while showing them the original photo. Make it vivid and compelling. No markdown, no bullet points.`
        }
      ]
    }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages
    })
  });

  const data = await response.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

// ─── Components ─────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 0" }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: "3px solid #e8e0d4",
        borderTop: "3px solid #2a2a2a",
        animation: "spin 0.8s linear infinite"
      }} />
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8a8070", textAlign: "center", lineHeight: 1.6 }}>
        AI is analysing your photo<br />and applying the texture…
      </p>
    </div>
  );
}

function Toast({ msg, type }) {
  return (
    <div style={{
      position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
      background: type === "error" ? "#3a1a1a" : "#1a2a1a",
      border: `1px solid ${type === "error" ? "#c45a5a" : "#5a9a5a"}`,
      color: type === "error" ? "#f4a0a0" : "#a0d4a0",
      padding: "10px 20px", borderRadius: 30,
      fontFamily: "'DM Sans', sans-serif", fontSize: 13,
      zIndex: 999, whiteSpace: "nowrap",
      animation: "fadeUp 0.3s ease",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
    }}>
      {msg}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home"); // home | manage | visualize | result
  const [textures, setTextures] = useState([]);
  const [storageReady, setStorageReady] = useState(false);

  // Visualizer state
  const [propertyPhoto, setPropertyPhoto] = useState(null);
  const [selectedTexture, setSelectedTexture] = useState(null);
  const [surface, setSurface] = useState("Driveway");
  const [generating, setGenerating] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [toast, setToast] = useState(null);

  // Manage textures state
  const [newTextureName, setNewTextureName] = useState("");
  const [newTextureFamily, setNewTextureFamily] = useState("Standard");
  const [newTexturePhoto, setNewTexturePhoto] = useState(null);
  const [addingTexture, setAddingTexture] = useState(false);

  const propertyInputRef = useRef(null);
  const textureInputRef = useRef(null);

  useEffect(() => {
    loadTextures().then(t => {
      setTextures(t);
      setStorageReady(true);
    });
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddTexture = async () => {
    if (!newTextureName.trim() || !newTexturePhoto) {
      showToast("Please add a name and photo.", "error");
      return;
    }
    setAddingTexture(true);
    const updated = [...textures, {
      id: Date.now().toString(),
      name: newTextureName.trim(),
      family: newTextureFamily,
      photo: newTexturePhoto,
    }];
    setTextures(updated);
    await saveTextures(updated);
    setNewTextureName("");
    setNewTextureFamily("Standard");
    setNewTexturePhoto(null);
    setAddingTexture(false);
    showToast(`✓ "${newTextureName}" added`);
  };

  const handleDeleteTexture = async (id) => {
    const updated = textures.filter(t => t.id !== id);
    setTextures(updated);
    await saveTextures(updated);
    showToast("Texture removed");
  };

  const handleGenerate = async () => {
    if (!propertyPhoto || !selectedTexture) {
      showToast("Please select a property photo and texture.", "error");
      return;
    }
    setGenerating(true);
    setScreen("result");
    try {
      const desc = await generateVisualization(propertyPhoto, selectedTexture.photo, selectedTexture.name, surface);
      setAiDescription(desc);
    } catch (e) {
      setAiDescription(`Imagine your ${surface.toLowerCase()} transformed with ${selectedTexture.name} rubber paving — a durable, slip-resistant surface that enhances your property's curb appeal and lasts for decades.`);
      showToast("Used fallback description", "error");
    }
    setGenerating(false);
  };

  const SURFACES = ["Driveway", "Patio / Backyard", "Pool Deck", "Walkway / Path", "Steps", "Garage Floor"];
  const FAMILIES = ["Standard", "Premium", "Textured", "Smooth", "Speckled", "Custom"];

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    screen: {
      minHeight: "100vh",
      background: "#f5f2ee",
      fontFamily: "'DM Sans', sans-serif",
      paddingBottom: 40,
    },
    header: {
      background: "#1e1e1e",
      padding: "16px 20px",
      display: "flex", alignItems: "center", gap: 12,
    },
    backBtn: {
      background: "none", border: "none", cursor: "pointer",
      color: "#a09070", padding: 0, fontSize: 20, lineHeight: 1,
    },
    headerTitle: {
      color: "#e8d5a8", fontSize: 16, fontWeight: 600,
      letterSpacing: "0.04em", flex: 1,
    },
    body: { padding: "20px 16px" },
    card: {
      background: "white", borderRadius: 16,
      padding: 20, marginBottom: 16,
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      border: "1px solid #ede8e0",
    },
    label: {
      fontSize: 10, letterSpacing: "0.14em",
      color: "#a09080", marginBottom: 8, display: "block",
      fontWeight: 500,
    },
    input: {
      width: "100%", padding: "12px 14px",
      borderRadius: 10, border: "1px solid #e0d8cc",
      fontSize: 14, color: "#1e1e1e", background: "#faf8f5",
      fontFamily: "'DM Sans', sans-serif",
      outline: "none",
    },
    select: {
      width: "100%", padding: "12px 14px",
      borderRadius: 10, border: "1px solid #e0d8cc",
      fontSize: 14, color: "#1e1e1e", background: "#faf8f5",
      fontFamily: "'DM Sans', sans-serif",
      outline: "none", appearance: "none",
    },
    btnPrimary: {
      width: "100%", padding: "15px",
      background: "#1e1e1e", color: "#e8d5a8",
      border: "none", borderRadius: 12, cursor: "pointer",
      fontSize: 15, fontWeight: 600,
      letterSpacing: "0.03em",
      fontFamily: "'DM Sans', sans-serif",
    },
    btnSecondary: {
      width: "100%", padding: "13px",
      background: "transparent", color: "#6a6050",
      border: "1px solid #d4ccc0", borderRadius: 12, cursor: "pointer",
      fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    },
    photoUpload: {
      border: "2px dashed #d4ccc0", borderRadius: 12,
      padding: "28px 16px", textAlign: "center",
      cursor: "pointer", background: "#faf8f5",
      transition: "all 0.2s",
    },
  };

  // ── Home Screen ─────────────────────────────────────────────────────────────
  if (screen === "home") return (
    <div style={s.screen}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>

      {/* Hero */}
      <div style={{
        background: "linear-gradient(160deg, #1e1e1e 0%, #2e2820 100%)",
        padding: "48px 24px 40px",
        textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: "linear-gradient(135deg, #e8d5a8, #c4a870)",
          margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="32" height="32" fill="#1e1e1e" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            <path d="M9 8h2v8H9zm4 0h2v8h-2z" style={{display:"none"}}/>
          </svg>
        </div>
        <h1 style={{
          color: "#e8d5a8", fontSize: 28, fontWeight: 700,
          letterSpacing: "-0.5px", marginBottom: 8,
        }}>
          CVS Rubber Paving
        </h1>
        <p style={{ color: "#7a7060", fontSize: 14, lineHeight: 1.5 }}>
          On-site visualization tool
        </p>
      </div>

      <div style={{ padding: "24px 16px" }}>
        {/* Main CTA */}
        <div style={{
          ...s.card,
          background: "linear-gradient(135deg, #1e1e1e, #2e2820)",
          border: "none", textAlign: "center", padding: "28px 20px",
          animation: "fadeUp 0.4s ease",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
          <h2 style={{ color: "#e8d5a8", fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Visualize for a Client
          </h2>
          <p style={{ color: "#7a7060", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
            Take a photo on-site, pick a texture,<br />and show them the transformation instantly.
          </p>
          <button
            onClick={() => { setPropertyPhoto(null); setSelectedTexture(null); setAiDescription(""); setScreen("visualize"); }}
            style={{ ...s.btnPrimary, background: "#e8d5a8", color: "#1e1e1e" }}
          >
            Start Visualization →
          </button>
        </div>

        {/* Manage textures */}
        <div style={{ ...s.card, animation: "fadeUp 0.5s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: "#f5f0e8",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, flexShrink: 0,
            }}>🎨</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#1e1e1e", marginBottom: 2 }}>
                Manage Textures
              </p>
              <p style={{ fontSize: 12, color: "#9a9080" }}>
                {textures.length} texture{textures.length !== 1 ? "s" : ""} uploaded
              </p>
            </div>
            <button onClick={() => setScreen("manage")} style={{
              padding: "8px 16px", borderRadius: 8,
              background: "#f5f0e8", border: "none",
              fontSize: 13, color: "#5a5040", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
            }}>
              Edit →
            </button>
          </div>
        </div>

        {textures.length === 0 && (
          <div style={{
            textAlign: "center", padding: "16px",
            background: "#fdf9f4", borderRadius: 12,
            border: "1px dashed #d4ccc0",
          }}>
            <p style={{ fontSize: 13, color: "#a09080", lineHeight: 1.6 }}>
              👆 Add your rubber paving textures first,<br />then you're ready to visualize on-site.
            </p>
          </div>
        )}
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );

  // ── Manage Textures Screen ──────────────────────────────────────────────────
  if (screen === "manage") return (
    <div style={s.screen}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={s.header}>
        <button style={s.backBtn} onClick={() => setScreen("home")}>←</button>
        <span style={s.headerTitle}>My Textures & Colours</span>
        <span style={{ color: "#7a7060", fontSize: 12 }}>{textures.length} saved</span>
      </div>

      <div style={s.body}>
        {/* Add new texture */}
        <div style={{ ...s.card, animation: "fadeUp 0.3s ease" }}>
          <span style={s.label}>ADD NEW TEXTURE</span>

          {newTexturePhoto ? (
            <div style={{ position: "relative", marginBottom: 12 }}>
              <img src={newTexturePhoto} alt="preview" style={{
                width: "100%", height: 140, objectFit: "cover",
                borderRadius: 10, border: "1px solid #e0d8cc",
              }} />
              <button onClick={() => setNewTexturePhoto(null)} style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(30,30,30,0.7)", border: "none",
                borderRadius: "50%", width: 28, height: 28,
                color: "white", cursor: "pointer", fontSize: 14,
              }}>×</button>
            </div>
          ) : (
            <div style={s.photoUpload} onClick={() => textureInputRef.current.click()}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
              <p style={{ fontSize: 13, color: "#9a9080" }}>Tap to upload texture photo</p>
            </div>
          )}
          <input ref={textureInputRef} type="file" accept="image/*"
            style={{ display: "none" }}
            onChange={async e => {
              if (e.target.files[0]) setNewTexturePhoto(await fileToBase64(e.target.files[0]));
            }} />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <input
              placeholder="Texture name (e.g. Charcoal Black)"
              value={newTextureName}
              onChange={e => setNewTextureName(e.target.value)}
              style={{ ...s.input, flex: 2 }}
            />
            <select value={newTextureFamily} onChange={e => setNewTextureFamily(e.target.value)}
              style={{ ...s.select, flex: 1 }}>
              {FAMILIES.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>

          <button onClick={handleAddTexture} disabled={addingTexture} style={{
            ...s.btnPrimary, marginTop: 12,
            opacity: addingTexture ? 0.6 : 1,
          }}>
            {addingTexture ? "Saving…" : "+ Add Texture"}
          </button>
        </div>

        {/* Existing textures */}
        {textures.length > 0 && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <span style={{ ...s.label, marginBottom: 12 }}>SAVED TEXTURES ({textures.length})</span>
            {textures.map((t) => (
              <div key={t.id} style={{
                ...s.card, padding: 14, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <img src={t.photo} alt={t.name} style={{
                  width: 56, height: 56, borderRadius: 10,
                  objectFit: "cover", flexShrink: 0,
                  border: "1px solid #e0d8cc",
                }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#1e1e1e" }}>{t.name}</p>
                  <p style={{ fontSize: 11, color: "#a09080", marginTop: 2 }}>{t.family}</p>
                </div>
                <button onClick={() => handleDeleteTexture(t.id)} style={{
                  background: "#fdf0ee", border: "none", borderRadius: 8,
                  width: 32, height: 32, cursor: "pointer",
                  fontSize: 16, color: "#c45a5a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>🗑</button>
              </div>
            ))}
          </div>
        )}

        {textures.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "#a09080", fontSize: 13 }}>
            No textures yet. Add your first one above.
          </div>
        )}
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );

  // ── Visualize Screen ────────────────────────────────────────────────────────
  if (screen === "visualize") return (
    <div style={s.screen}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={s.header}>
        <button style={s.backBtn} onClick={() => setScreen("home")}>←</button>
        <span style={s.headerTitle}>New Visualization</span>
      </div>

      <div style={s.body}>
        {/* Step 1: Property photo */}
        <div style={{ ...s.card, animation: "fadeUp 0.3s ease" }}>
          <span style={s.label}>STEP 1 — PROPERTY PHOTO</span>
          {propertyPhoto ? (
            <div style={{ position: "relative" }}>
              <img src={propertyPhoto} alt="property" style={{
                width: "100%", borderRadius: 10, display: "block",
                maxHeight: 220, objectFit: "cover",
                border: "1px solid #e0d8cc",
              }} />
              <button onClick={() => setPropertyPhoto(null)} style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(30,30,30,0.75)", border: "none",
                borderRadius: "50%", width: 30, height: 30,
                color: "white", cursor: "pointer", fontSize: 16,
              }}>×</button>
              <div style={{
                position: "absolute", bottom: 8, left: 8,
                background: "rgba(30,30,30,0.75)",
                borderRadius: 20, padding: "4px 10px",
              }}>
                <span style={{ color: "#a0d4a0", fontSize: 11 }}>✓ Photo ready</span>
              </div>
            </div>
          ) : (
            <div style={s.photoUpload} onClick={() => propertyInputRef.current.click()}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📸</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#3a3020", marginBottom: 4 }}>
                Take or upload a photo
              </p>
              <p style={{ fontSize: 12, color: "#a09080" }}>
                Driveway, patio, pool deck, walkway
              </p>
            </div>
          )}
          <input ref={propertyInputRef} type="file" accept="image/*"
            style={{ display: "none" }}
            onChange={async e => {
              if (e.target.files[0]) setPropertyPhoto(await fileToBase64(e.target.files[0]));
            }} />
        </div>

        {/* Step 2: Surface type */}
        <div style={{ ...s.card, animation: "fadeUp 0.35s ease" }}>
          <span style={s.label}>STEP 2 — SURFACE TYPE</span>
          <select value={surface} onChange={e => setSurface(e.target.value)} style={s.select}>
            {SURFACES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Step 3: Pick texture */}
        <div style={{ ...s.card, animation: "fadeUp 0.4s ease" }}>
          <span style={s.label}>STEP 3 — SELECT TEXTURE</span>

          {textures.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ fontSize: 13, color: "#a09080", marginBottom: 12 }}>
                No textures uploaded yet.
              </p>
              <button onClick={() => setScreen("manage")} style={{
                ...s.btnSecondary, width: "auto", padding: "8px 20px",
              }}>
                + Add Textures →
              </button>
            </div>
          ) : (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10,
            }}>
              {textures.map(t => (
                <div key={t.id} onClick={() => setSelectedTexture(t)} style={{
                  borderRadius: 12, overflow: "hidden", cursor: "pointer",
                  border: selectedTexture?.id === t.id
                    ? "3px solid #1e1e1e"
                    : "2px solid transparent",
                  boxShadow: selectedTexture?.id === t.id
                    ? "0 0 0 2px #e8d5a8" : "0 2px 8px rgba(0,0,0,0.1)",
                  transition: "all 0.15s",
                  position: "relative",
                }}>
                  <img src={t.photo} alt={t.name} style={{
                    width: "100%", aspectRatio: "1",
                    objectFit: "cover", display: "block",
                  }} />
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    background: "linear-gradient(transparent, rgba(20,15,10,0.85))",
                    padding: "16px 6px 6px",
                  }}>
                    <p style={{ fontSize: 10, color: "#e8d5a8", fontWeight: 600, textAlign: "center" }}>
                      {t.name}
                    </p>
                  </div>
                  {selectedTexture?.id === t.id && (
                    <div style={{
                      position: "absolute", top: 6, right: 6,
                      background: "#1e1e1e", borderRadius: "50%",
                      width: 20, height: 20,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11,
                    }}>✓</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={!propertyPhoto || !selectedTexture}
          style={{
            ...s.btnPrimary,
            opacity: (!propertyPhoto || !selectedTexture) ? 0.4 : 1,
            animation: "fadeUp 0.5s ease",
          }}
        >
          Generate AI Visualization →
        </button>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );

  // ── Result Screen ───────────────────────────────────────────────────────────
  if (screen === "result") return (
    <div style={s.screen}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>

      <div style={s.header}>
        <button style={s.backBtn} onClick={() => setScreen("visualize")}>←</button>
        <span style={s.headerTitle}>Visualization Result</span>
        <span style={{ fontSize: 11, color: "#7a7060" }}>{surface}</span>
      </div>

      <div style={s.body}>
        {/* Before / After */}
        <div style={{ ...s.card, padding: 0, overflow: "hidden", animation: "fadeIn 0.4s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ position: "relative" }}>
              <div style={{
                position: "absolute", top: 8, left: 8, zIndex: 2,
                background: "rgba(30,30,30,0.75)", borderRadius: 20,
                padding: "3px 10px",
              }}>
                <span style={{ fontSize: 10, color: "#a09080", letterSpacing: "0.08em" }}>BEFORE</span>
              </div>
              <img src={propertyPhoto} alt="before" style={{
                width: "100%", height: 200, objectFit: "cover", display: "block",
              }} />
            </div>
            <div style={{ position: "relative", background: "#1a1a1a" }}>
              <div style={{
                position: "absolute", top: 8, left: 8, zIndex: 2,
                background: "rgba(30,30,30,0.85)", borderRadius: 20,
                padding: "3px 10px",
              }}>
                <span style={{ fontSize: 10, color: "#e8d5a8", letterSpacing: "0.08em" }}>WITH CVS</span>
              </div>
              <img src={propertyPhoto} alt="after" style={{
                width: "100%", height: 200, objectFit: "cover", display: "block",
                opacity: 0.55,
              }} />
              {selectedTexture && (
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `url(${selectedTexture.photo})`,
                  backgroundSize: "120px",
                  backgroundRepeat: "repeat",
                  mixBlendMode: "multiply",
                  opacity: 0.75,
                }} />
              )}
              {selectedTexture && (
                <div style={{
                  position: "absolute", bottom: 8, left: 8,
                  background: "rgba(30,30,30,0.85)",
                  borderRadius: 20, padding: "4px 10px",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <img src={selectedTexture.photo} alt="" style={{
                    width: 12, height: 12, borderRadius: "50%", objectFit: "cover",
                  }} />
                  <span style={{ fontSize: 10, color: "#e8d5a8" }}>{selectedTexture.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Texture strip */}
          {selectedTexture && (
            <div style={{
              padding: "14px 16px",
              borderTop: "1px solid #ede8e0",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <img src={selectedTexture.photo} alt={selectedTexture.name} style={{
                width: 48, height: 48, borderRadius: 8, objectFit: "cover",
                border: "1px solid #e0d8cc",
              }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1e1e1e" }}>{selectedTexture.name}</p>
                <p style={{ fontSize: 11, color: "#a09080", marginTop: 2 }}>
                  {selectedTexture.family} · {surface}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* AI Description */}
        <div style={{ ...s.card, animation: "fadeUp 0.4s ease" }}>
          <span style={s.label}>AI SURFACE ANALYSIS</span>
          {generating ? (
            <Spinner />
          ) : (
            <p style={{
              fontSize: 15, lineHeight: 1.75, color: "#2a2218",
              fontStyle: "italic", fontWeight: 300,
            }}>
              "{aiDescription}"
            </p>
          )}
        </div>

        {/* CVS branding footer */}
        <div style={{
          ...s.card,
          background: "#1e1e1e",
          textAlign: "center",
          animation: "fadeUp 0.5s ease",
        }}>
          <p style={{ color: "#e8d5a8", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            CVS Rubber Paving & Construction
          </p>
          <p style={{ color: "#6a6050", fontSize: 12 }}>
            Professional rubber paving · {new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp 0.55s ease" }}>
          <button onClick={() => {
            const link = document.createElement("a");
            link.download = `CVS-quote-${Date.now()}.txt`;
            link.href = `data:text/plain;charset=utf-8,CVS Rubber Paving & Construction%0A${surface} - ${selectedTexture?.name}%0A${new Date().toLocaleDateString()}%0A%0A${aiDescription}`;
            link.click();
            showToast("✓ Description saved — attach your screenshot to the quote");
          }} style={s.btnPrimary}>
            💾 Save Description for Quote
          </button>
          <button onClick={() => { setScreen("visualize"); setAiDescription(""); }} style={s.btnSecondary}>
            Try a Different Texture
          </button>
          <button onClick={() => { setScreen("home"); setPropertyPhoto(null); setSelectedTexture(null); setAiDescription(""); }} style={s.btnSecondary}>
            ← Back to Home
          </button>
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );

  return null;
}
