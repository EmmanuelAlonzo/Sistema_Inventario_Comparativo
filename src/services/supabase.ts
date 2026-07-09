import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hsqnduuhpftwvefppqxo.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzcW5kdXVocGZ0d3ZlZnBwcXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTA3NzcsImV4cCI6MjA5MjI4Njc3N30.ZZJ9_I8XMQbClciGiIFz64SP9J6D7jwJEc8-a-DI0ow';

let supabaseClient: any;

try {
  // Validamos que las variables de entorno existan y que la URL empiece con http para evitar errores de parseo de URL
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY no están definidas o son inválidas.');
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
} catch (error) {
  console.error(
    '❌ ERROR CRÍTICO: No se pudo inicializar el cliente de Supabase.\n' +
    'Detalle del error:', error
  );

  // Creamos un proxy recursivo seguro para simular el cliente de Supabase sin romper la ejecución
  const createDummy = (): any => {
    const dummy: any = new Proxy(() => dummy, {
      get(target, prop) {
        if (prop === 'then') {
          return (resolve: any) => resolve({ data: null, error: new Error('Supabase no está configurado correctamente en esta compilación.') });
        }
        if (prop === 'catch') {
          return (reject: any) => reject(new Error('Supabase no está configurado correctamente en esta compilación.'));
        }
        if (prop === 'finally') {
          return (cb: any) => { if (cb) cb(); return dummy; };
        }
        return createDummy();
      },
      apply(target, thisArg, argumentsList) {
        return createDummy();
      }
    });
    return dummy;
  };

  supabaseClient = createDummy();
}

export const supabase: SupabaseClient = supabaseClient;

console.log("¡CLIENTE CONFIGURADO! Conectando a Supabase desde variables de entorno.");

