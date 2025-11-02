import React, { useState } from "react";
import { supabase } from "./integrations/supabase/client";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Esperando archivo...");
  const [questions, setQuestions] = useState<any[]>([]);

  // 📤 Subir PDF a Supabase
  const handleUpload = async () => {
    try {
      if (!file) {
        alert("Selecciona un archivo PDF primero");
        return;
      }

      setStatus("Subiendo archivo...");

      const fileName = `uploads/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("pdfs")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("pdfs").getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      setStatus("✅ PDF subido. Analizando con IA...");

      // Llamada a la API de IA
      const response = await fetch("/api/generateTest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfUrl: publicUrl }),
      });

      const result = await response.json();

      if (!result.success) throw new Error(result.error || "Error al generar el test");

      setQuestions(result.questions);
      setStatus("✅ Test generado correctamente 🎉");
    } catch (error: any) {
      console.error(error);
      setStatus("❌ Error al subir o analizar el PDF");
    }
  };

  return (
    <div style={{ fontFamily: "Arial", padding: 30 }}>
      <h1>🧠 Generador de Tests con IA</h1>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={handleUpload}
        style={{ marginLeft: 10, padding: "5px 10px", cursor: "pointer" }}
      >
        Subir y generar test
      </button>

      <p>{status}</p>

      {questions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>📝 Preguntas generadas</h2>
          {questions.map((q, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #ccc",
                borderRadius: 10,
                padding: 15,
                marginBottom: 10,
              }}
            >
              <strong>
                {i + 1}. {q.question}
              </strong>
              <ul>
                {q.options.map((opt: string, idx: number) => (
                  <li key={idx}>{opt}</li>
                ))}
              </ul>
              <p>✅ Respuesta correcta: {q.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

