// src/App.tsx
import React, { useState } from "react";
import { supabase } from "./integrations/supabase/client";

type Question = {
  id: string;
  question: string;
  options: string[];
  answer: number; // índice 0..3
  explanation?: string;
};

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState<number | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setStatus("⚠️ Selecciona un archivo PDF primero.");
      return;
    }

    setStatus("⏳ Subiendo archivo...");
    try {
      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      const filePath = `uploads/${Date.now()}_${safeName}`;

      const { data: upData, error: uploadError } = await supabase.storage
        .from("pdfs")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(filePath);
      const archivoUrl = urlData.publicUrl;

      // Guardar metadatos en tabla 'pdfs' (opcional)
      const { error: insertError } = await supabase.from("pdfs").insert([
        { nombre: safeName, archivo_url: archivoUrl },
      ]);
      if (insertError) console.warn("Warning inserting metadata:", insertError);

      setStatus("✅ PDF subido. Generando preguntas con IA...");

      // -------------- llamar al endpoint serverless --------------
      setLoadingAI(true);
      const resp = await fetch("/api/generateTest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfUrl: archivoUrl, maxQuestions: 10 }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        console.error("AI API error:", errBody);
        setStatus("❌ Error al generar preguntas. Revisa la consola.");
        setLoadingAI(false);
        return;
      }

      const json = await resp.json();
      setQuestions(json.questions || []);
      setStatus("✅ Preguntas generadas. ¡Responde el test!");
      setLoadingAI(false);
    } catch (err: any) {
      console.error(err);
      setStatus("❌ Error al subir el PDF o generar preguntas. Revisa la consola.");
      setLoadingAI(false);
    }
  };

  const selectAnswer = (qId: string, idx: number) => {
    setAnswers((prev) => ({ ...prev, [qId]: idx }));
  };

  const grade = () => {
    if (!questions) return;
    let s = 0;
    questions.forEach((q) => {
      if (answers[q.id] === q.answer) s++;
    });
    setScore(s);
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>🧾 → 🤖 Generador de Test desde PDF</h1>

      <div style={{ marginTop: 20 }}>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button onClick={handleUpload} style={{ marginLeft: 12, padding: "8px 16px" }}>
          Subir y generar test
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>{status}</strong>
        {loadingAI && <div>Generando preguntas — esto puede tardar 10–40s según el tamaño y el modelo.</div>}
      </div>

      {questions && questions.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2>Test interactivo</h2>
          {questions.map((q, i) => (
            <div key={q.id} style={{ marginBottom: 18, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
              <div>
                <strong>
                  {i + 1}. {q.question}
                </strong>
              </div>
              <div style={{ marginTop: 8 }}>
                {q.options.map((opt, idx) => {
                  const selected = answers[q.id] === idx;
                  const correct = q.answer === idx;
                  const showResult = score !== null;
                  return (
                    <div
                      key={idx}
                      onClick={() => selectAnswer(q.id, idx)}
                      style={{
                        padding: "8px 10px",
                        marginBottom: 6,
                        cursor: "pointer",
                        background: selected ? "#e6f0ff" : "#fff",
                        border: "1px solid #ddd",
                        borderRadius: 6,
                      }}
                    >
                      <strong>{String.fromCharCode(65 + idx)}.</strong> {opt}
                      {showResult && (
                        <span style={{ marginLeft: 10, color: correct ? "green" : "red", fontWeight: 600 }}>
                          {correct ? " (Correcta)" : answers[q.id] === idx ? " (Tu elección)" : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {score !== null && q.explanation && (
                <div style={{ marginTop: 8, color: "#666" }}>
                  <em>Explicación:</em> {q.explanation}
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 12 }}>
            <button onClick={grade} style={{ padding: "10px 18px", marginRight: 8 }}>
              Calcular nota
            </button>
            {score !== null && (
              <span>
                Puntuación: <strong>{score}</strong> / {questions.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
