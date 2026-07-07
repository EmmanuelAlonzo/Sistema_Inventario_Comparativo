import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Inyección directa sin usar variables de entorno ocultas
const REAL_URL = 'https://hsqnduuhpftwvefppqxo.supabase.co';
const REAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzcW5kdXVocGZ0d3ZlZnBwcXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTA3NzcsImV4cCI6MjA5MjI4Njc3N30.ZZJ9_I8XMQbClciGiIFz64SP9J6D7jwJEc8-a-DI0ow';

// Forzamos la exportación limpia
export const supabase = createClient(REAL_URL, REAL_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

console.log("¡CLIENTE BINDADO! Apuntando fijamente a Multigroup Real.");
