import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export const createClient = () => {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(supabaseUrl!, supabaseKey!)
  return browserClient
}

