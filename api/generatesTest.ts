import OpenAI from "openai";
import axios from "axios";
import pdf from "pdf-parse";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  try {
    const { pdfUrl } = await req.json();

    if (!pdfUrl) {
      return new Response(JSON.stringify({ error: "No se proporcionó la URL del PDF" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("📄 Analizando PDF desde:", pdfUrl);

    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });
    const data = await pdf(response.data);
    const text = data.text?.slice(0, 6000) || "";

    if (!text) {
      return new Response(JSON.stringify({ error: "El PDF está vacío o no se pudo leer." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un generador de tests educativos. Lee el texto y genera 5 preguntas con 4 opciones (A-D). Devuelve solo un JSON con este formato: [{question:'...', options:['A','B','C','D'], answer:'A'}]",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const aiResponse = completion.choices[0]?.message?.content || "[]";
    let questions;

    try {
      questions = JSON.parse(aiResponse);
    } catch {
      questions = [{ question: "No se pudo parsear la respuesta.", options: [], answer: "" }];
    }

    return new Response(JSON.stringify({ success: true, questions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Error en generateTest:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Error desconocido" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


