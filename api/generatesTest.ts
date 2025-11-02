import OpenAI from "openai";
import axios from "axios";
import pdf from "pdf-parse";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  try {
    // 1️⃣ Recibir datos del frontend
    const { pdfUrl } = await req.json();

    if (!pdfUrl) {
      return new Response(JSON.stringify({ error: "No se proporcionó la URL del PDF." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("📄 Analizando PDF desde:", pdfUrl);

    // 2️⃣ Descargar el PDF
    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });
    const data = await pdf(response.data);
    const text = data.text.slice(0, 5000); // recorte por límite de tokens

    // 3️⃣ Llamar a OpenAI
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un generador de tests. A partir del texto del PDF, crea 5 preguntas con 4 opciones (A-D) y marca cuál es la correcta en JSON.",
        },
        { role: "user", content: text },
      ],
    });

    const questions = completion.choices[0].message?.content || "[]";

    return new Response(
      JSON.stringify({
        success: true,
        questions,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Error en generateTest:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


