// api/generateTest.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import pdfParse from "pdf-parse";
import OpenAI from "openai";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // ajusta si quieres otro
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("No OPENAI_API_KEY set in env");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * POST body: { pdfUrl: string, maxQuestions?: number }
 * Returns JSON: { questions: Question[] }
 * Question = { id: string, question: string, options: string[], answer: number, explanation?: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { pdfUrl, maxQuestions = 10 } = req.body ?? {};

    if (!pdfUrl || typeof pdfUrl !== "string") {
      return res.status(400).json({ error: "pdfUrl required in body" });
    }

    // 1) Descargar el PDF
    const pdfResp = await axios.get(pdfUrl, { responseType: "arraybuffer" });
    const pdfBuffer = Buffer.from(pdfResp.data);

    // 2) Extraer texto (pdf-parse)
    const pdfData = await pdfParse(pdfBuffer);
    let fullText = (pdfData.text || "").trim();

    if (!fullText) {
      return res.status(400).json({ error: "No text extracted from PDF" });
    }

    // 3) Acotar texto si es muy largo (para no pasar límites)
    // Tomamos los primeros N caracteres razonables; si quieres, puedes hacer un pipeline más avanzado.
    const MAX_CHARACTERS = 30000; // ajusta según coste/límites
    if (fullText.length > MAX_CHARACTERS) {
      fullText = fullText.slice(0, MAX_CHARACTERS);
    }

    // 4) Construir prompt: pedimos JSON estrucutrado con preguntas y 4 opciones (A-D)
    const systemPrompt = `
Eres un generador de tests educativos. Recibirás el texto de un PDF (pasado por el usuario). A partir de ese texto, genera hasta ${maxQuestions} preguntas tipo test. Cada pregunta debe tener:
- "question": el enunciado claro (en español).
- "options": array de 4 opciones de texto (ordenadas).
- "answer": índice (0..3) que indica la respuesta correcta.
- "explanation": (opcional) breve explicación de la respuesta correcta.

RESPONDE ÚNICAMENTE con JSON válido: un array de objetos. EJEMPLO:
[
  {
    "id": "q1",
    "question": "¿Cuál es X?",
    "options": ["A", "B", "C", "D"],
    "answer": 2,
    "explanation": "Porque..."
  },
  ...
]

No incluyas texto adicional fuera del JSON. Asegúrate de que el JSON sea parseable.
`;

    const userPrompt = `Texto del PDF (resumido/max ${MAX_CHARACTERS} chars):
----------------
${fullText}
----------------
Genera preguntas en español, claras y pedagógicas.`;

    // 5) Llamada a OpenAI
    const chatResponse = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    const raw = chatResponse.choices?.[0]?.message?.content ?? "";

    // 6) Intentar parsear JSON que devuelva la IA
    let questions = [];
    try {
      // Hay ocasiones en que la IA incluye texto previo; extrajimos el primer JSON válido
      const firstJson = extractFirstJson(raw);
      questions = JSON.parse(firstJson);
    } catch (err) {
      // fallback: intentar parsear raw directamente
      try {
        questions = JSON.parse(raw);
      } catch (err2) {
        console.error("Failed to parse JSON from model:", raw);
        return res.status(500).json({
          error: "Failed to parse questions from the AI. Raw output included.",
          raw,
        });
      }
    }

    // 7) Añadir ids si faltan y normalizar
    questions = questions.map((q: any, idx: number) => {
      return {
        id: q.id ?? `q${idx + 1}`,
        question: q.question ?? q.prompt ?? "",
        options: q.options ?? [],
        answer: typeof q.answer === "number" ? q.answer : 0,
        explanation: q.explanation ?? "",
      };
    });

    return res.status(200).json({ questions });
  } catch (err: any) {
    console.error("Error in generateTest:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}

/** Helper: extrae el primer bloque JSON completo dentro de un string (si la IA añade texto) */
function extractFirstJson(text: string): string {
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  const start = (firstBrace === -1 ? firstBracket : Math.min(firstBracket, firstBrace));
  if (start === -1) throw new Error("No JSON start found");
  // Encontrar el matching bracket (simple approach para arrays)
  if (text[start] === "[") {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "[") depth++;
      if (text[i] === "]") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  } else {
    // objeto JSON
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  throw new Error("No complete JSON found");
}
