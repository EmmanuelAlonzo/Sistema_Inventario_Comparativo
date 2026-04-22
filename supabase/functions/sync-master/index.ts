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
    // 1. Autenticación con Google usando la Service Account guardada en Secrets
    const serviceAccountStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT');
    if (!serviceAccountStr) throw new Error("Llave de Google Service Account no configurada en Supabase Secrets.");
    
    const serviceAccount = JSON.parse(serviceAccountStr);
    const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
    const jwt = await new SignJWT({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
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

    // 2. Autodescubrimiento del Archivo Madre (Ignorando los reportes que el propio bot crea o usa)
    const botEmail = serviceAccount.client_email;
    const query = `mimeType='application/vnd.google-apps.spreadsheet' and not '${botEmail}' in owners and not name contains 'RESULTADOS_INVENTARIO' and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!searchRes.ok) throw new Error("Error buscando archivos en Drive.");
    const searchData = await searchRes.json();
    const files = searchData.files || [];
    
    if (files.length === 0) {
      throw new Error("No se encontró ningún archivo de Excel (Spreadsheet) compartido con el bot.");
    }
    if (files.length > 1) {
      throw new Error("Hay más de un archivo Excel compartido con el bot. Por favor deja solo el archivo Madre.");
    }
    
    const spreadsheetId = files[0].id;

    // 3. Buscar la hoja correcta evaluando el esquema (cabeceras)
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) throw new Error("Error obteniendo metadatos del Excel.");
    const metaData = await metaRes.json();
    const sheets = metaData.sheets || [];

    let targetSheetName = "";
    let targetHeaders: string[] = [];
    let headerRowIndex = 0;
    
    // Revisamos hoja por hoja buscando en las primeras 10 filas
    for (const sheet of sheets) {
      const sheetName = sheet.properties.title;
      const headUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!A1:Z10`;
      const headRes = await fetch(headUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!headRes.ok) continue;
      
      const headData = await headRes.json();
      const rows = headData.values || [];
      
      for (let r = 0; r < rows.length; r++) {
        const headers = rows[r] || [];
        const textHeaders = headers.map((h: string) => String(h).trim().toLowerCase());
        
        const hasLote = textHeaders.includes('lote') || textHeaders.includes('producto') || textHeaders.includes('sku');
        const hasStock = textHeaders.includes('inventario') || textHeaders.includes('suma de sistema') || textHeaders.includes('stock') || textHeaders.includes('suma de a');

        if (hasLote && hasStock) {
          targetSheetName = sheetName;
          targetHeaders = headers;
          headerRowIndex = r;
          break;
        }
      }
      if (targetSheetName) break;
    }

    if (!targetSheetName) {
      throw new Error("Ninguna hoja en el Excel tiene el esquema correcto. Asegúrate de que existan las columnas 'Producto' y 'Suma de Sistema'.");
    }

    // 4. Extraer todos los datos de la hoja encontrada
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${targetSheetName}'!A1:Z40000`;
    const sheetRes = await fetch(sheetUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!sheetRes.ok) throw new Error("Error descargando los datos de la hoja seleccionada.");
    const { values } = await sheetRes.json();
    if (!values || values.length <= headerRowIndex + 1) {
      throw new Error(`La hoja ${targetSheetName} está vacía o no tiene datos debajo de las cabeceras.`);
    }

    // 5. Mapeo Rápido de Columnas
    const getIndex = (names: string[]) => targetHeaders.findIndex((col: string) => 
      names.includes(String(col).trim().toLowerCase())
    );
    
    // Soportamos el esquema nuevo (Producto, Suma de Sistema)
    const idxLote = getIndex(['lote', 'producto', 'sku']);
    const idxDesc = getIndex(['descripcion', 'descripción']);
    const idxInventario = getIndex(['inventario', 'suma de sistema', 'stock']);
    const idxUbicacion = getIndex(['ubicación', 'ubicacion', 'nave']);

    if (idxLote === -1 || idxInventario === -1) {
      throw new Error("No se encontraron las columnas clave en la hoja.");
    }

    // Saltamos las filas hasta llegar a los datos (después de la cabecera)
    const rowsToInsert = values.slice(headerRowIndex + 1).map((row: any) => ({
      lote: String(row[idxLote]), 
      sku: String(row[idxLote]),  
      descripcion: idxDesc !== -1 ? String(row[idxDesc]) : null,
      ubicacion_sap: idxUbicacion !== -1 ? String(row[idxUbicacion]) : null,
      stock_sap: parseFloat(String(row[idxInventario]).replace(/,/g, '') || "0") || 0
    })).filter((r: any) => r.lote !== "undefined" && r.lote !== "" && r.lote !== "null"); // Filtrar vacíos

    // 4. Inserción de 5000 en 5000 a Supabase (PostgreSQL Upsert)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Vaciamos la tabla antigua por seguridad
    await supabaseAdmin.from('inventario_maestro').delete().neq('lote', '');

    // Inyectamos en BATCH
    const chunkSize = 5000;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin.from('inventario_maestro').upsert(chunk);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Se sincronizaron ${rowsToInsert.length} filas desde el Drive corporativo exitosamente.`
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
