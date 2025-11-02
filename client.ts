import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// 🔍 Prueba: imprime en la consola del navegador
console.log("🔗 URL:", supabaseUrl);
console.log("🔑 KEY:", supabaseKey ? "Cargada correctamente ✅" : "❌ No se detectó la clave");

export const supabase = createClient(supabaseUrl, supabaseKey);
