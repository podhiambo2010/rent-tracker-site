import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Strong validation (both variables)
if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing VITE_SUPABASE_ANON_KEY");
}

// Create client
export const supabase = createClient(supabaseUrl, supabaseKey);