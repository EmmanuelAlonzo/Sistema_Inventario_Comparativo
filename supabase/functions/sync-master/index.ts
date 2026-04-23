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
    const spreadsheetName = files[0].name;

    // 3. Buscar la hoja correcta evaluando el esquema (cabeceras)
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) throw new Error(`Error obteniendo metadatos del Excel [${spreadsheetName}].`);
    const metaData = await metaRes.json();
    const sheets = metaData.sheets || [];

    let targetSheetName = "";
    let targetHeaders: string[] = [];
    let headerRowIndex = 0;
    
    let debugInfo = "";
    
    // Revisamos hoja por hoja buscando en las primeras 20 filas
    for (const sheet of sheets) {
      const sheetName = sheet.properties.title;
      const headUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!A1:Z20`;
      const headRes = await fetch(headUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!headRes.ok) {
        debugInfo += `[${sheetName}: Error de acceso] `;
        continue;
      }
      
      const headData = await headRes.json();
      const rows = headData.values || [];
      if (rows.length > 0) {
        debugInfo += `[${sheetName}: Fila 1 tiene ${rows[0].length} columnas] `;
      } else {
        debugInfo += `[${sheetName}: Vacía] `;
      }
      
      for (let r = 0; r < rows.length; r++) {
        const headers = rows[r] || [];
        const textHeaders = headers.map((h: string) => String(h).trim().toLowerCase());
        
        // Buscamos si la fila contiene las palabras clave en alguna de sus celdas
        const hasLote = textHeaders.some(h => h.includes('lote') || h.includes('batch'));
        const hasProducto = textHeaders.some(h => h.includes('producto') || h.includes('sku') || h.includes('material') || h.includes('produ'));
        const hasSistema = textHeaders.some(h => h.includes('sistema') || h.includes('stock') || h.includes('teorico'));

        if (hasLote && hasProducto && hasSistema) {
          targetSheetName = sheetName;
          targetHeaders = headers;
          headerRowIndex = r;
          break;
        }
      }
      if (targetSheetName) break;
    }

    if (!targetSheetName) {
      throw new Error(`Archivo [${spreadsheetName}] no contiene el esquema. Hojas: ${debugInfo}.`);
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

    // 5. Mapeo Resiliente de Columnas (SAP Crudo)
    const textHeadersLower = targetHeaders.map(h => String(h).trim().toLowerCase());
    const findIdx = (keywords: string[]) => textHeadersLower.findIndex(h => keywords.some(k => h.includes(k)));
    
    const idxLote = findIdx(['lote']);
    const idxProducto = findIdx(['producto', 'sku', 'produ']);
    const idxDesc = findIdx(['descrip', 'nombre']);
    const idxSistema = findIdx(['sistema', 'stock', 'teorico']);
    const idxUbicacion = findIdx(['ubicac', 'ubi', 'posicion']);

    if (idxLote === -1 || idxProducto === -1 || idxSistema === -1) {
      throw new Error("No se encontraron todas las columnas clave (Lote, Producto, Sistema). Verifica los encabezados del Excel.");
    }

    // Saltamos las filas hasta llegar a los datos (después de la cabecera)
    const rowsToInsert = values.slice(headerRowIndex + 1).map((row: any) => ({
      lote: String(row[idxLote]).trim(), 
      sku: String(row[idxProducto]).trim(),  
      descripcion: idxDesc !== -1 ? String(row[idxDesc]).trim() : null,
      ubicacion_sap: idxUbicacion !== -1 ? String(row[idxUbicacion]).trim() : null,
      stock_sap: parseFloat(String(row[idxSistema]).replace(/,/g, '') || "0") || 0
    })).filter((r: any) => r.lote !== "undefined" && r.lote !== "" && r.lote !== "null");

    // 4. Inserción de 5000 en 5000 a Supabase (PostgreSQL Plain Insert)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Vaciamos la tabla antigua por seguridad
    await supabaseAdmin.from('inventario_maestro').delete().neq('lote', 'FORCE_DELETE_ALL_VAL');

    // Inyectamos en BATCH
    const chunkSize = 5000;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin.from('inventario_maestro').insert(chunk);
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
