import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Supabase Admin Client (Bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Delete all records from both tables bypassing RLS
    // IMPORTANTE: Borrar primero la tabla hija (conteos_picking) para no violar la llave foránea
    const { error: errConteos } = await supabaseAdmin.from('conteos_picking').delete().neq('lote', 'IMPOSSIBLE_VALUE_TO_FORCE_DELETE_ALL');
    if (errConteos) throw errConteos;

    const { error: errMaestro } = await supabaseAdmin.from('inventario_maestro').delete().neq('lote', 'IMPOSSIBLE_VALUE_TO_FORCE_DELETE_ALL');
    if (errMaestro) throw errMaestro;

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Base de datos limpiada con éxito desde la nube."
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });
  }
});
