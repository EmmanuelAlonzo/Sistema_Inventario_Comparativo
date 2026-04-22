import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Eliminamos folderId del req.json() porque se autodescubrirá

    // 1. Supabase Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Auth with Google
    const serviceAccountStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT');
    if (!serviceAccountStr) throw new Error("Llave de Google no configurada en Secrets.");
    
    const serviceAccount = JSON.parse(serviceAccountStr);
    const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
    const jwt = await new SignJWT({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token"
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 3. Fetch Data from Supabase
    const { data: maestro, error: maestroErr } = await supabaseAdmin.from('inventario_maestro').select('*');
    if (maestroErr) throw maestroErr;

    const { data: picking, error: pickingErr } = await supabaseAdmin.from('conteos_picking').select('*');
    if (pickingErr) throw pickingErr;

    // Merge logic
    const conteosMap: Record<string, number> = {};
    picking?.forEach(p => {
      if (!conteosMap[p.lote]) conteosMap[p.lote] = 0;
      conteosMap[p.lote] += p.cantidad_fisica || 0;
    });

    const reportData = [
      ["Producto", "Descripción", "Ubicación SAP", "Stock SAP", "Conteo Físico", "Diferencia"]
    ];

    maestro?.forEach(m => {
      const fisico = conteosMap[m.lote] || 0;
      const diferencia = fisico - (m.stock_sap || 0);
      reportData.push([
        m.lote, // Mapea a Producto
        m.descripcion || "",
        m.ubicacion_sap || "",
        String(m.stock_sap || 0),
        String(fisico),
        String(diferencia)
      ]);
    });

    // Añadir lotes que están en conteos pero NO en el maestro (lotes nuevos/imprevistos)
    const maestroLotes = new Set(maestro?.map(m => m.lote));
    picking?.forEach(p => {
      if (!maestroLotes.has(p.lote)) {
        reportData.push([
          p.lote,
          "CONTEO SIN SAP",
          p.ubicacion_fisica || "N/A",
          "0",
          String(p.cantidad_fisica || 0),
          String(p.cantidad_fisica || 0)
        ]);
        maestroLotes.add(p.lote); // Evitar duplicados si hay varios conteos del mismo lote
      }
    });

    // 4. Autodescubrimiento del Archivo Destino (RESULTADOS_INVENTARIO)
    const query = `mimeType='application/vnd.google-apps.spreadsheet' and name contains 'RESULTADOS_INVENTARIO' and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!searchRes.ok) throw new Error("Error buscando el archivo destino en Drive.");
    const searchData = await searchRes.json();
    const files = searchData.files || [];
    
    if (files.length === 0) {
      throw new Error("No se encontró ningún archivo llamado 'RESULTADOS_INVENTARIO' compartido con el bot.");
    }
    
    const spreadsheetId = files[0].id;

    // Obtener el nombre de la primera hoja (para soportar "Hoja 1", "Sheet1", etc.)
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) throw new Error("Error obteniendo metadatos del Excel destino.");
    const metaData = await metaRes.json();
    const firstSheetName = metaData.sheets[0].properties.title;

    // Borrar el contenido previo de la hoja (para evitar que queden datos viejos si el reporte nuevo es más corto)
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${firstSheetName}'!A1:Z40000:clear`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    // 5. Update data in the newly created spreadsheet
    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${firstSheetName}'!A1?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        range: `'${firstSheetName}'!A1`,
        majorDimension: "ROWS",
        values: reportData
      })
    });

    if (!updateRes.ok) {
        const err = await updateRes.text();
        throw new Error(`No se pudo insertar los datos en el Sheet: ${err}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Reporte exportado exitosamente.",
      fileId: spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
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
