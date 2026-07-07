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

    // 1. Obtener todo el picking directamente
    const { data: picking, error: pickingErr } = await supabaseAdmin
      .from('conteos_picking')
      .select('*');
    if (pickingErr) throw new Error("Error obteniendo picking.");

    // 2. Obtener el maestro completo de SAP superando el límite de 1000 filas
    let maestro: any[] = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('inventario_maestro')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) throw new Error("Error obteniendo maestro: " + error.message);
      if (!data || data.length === 0) break;
      
      maestro.push(...data);
      if (data.length < pageSize) break;
      page++;
    }

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

    // Preparar CONTEOS_REALES (Origen directo de la App)
    const reportConteosReales: any[][] = [
      ["Producto (SKU)", "Descripción", "Lote", "Ubicación Física App", "Cantidad Física", "Fecha/Hora Conteo"]
    ];
    picking?.forEach((p: any) => {
      reportConteosReales.push([
        p.sku || "SIN_SKU",
        p.descripcion || "",
        p.lote || "SIN_LOTE",
        p.ubicacion_fisica || "",
        p.cantidad_fisica || 0,
        p.timestamp || p.created_at || ""
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
    let conteosRealesSheetId = metaData.sheets.find((s: any) => s.properties.title === 'CONTEOS_REALES')?.properties.sheetId;

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
    if (!conteosRealesSheetId) setupRequests.push({ addSheet: { properties: { title: "CONTEOS_REALES" } } });
    
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
      conteosRealesSheetId = m2.sheets.find((s: any) => s.properties.title === 'CONTEOS_REALES').properties.sheetId;
    }

    // 6. Inyectar Datos y Limpiar Pestañas
    const clearSheets = async (name: string) => {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${name}!A1:Z40000:clear`, { 
        method: "POST", 
        headers: { Authorization: `Bearer ${accessToken}` } 
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Error limpiando pestaña ${name}: ${txt}`);
      }
    };
    await clearSheets("DATA_LOTES");
    await clearSheets("DATA_PRODUCTOS");
    await clearSheets("CONTEOS_REALES");
    await clearSheets("DASHBOARD");

    const updateSheet = async (name: string, vals: any[][]) => {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${name}!A1?valueInputOption=RAW`, {
        method: "PUT", 
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: `${name}!A1`, majorDimension: "ROWS", values: vals })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Error actualizando pestaña ${name}: ${txt}`);
      }
    };

    await updateSheet("DATA_LOTES", reportLotes);
    await updateSheet("DATA_PRODUCTOS", reportProductos);
    await updateSheet("CONTEOS_REALES", reportConteosReales);

    // 7. KPIs y Dashboard (Sobre DATA_PRODUCTOS)
    const diffProdCount = reportProductos.slice(1).filter(r => Number(r[4]) !== 0).length;
    const precisionVal = (reportProductos.length > 1) 
      ? ((reportProductos.length - 1 - diffProdCount) / (reportProductos.length - 1))
      : 0;

    // --- PROCESAMIENTO LOGÍSTICO Y MATEMÁTICO (KPIs) ---

    // KPI 2 (Avance): % de SKUs únicos de 'inventario_maestro' que ya existen en 'conteos_picking'
    const uniqueMasterSkus = new Set(maestro.map((m: any) => m.sku).filter(Boolean));
    const uniquePickingSkus = new Set(picking?.map((p: any) => p.sku).filter(Boolean));
    let countExist = 0;
    uniqueMasterSkus.forEach(sku => {
      if (uniquePickingSkus.has(sku)) countExist++;
    });
    const kpiAvance = uniqueMasterSkus.size > 0 ? (countExist / uniqueMasterSkus.size) : 0;

    // KPI 3 (Sobrantes vs Faltantes) y KPI 6 (Exactitud Absoluta)
    let kpiSobrantes = 0;
    let kpiFaltantes = 0;
    let kpiCuadrados = 0;
    reportLotes.slice(1).forEach(row => {
      const diff = Number(row[8]);
      if (diff > 0) kpiSobrantes++;
      else if (diff < 0) kpiFaltantes++;
      else kpiCuadrados++;
    });

    const kpiExactitud = reportLotes.length > 1 ? (kpiCuadrados / (reportLotes.length - 1)) : 0;

    // KPI 8 (Top 5 Ubicaciones Desordenadas): Agrupar absolute differences por ubicacion_sap
    const ubiDiffs: Record<string, number> = {};
    reportLotes.slice(1).forEach(row => {
      const ubi = row[5] || "N/A";
      const diffAbs = Math.abs(Number(row[8]));
      if (!ubiDiffs[ubi]) ubiDiffs[ubi] = 0;
      ubiDiffs[ubi] += diffAbs;
    });
    const topUbis = Object.entries(ubiDiffs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // KPI 9 (Efecto Espejo/Cruces de Lotes): SKU + Almacen has both positive and negative diffs
    const skuAlmacenDiffs: Record<string, { positive: boolean, negative: boolean }> = {};
    reportLotes.slice(1).forEach(row => {
      const sku = row[0];
      const almacen = row[4] || "N/A";
      const diff = Number(row[8]);
      const key = `${sku}_${almacen}`;
      if (!skuAlmacenDiffs[key]) {
        skuAlmacenDiffs[key] = { positive: false, negative: false };
      }
      if (diff > 0) skuAlmacenDiffs[key].positive = true;
      if (diff < 0) skuAlmacenDiffs[key].negative = true;
    });
    let kpiEfectoEspejo = 0;
    Object.values(skuAlmacenDiffs).forEach(val => {
      if (val.positive && val.negative) {
        kpiEfectoEspejo++;
      }
    });

    // KPI 12 (Conflictos Multiusuario): lotes with > 1 counts in picking with different quantities
    const lotPickingQty: Record<string, Set<number>> = {};
    picking?.forEach((p: any) => {
      const lote = p.lote;
      if (!lote) return;
      if (!lotPickingQty[lote]) {
        lotPickingQty[lote] = new Set<number>();
      }
      lotPickingQty[lote].add(Number(p.cantidad_fisica || 0));
    });
    let kpiConflictosMultiusuario = 0;
    Object.values(lotPickingQty).forEach(qtys => {
      if (qtys.size > 1) {
        kpiConflictosMultiusuario++;
      }
    });

    const dashValues: any[][] = [
      ["REPORTE EJECUTIVO DE CONTROL DE INVENTARIO"], // Index 0 (Row 1)
      ["Fecha de Generación: " + new Date().toLocaleDateString()], // Index 1 (Row 2)
      [""], // Index 2 (Row 3)
      [""], // Index 3 (Row 4)
      ["", "", "", "", "", "", ""], // Index 4 (Row 5)
      ["", "", "", "", "", "", ""], // Index 5 (Row 6)
      ["", "", "", "", "", "", ""], // Index 6 (Row 7)
      ["", "", "", "", "", "", ""], // Index 7 (Row 8)
      ["", "", "", "", "", "", ""], // Index 8 (Row 9)
      ["", "", "", "", "", "", ""], // Index 9 (Row 10)
      ["", "", "", "", "", "", ""], // Index 10 (Row 11)
      ["", "", "", "", "", "", ""], // Index 11 (Row 12)
      [""], // Index 12 (Row 13)
      ["TOP 20 DISCREPANCIAS POR PRODUCTO"], // Index 13 (Row 14)
      ["Producto (SKU)", "Diferencia Neta"] // Index 14 (Row 15)
    ];

    const topDiffs = reportProductos.slice(1)
      .sort((a, b) => Math.abs(Number(b[4])) - Math.abs(Number(a[4])))
      .slice(0, 20);
    topDiffs.forEach(t => dashValues.push([t[0], t[4]]));

    // Append spacer and Top 5 Ubicaciones Desordenadas (KPI 8)
    dashValues.push([""]); // Row 36 (Index 35)
    dashValues.push(["TOP 5 UBICACIONES CON DESCUADRE"]); // Row 37 (Index 36)
    dashValues.push(["Ubicación SAP", "Descuadre Absoluto"]); // Row 38 (Index 37)

    topUbis.forEach(tu => dashValues.push([tu[0], tu[1]])); // Rows 39-43 (Indices 38-42)

    await updateSheet("DASHBOARD", dashValues);

    // 8. Aplicar estilos, cuadrículas, formatos condicionales, segmentadores y gráfica en DASHBOARD
    const stylingAndChartRequests: any[] = [
      // Asegurar cuadrículas activas (hideGridlines: false) en todas las hojas
      {
        updateSheetProperties: {
          properties: { sheetId: dashboardSheetId, gridProperties: { hideGridlines: false } },
          fields: "gridProperties.hideGridlines"
        }
      },
      // Descombinar celdas previas en el área de KPIs para evitar conflictos al volver a generar
      {
        unmergeCells: {
          range: {
            sheetId: dashboardSheetId,
            startRowIndex: 0,
            endRowIndex: 30,
            startColumnIndex: 0,
            endColumnIndex: 12
          }
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
      {
        updateSheetProperties: {
          properties: { sheetId: conteosRealesSheetId, gridProperties: { hideGridlines: false } },
          fields: "gridProperties.hideGridlines"
        }
      },
      // --- INTERACTIVIDAD CON SEGMENTADORES (SLICERS) ---
      {
        addSlicer: {
          slicer: {
            spec: {
              dataRange: {
                sheetId: lotesSheetId,
                startRowIndex: 0,
                startColumnIndex: 0,
                endRowIndex: 40000,
                endColumnIndex: 9
              },
              columnIndex: 3, // Centro (Col D) en DATA_LOTES
              title: "Centro"
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId: dashboardSheetId,
                  rowIndex: 3,      // Renglón 4 (index 3)
                  columnIndex: 9    // Columna J (index 9)
                },
                widthPixels: 180,
                heightPixels: 60
              }
            }
          }
        }
      },
      {
        addSlicer: {
          slicer: {
            spec: {
              dataRange: {
                sheetId: lotesSheetId,
                startRowIndex: 0,
                startColumnIndex: 0,
                endRowIndex: 40000,
                endColumnIndex: 9
              },
              columnIndex: 4, // Almacen (Col E) en DATA_LOTES
              title: "Almacén"
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId: dashboardSheetId,
                  rowIndex: 3,      // Renglón 4 (index 3)
                  columnIndex: 11   // Columna L (index 11)
                },
                widthPixels: 180,
                heightPixels: 60
              }
            }
          }
        }
      },
      // --- FORMATO PREMIUM DE DASHBOARD ---
      // 1. Fusión de título principal (A1:H1) y styling
      {
        mergeCells: {
          range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          mergeType: "MERGE_ALL"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 16, foregroundColor: { red: 0.12, green: 0.12, blue: 0.12 } },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE"
            }
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)"
        }
      },
      // 2. Fusión de fecha (A2:H2) y styling
      {
        mergeCells: {
          range: { sheetId: dashboardSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
          mergeType: "MERGE_ALL"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              textFormat: { italic: true, fontSize: 10, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE"
            }
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)"
        }
      }
    ];

    // Helper para generar tarjetas de 4 filas x 2 columnas combinadas con Rich Text
    const cardRequests = (
      colStart: number,
      rowLStart: number,
      titleText: string,
      valText: string,
      colorRGB: { red: number; green: number; blue: number },
      textRGB: { red: number; green: number; blue: number }
    ) => {
      const fullText = `${titleText}\n\n${valText}`;
      const valStartIndex = titleText.length + 2; // length + \n\n

      return [
        // Merge completo de la tarjeta (4 filas x 2 cols)
        {
          mergeCells: {
            range: {
              sheetId: dashboardSheetId,
              startRowIndex: rowLStart,
              endRowIndex: rowLStart + 4,
              startColumnIndex: colStart,
              endColumnIndex: colStart + 2
            },
            mergeType: "MERGE_ALL"
          }
        },
        // Estilo de fondo y bordes para todas las celdas combinadas de la tarjeta
        {
          repeatCell: {
            range: {
              sheetId: dashboardSheetId,
              startRowIndex: rowLStart,
              endRowIndex: rowLStart + 4,
              startColumnIndex: colStart,
              endColumnIndex: colStart + 2
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: colorRGB,
                borders: {
                  top: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } },
                  bottom: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } },
                  left: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } },
                  right: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } }
                }
              }
            },
            fields: "userEnteredFormat(backgroundColor,borders)"
          }
        },
        // Escribir Valor Combinado y aplicar TextFormatRuns en la celda inicial
        {
          updateCells: {
            range: {
              sheetId: dashboardSheetId,
              startRowIndex: rowLStart,
              endRowIndex: rowLStart + 1,
              startColumnIndex: colStart,
              endColumnIndex: colStart + 1
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: fullText
                    },
                    userEnteredFormat: {
                      backgroundColor: colorRGB,
                      borders: {
                        top: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } },
                        bottom: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } },
                        left: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } },
                        right: { style: "SOLID", color: { red: 0.4, green: 0.4, blue: 0.4 } }
                      },
                      horizontalAlignment: "CENTER",
                      verticalAlignment: "MIDDLE"
                    },
                    textFormatRuns: [
                      {
                        startIndex: 0,
                        format: {
                          bold: true,
                          fontSize: 10,
                          foregroundColor: textRGB
                        }
                      },
                      {
                        startIndex: valStartIndex,
                        format: {
                          bold: true,
                          fontSize: 20,
                          foregroundColor: textRGB
                        }
                      }
                    ]
                  }
                ]
              }
            ],
            fields: "userEnteredValue,userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,borders),textFormatRuns"
          }
        }
      ];
    };

    const cards = [
      { col: 0, rowL: 4, title: "TOTAL CATÁLOGO (SAP)", val: (reportProductos.length - 1).toLocaleString('en-US'), bg: { red: 0.94, green: 0.94, blue: 0.94 }, txt: { red: 0.2, green: 0.2, blue: 0.2 } },
      { col: 3, rowL: 4, title: "PRODUCTOS CON DISCREPANCIA", val: diffProdCount.toLocaleString('en-US'), bg: { red: 0.99, green: 0.88, blue: 0.88 }, txt: { red: 0.6, green: 0.0, blue: 0.0 } },
      { col: 6, rowL: 4, title: "PRECISIÓN GENERAL", val: `${(precisionVal * 100).toFixed(2)}%`, bg: { red: 0.88, green: 0.95, blue: 0.88 }, txt: { red: 0.0, green: 0.4, blue: 0.0 } },
      { col: 0, rowL: 8, title: "AVANCE DE CONTEO", val: `${(kpiAvance * 100).toFixed(2)}%`, bg: { red: 0.88, green: 0.88, blue: 0.98 }, txt: { red: 0.1, green: 0.1, blue: 0.5 } },
      { col: 3, rowL: 8, title: "EFECTO ESPEJO (CRUCES)", val: kpiEfectoEspejo.toLocaleString('en-US'), bg: { red: 0.99, green: 0.99, blue: 0.85 }, txt: { red: 0.5, green: 0.4, blue: 0.1 } },
      { col: 6, rowL: 8, title: "CONFLICTOS MULTIUSUARIO", val: kpiConflictosMultiusuario.toLocaleString('en-US'), bg: { red: 0.99, green: 0.92, blue: 0.82 }, txt: { red: 0.6, green: 0.3, blue: 0.1 } }
    ];

    cards.forEach(c => {
      stylingAndChartRequests.push(...cardRequests(c.col, c.rowL, c.title, c.val, c.bg, c.txt));
    });

    // Añadir solicitudes restantes
    stylingAndChartRequests.push(
      // 9. Título y Encabezados de Tabla de Resumen de Discrepancias (Fila 14, index 13)
      {
        mergeCells: {
          range: { sheetId: dashboardSheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 2 },
          mergeType: "MERGE_ALL"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 0.12, green: 0.12, blue: 0.12 } },
              horizontalAlignment: "LEFT",
              verticalAlignment: "MIDDLE"
            }
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.12, blue: 0.12 },
              textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
      },
      // Alineaciones de tabla de resumen (Filas 16 a 35, index 15 a 35)
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 15, endRowIndex: 35, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 15, endRowIndex: 35, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "RIGHT",
              numberFormat: { type: "NUMBER", pattern: "#,##0" }
            }
          },
          fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
        }
      },
      // 10. Título y Encabezados de Tabla de Top Ubicaciones Desordenadas (Fila 37, index 36)
      {
        mergeCells: {
          range: { sheetId: dashboardSheetId, startRowIndex: 36, endRowIndex: 37, startColumnIndex: 0, endColumnIndex: 2 },
          mergeType: "MERGE_ALL"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 36, endRowIndex: 37, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 0.12, green: 0.12, blue: 0.12 } },
              horizontalAlignment: "LEFT",
              verticalAlignment: "MIDDLE"
            }
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 37, endRowIndex: 38, startColumnIndex: 0, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.12, blue: 0.12 },
              textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
      },
      // Alineaciones de tabla de ubicaciones (Filas 39 a 43, index 38 a 43)
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 38, endRowIndex: 43, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: 38, endRowIndex: 43, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "RIGHT",
              numberFormat: { type: "NUMBER", pattern: "#,##0" }
            }
          },
          fields: "userEnteredFormat(horizontalAlignment,numberFormat)"
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
      // Encabezados CONTEOS_REALES (Gris oscuro, texto blanco negrita)
      {
        repeatCell: {
          range: { sheetId: conteosRealesSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
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
      // Alineaciones CONTEOS_REALES: Centrar SKU (Columna A, index 0) y Lote (Columna C, index 2)
      {
        repeatCell: {
          range: { sheetId: conteosRealesSheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      {
        repeatCell: {
          range: { sheetId: conteosRealesSheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
          cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      },
      // Alineaciones CONTEOS_REALES: Alinear a la derecha cantidad física (Columna index 4)
      {
        repeatCell: {
          range: { sheetId: conteosRealesSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
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
      // Gráfica en DASHBOARD (Posición J5, ampliada y estilizada)
      {
        addChart: {
          chart: {
            spec: {
              title: "Top 20 Discrepancias de Inventario",
              basicChart: {
                chartType: "COLUMN",
                axis: [{ position: "BOTTOM_AXIS", title: "SKU" }, { position: "LEFT_AXIS", title: "Diferencia" }],
                domains: [{ domain: { sourceRange: { sources: [{ sheetId: dashboardSheetId, startRowIndex: 15, endRowIndex: 15 + topDiffs.length, startColumnIndex: 0, endColumnIndex: 1 }] } } }],
                series: [{ series: { sourceRange: { sources: [{ sheetId: dashboardSheetId, startRowIndex: 15, endRowIndex: 15 + topDiffs.length, startColumnIndex: 1, endColumnIndex: 2 }] } }, targetAxis: "LEFT_AXIS" }]
              }
            },
            position: { overlayPosition: { anchorCell: { sheetId: dashboardSheetId, rowIndex: 4, columnIndex: 9 }, widthPixels: 850, heightPixels: 450 } }
          }
        }
      }
    );

    const finalRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST", headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: stylingAndChartRequests })
    });
    if (!finalRes.ok) {
      const errorText = await finalRes.text();
      throw new Error("Error aplicando estilos y gráficos en batchUpdate: " + errorText);
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


