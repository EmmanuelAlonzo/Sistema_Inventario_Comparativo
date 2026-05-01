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

    // --- Lógica de Procesamiento ---
    
    // 1. Mapa de conteos físicos por LOTE
    const physicalByLot: Record<string, number> = {};
    picking?.forEach(p => {
      if (!physicalByLot[p.lote]) physicalByLot[p.lote] = 0;
      physicalByLot[p.lote] += p.cantidad_fisica || 0;
    });

    // 2. Preparar DATA_LOTES y Acumular para DATA_PRODUCTOS
    const reportLotes = [["Producto (SKU)", "Descripción", "Lote", "Ubicación SAP", "Stock SAP", "Conteo App", "Diferencia"]];
    const productAgg: Record<string, { desc: string, sap: number, fisico: number }> = {};

    maestro?.forEach(m => {
      const fisico = physicalByLot[m.lote] || 0;
      const diferencia = fisico - (m.stock_sap || 0);
      
      // Detalle por Lote
      reportLotes.push([
        m.sku || "",
        m.descripcion || "",
        m.lote,
        m.ubicacion_sap || "",
        String(m.stock_sap || 0),
        String(fisico),
        String(diferencia)
      ]);

      // Acumular por Producto
      const sku = m.sku || "Sin SKU";
      if (!productAgg[sku]) {
        productAgg[sku] = { desc: m.descripcion || "", sap: 0, fisico: 0 };
      }
      productAgg[sku].sap += (m.stock_sap || 0);
      productAgg[sku].fisico += fisico;
    });

    // 3. Identificar Lotes escaneados que NO están en el maestro
    const maestroLotes = new Set(maestro?.map(m => m.lote));
    picking?.forEach(p => {
      if (!maestroLotes.has(p.lote)) {
        const loteKey = p.lote || "Desconocido";
        reportLotes.push([
          "NUEVO", 
          "Lote no registrado en SAP", 
          loteKey, 
          p.ubicacion_fisica || "N/A", 
          "0", 
          String(p.cantidad_fisica || 0), 
          String(p.cantidad_fisica || 0)
        ]);
        
        // También sumarlo al producto "NUEVOS"
        if (!productAgg["NUEVOS"]) productAgg["NUEVOS"] = { desc: "Lotes nuevos/imprevistos", sap: 0, fisico: 0 };
        productAgg["NUEVOS"].fisico += (p.cantidad_fisica || 0);
      }
    });

    // 4. Preparar DATA_PRODUCTOS (Agrupado)
    const reportProductos = [["Producto (SKU)", "Descripción", "Suma de Sistema (SAP)", "Suma de Conteo App", "Diferencia Neta"]];
    Object.keys(productAgg).forEach(sku => {
      const p = productAgg[sku];
      reportProductos.push([
        sku,
        p.desc,
        String(p.sap),
        String(p.fisico),
        String(p.fisico - p.sap)
      ]);
    });

    // 4. Drive Autodiscovery
    const query = `mimeType='application/vnd.google-apps.spreadsheet' and name contains 'RESULTADOS_INVENTARIO' and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!searchRes.ok) throw new Error("Error buscando el archivo destino en Drive.");
    const searchData = await searchRes.json();
    const spreadsheetId = searchData.files?.[0]?.id;
    if (!spreadsheetId) throw new Error("No se encontró el archivo 'RESULTADOS_INVENTARIO' compartido con el bot.");

    // 5. Configuración de Pestañas (DASHBOARD, DATA_LOTES, DATA_PRODUCTOS)
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const metaData = await metaRes.json();
    
    let dashboardSheetId = metaData.sheets[0].properties.sheetId;
    let lotesSheetId = metaData.sheets.find((s: any) => s.properties.title === 'DATA_LOTES')?.properties.sheetId;
    let productosSheetId = metaData.sheets.find((s: any) => s.properties.title === 'DATA_PRODUCTOS')?.properties.sheetId;

    const setupRequests = [];
    if (metaData.sheets[0].properties.title !== 'DASHBOARD') {
      setupRequests.push({ updateSheetProperties: { properties: { sheetId: dashboardSheetId, title: "DASHBOARD" }, fields: "title" } });
    }
    
    // --- RESTAURAR FORMATOS Y CUADRÍCULAS ---
    setupRequests.push({
      updateSheetProperties: {
        properties: { sheetId: dashboardSheetId, gridProperties: { hideGridlines: false } },
        fields: "gridProperties.hideGridlines"
      }
    });
    setupRequests.push({
      repeatCell: {
        range: { sheetId: dashboardSheetId },
        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)"
      }
    });
    // Limpiar bordes y alineaciones
    setupRequests.push({
      repeatCell: {
        range: { sheetId: dashboardSheetId },
        cell: { userEnteredFormat: {} },
        fields: "userEnteredFormat(borders,horizontalAlignment,verticalAlignment)"
      }
    });
    // ---------------------------------------

    if (!lotesSheetId) setupRequests.push({ addSheet: { properties: { title: "DATA_LOTES" } } });
    if (!productosSheetId) setupRequests.push({ addSheet: { properties: { title: "DATA_PRODUCTOS" } } });
    
    // Limpiar gráficos viejos
    if (metaData.sheets[0].charts) {
      metaData.sheets[0].charts.forEach((c: any) => setupRequests.push({ deleteEmbeddedObject: { objectId: c.chartId } }));
    }

    if (setupRequests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST", headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: setupRequests })
      });
      // Refetch IDs
      const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const m2 = await r2.json();
      lotesSheetId = m2.sheets.find((s: any) => s.properties.title === 'DATA_LOTES').properties.sheetId;
      productosSheetId = m2.sheets.find((s: any) => s.properties.title === 'DATA_PRODUCTOS').properties.sheetId;
    }

    // 6. Inyectar Datos y Limpiar Pestañas
    const clearSheets = async (name: string) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${name}!A1:Z40000:clear`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    await clearSheets("DATA_LOTES");
    await clearSheets("DATA_PRODUCTOS");
    await clearSheets("DASHBOARD");

    const updateSheet = async (name: string, vals: any[][]) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${name}!A1?valueInputOption=USER_ENTERED`, {
      method: "PUT", headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range: `${name}!A1`, majorDimension: "ROWS", values: vals })
    });

    await updateSheet("DATA_LOTES", reportLotes);
    await updateSheet("DATA_PRODUCTOS", reportProductos);

    // 7. KPIs y Dashboard (Sobre DATA_PRODUCTOS)
    const diffProdCount = reportProductos.slice(1).filter(r => r[4] !== "0").length;
    const dashValues = [
      ["📊 RESUMEN EJECUTIVO (VALIDACIÓN LIMPIA)"],
      ["Fecha de Generación:", new Date().toLocaleDateString()],
      [""],
      ["Total de SKUs en Inventario:", String(reportProductos.length - 1)],
      ["Productos con Diferencia Real:", String(diffProdCount)],
      ["Precisión General:", (reportProductos.length > 1) ? String((( (reportProductos.length - 1) - diffProdCount) / (reportProductos.length - 1) * 100).toFixed(2)) + "%" : "0%"],
      [""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],[""],
      ["TOP DISCREPANCIAS POR PRODUCTO"],
      ["Producto (SKU)", "Diferencia Neta"]
    ];

    const topDiffs = reportProductos.slice(1)
      .sort((a, b) => Math.abs(parseFloat(b[4])) - Math.abs(parseFloat(a[4])))
      .slice(0, 20);
    topDiffs.forEach(t => dashValues.push([t[0], t[4]]));

    await updateSheet("DASHBOARD", dashValues);

    // 8. Gráfica en DASHBOARD
    const chartReq = [{
      addChart: {
        chart: {
          spec: {
            title: "Top 20 Discrepancias de Inventario",
            basicChart: {
              chartType: "COLUMN",
              axis: [{ position: "BOTTOM_AXIS", title: "SKU" }, { position: "LEFT_AXIS", title: "Diferencia" }],
              domains: [{ domain: { sourceRange: { sources: [{ sheetId: dashboardSheetId, startRowIndex: 21, endRowIndex: 21 + topDiffs.length, startColumnIndex: 0, endColumnIndex: 1 }] } } }],
              series: [{ series: { sourceRange: { sources: [{ sheetId: dashboardSheetId, startRowIndex: 21, endRowIndex: 21 + topDiffs.length, startColumnIndex: 1, endColumnIndex: 2 }] } }, targetAxis: "LEFT_AXIS" }]
            }
          },
          position: { overlayPosition: { anchorCell: { sheetId: dashboardSheetId, rowIndex: 2, columnIndex: 3 }, widthPixels: 750, heightPixels: 400 } }
        }
      }
    }];

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST", headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: chartReq })
    });

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
