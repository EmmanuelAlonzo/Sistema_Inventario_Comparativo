import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Reemplazar con las URLs verdaderas del proyecto
const SUPABASE_URL = 'https://hsqnduuhpftwvefppqxo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzcW5kdXVocGZ0d3ZlZnBwcXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTA3NzcsImV4cCI6MjA5MjI4Njc3N30.ZZJ9_I8XMQbClciGiIFz64SP9J6D7jwJEc8-a-DI0ow';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
