import { createSupabaseClient } from "@control-electoral/supabase-client";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createSupabaseClient(url, anonKey);
