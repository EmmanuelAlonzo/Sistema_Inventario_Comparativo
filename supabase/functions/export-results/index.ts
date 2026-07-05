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

    // 1. Obtener datos optimizados de Supabase
    // Traemos todo el picking directamente
    const { data: picking, error: pickingErr } = await supabaseAdmin
      .from('conteos_picking')
      .select('*');
    if (pickingErr) throw new Error("Error obteniendo picking.");

    // Extraemos los lotes únicos que realmente se contaron para no pedir todo el maestro
    const lotesContados = picking ? [...new Set(picking.map((p: any) => p.lote).filter(Boolean))] : [];

    // Traemos del maestro solo lo que tiene stock en SAP > 0 O los lotes que los operarios escanearon
    const orFilter = lotesContados.length > 0 
      ? `stock_sap.gt.0,lote.in.(${lotesContados.join(',')})`
      : 'stock_sap.gt.0';

    const { data: maestro, error: maestroErr } = await supabaseAdmin
      .from('inventario_maestro')
      .select('*')
      .or(orFilter);
    if (maestroErr) throw new Error("Error obteniendo maestro optimizado: " + maestroErr.message);

    // --- Lógica de Procesamiento ---
    
    // 1. Mapa de conteos físicos por SKU + LOTE
    const physicalByLot: Record<string, number> = {};
    picking?.forEach(p => {
      // Usar SKU real si existe en picking, sino usar una cadena vacía o "SIN_SKU"
      // Para retrocompatibilidad si la columna sku aún está vacía, usamos el lote como fallback o solo agrupamos por lote.
      // Pero lo ideal es: sku_lote
      const skuKey = p.sku ? String(p.sku).trim() : "SIN_SKU";
      const loteKey = p.lote ? String(p.lote).trim() : "SIN_LOTE";
      const compositeKey = `${skuKey}_${loteKey}`;
      
      if (!physicalByLot[compositeKey]) physicalByLot[compositeKey] = 0;
      physicalByLot[compositeKey] += p.cantidad_fisica || 0;
    });

    // 2. Preparar DATA_LOTES y Acumular para DATA_PRODUCTOS
    const reportLotes = [["Producto (SKU)", "Descripción", "Lote", "Centro", "Almacen", "Ubicación SAP", "Stock SAP", "Conteo App", "Diferencia"]];
    const productAgg: Record<string, { desc: string, sap: number, fisico: number }> = {};

    // Mantener un registro de los composite keys encontrados en maestro
    const maestroKeys = new Set<string>();

    maestro?.forEach(m => {
      const mSku = m.sku ? String(m.sku).trim() : "SIN_SKU";
      const mLote = m.lote ? String(m.lote).trim() : "SIN_LOTE";
      const compositeKey = `${mSku}_${mLote}`;
      maestroKeys.add(compositeKey);

      // Buscar si hay conteo físico usando el compositeKey exacto.
      // Si la app vieja guardó sin SKU, la key será "SIN_SKU_lote". Si es así, tratamos de recuperar por lote si no hay match exacto.
      let fisico = physicalByLot[compositeKey] || 0;
      
      // Fallback temporal si el picking no guardó SKU pero el maestro sí lo tiene
      if (fisico === 0 && physicalByLot[`SIN_SKU_${mLote}`]) {
         fisico = physicalByLot[`SIN_SKU_${mLote}`];
         // Para evitar que se asigne a múltiples SKUs, podríamos vaciarlo, 
         // pero por ahora lo dejamos para que no pierdan la cuenta vieja.
      }
      const diferencia = fisico - (m.stock_sap || 0);
      
      // Detalle por Lote
      reportLotes.push([
        m.sku || "",
        m.descripcion || "",
        m.lote,
        m.centro || "",
        m.almacen || "",
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

    // 3. Identificar combinaciones (SKU+LOTE) escaneadas que NO están en el maestro
    picking?.forEach(p => {
      const pSku = p.sku ? String(p.sku).trim() : "SIN_SKU";
      const pLote = p.lote ? String(p.lote).trim() : "SIN_LOTE";
      const compositeKey = `${pSku}_${pLote}`;

      // Si no existe ni como match exacto ni como fallback de SIN_SKU
      if (!maestroKeys.has(compositeKey)) {
        // Verificar si es un picking viejo sin SKU que ya fue asimilado por un lote del maestro
        let asimilado = false;
        if (pSku === "SIN_SKU") {
           for (const mk of maestroKeys) {
              if (mk.endsWith(`_${pLote}`)) {
                 asimilado = true;
                 break;
              }
           }
        }

        if (!asimilado) {
          const skuKey = p.sku || "NUEVO";
          const loteKey = p.lote || "Desconocido";
          const descKey = p.descripcion || ""; // Usar la descripción ingresada o dejar en blanco
          
          reportLotes.push([
            skuKey, 
            descKey, 
            loteKey, 
            "N/A", // Centro desconocido
            "N/A", // Almacen desconocido
            p.ubicacion_fisica || "N/A", 
            0, 
            p.cantidad_fisica || 0, 
            p.cantidad_fisica || 0 
          ]);
          
          if (!productAgg[skuKey]) productAgg[skuKey] = { desc: descKey, sap: 0, fisico: 0 };
          productAgg[skuKey].fisico += (p.cantidad_fisica || 0);
        }
      }
    });

    // 4. Preparar DATA_PRODUCTOS (Agrupado)
    const reportProductos: (string | number)[][] = [["Producto (SKU)", "Descripción", "Suma de Sistema (SAP)", "Suma de Conteo App", "Diferencia Neta"]];
    Object.keys(productAgg).forEach(sku => {
      const p = productAgg[sku];
      reportProductos.push([
        sku,
        p.desc,
        p.sap,
        p.fisico,
        p.fisico - p.sap
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

    const updateSheet = async (name: string, vals: any[][]) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${name}!A1?valueInputOption=RAW`, {
      method: "PUT", headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range: `${name}!A1`, majorDimension: "ROWS", values: vals })
    });

    await updateSheet("DATA_LOTES", reportLotes);
    await updateSheet("DATA_PRODUCTOS", reportProductos);

    // 7. KPIs y Dashboard (Sobre DATA_PRODUCTOS)
    const diffProdCount = reportProductos.slice(1).filter(r => Number(r[4]) !== 0).length;
    const dashValues: (string | number)[][] = [
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
      .sort((a, b) => Math.abs(Number(b[4])) - Math.abs(Number(a[4])))
      .slice(0, 20);
    topDiffs.forEach(t => dashValues.push([t[0], t[4]]));

    await updateSheet("DASHBOARD", dashValues);

    // 8. Aplicar estilos, cuadrículas, formatos condicionales y gráfica en DASHBOARD
    const stylingAndChartRequests: any[] = [
      // Asegurar cuadrículas activas (hideGridlines: false) en todas las hojas
      {
        updateSheetProperties: {
          properties: { sheetId: dashboardSheetId, gridProperties: { hideGridlines: false } },
          fields: "gridProperties.hideGridlines"
        }
      },
      {
        updateSheetProperties: {
          properties: { sheetId: lotesSheetId, gridProperties: { hideGridlines: false } },
          fields: "gridProperties.hideGridlines"
        }
      },
      {
        updateSheetProperties: {
          properties: { sheetId: productosSheetId, gridProperties: { hideGridlines: false } },
          fields: "gridProperties.hideGridlines"
        }
      },
      // Encabezados DATA_LOTES (Gris oscuro, texto blanco negrita)
      {
        repeatCell: {
          range: { sheetId: lotesSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.12, blue: 0.12 },
              textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
      },
      // Encabezados DATA_PRODUCTOS (Gris oscuro, texto blanco negrita)
      {
        repeatCell: {
          range: { sheetId: productosSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.12, blue: 0.12 },
              textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
      },
      // Alineaciones DATA_LOTES: Centrar SKU (Columna A, index 0) y Lote (Columna C, index 2)
      {
        repeatCell: {
          range: { sheetId: lotesSheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      {
        repeatCell: {
          range: { sheetId: lotesSheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      // Alineaciones DATA_LOTES: Alinear a la derecha cantidades numéricas (SAP, Conteo, Diferencia -> Columnas G a I, index 6 a 9)
      {
        repeatCell: {
          range: { sheetId: lotesSheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 9 },
          cell: { userEnteredFormat: { horizontalAlignment: "RIGHT" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      // Alineaciones DATA_PRODUCTOS: Centrar SKU (Columna A, index 0)
      {
        repeatCell: {
          range: { sheetId: productosSheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      // Alineaciones DATA_PRODUCTOS: Alinear a la derecha cantidades (SAP, Conteo, Diferencia -> Columnas C a E, index 2 a 5)
      {
        repeatCell: {
          range: { sheetId: productosSheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 5 },
          cell: { userEnteredFormat: { horizontalAlignment: "RIGHT" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      // Formato condicional en DATA_LOTES: Diferencia (Columna I, index 8) < 0 -> Fondo Rojo Suave
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: lotesSheetId, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 }],
            booleanRule: {
              condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
              format: { backgroundColor: { red: 1.0, green: 0.8, blue: 0.8 } }
            }
          },
          index: 0
        }
      },
      // Formato condicional en DATA_PRODUCTOS: Diferencia Neta (Columna E, index 4) < 0 -> Fondo Rojo Suave
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: productosSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 }],
            booleanRule: {
              condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
              format: { backgroundColor: { red: 1.0, green: 0.8, blue: 0.8 } }
            }
          },
          index: 0
        }
      },
      // Gráfica en DASHBOARD
      {
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
      }
    ];

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST", headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: stylingAndChartRequests })
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
