import OpenAI from "openai";
import axios from "axios";
import pdf from "pdf-parse";

// 🧠 Ejecutar en entorno Node, no Edge (pdf-parse no es compatible con Edge)
export const config = {
  runtime: "nodejs20.x",
};

export default async function handler(req: any, res: any) {
  try {
    // 🚫 Solo aceptar peticiones POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método no permitido" });
    }

    const { pdfUrl } = req.body;

    if (!pdfUrl) {
      return res.status(400).json({ error: "No se proporcionó la URL del PDF" });
    }

    console.log("📄 Analizando PDF desde:", pdfUrl);

    // 1️⃣ Descargar el PDF
    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });

    // 2️⃣ Extraer texto del PDF
    const data = await pdf(response.data);
    const text = data.text?.slice(0, 8000) || "";

    if (!text) {
      return res
        .status(400)
        .json({ error: "No se pudo extraer texto del PDF (quizás esté escaneado o vacío)." });
    }

    // 3️⃣ Inicializar cliente de OpenAI
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 4️⃣ Solicitar generación de test
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un generador de tests educativos. Lee el texto del PDF y genera 5 preguntas tipo test con 4 opciones (A-D). Devuelve solo JSON con el formato: [{question:'...', options:['A','B','C','D'], answer:'A'}]",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    // 5️⃣ Parsear respuesta del modelo
    const aiResponse = completion.choices[0]?.message?.content || "[]";

    let questions;
    try {
      questions = JSON.parse(aiResponse);
    } catch {
      questions = [{ question: "Error: no se pudo interpretar la respuesta del modelo.", options: [], answer: "" }];
    }

    // 6️⃣ Devolver resultado al frontend
    return res.status(200).json({ success: true, questions });
  } catch (error: any) {
    console.error("❌ Error en generateTest:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Error desconocido en el servidor",
    });
  }
}




