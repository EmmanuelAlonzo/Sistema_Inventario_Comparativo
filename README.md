# 🚀 Sistema de Inventario Comparativo (Grado Industrial)

Este sistema está diseñado para la validación masiva de inventarios industriales (SAP), integrando handhelds móviles con la potencia de Google Cloud y Supabase. Está optimizado para trabajar en tiempo real con más de 36,000 registros.

## 🛠️ Arquitectura

- **Frontend:** Expo (React Native) con diseño **MoodyDark Premium** (Rojo/Gris oscuro).
- **Backend:** Supabase (PostgreSQL + Edge Functions).
- **Reporteo:** Google Sheets API (Dashboard Automatizado con gráficas).
- **Sincronización:** Google Drive Service Account (Bot automático).
- **Actualizaciones:** Expo Updates (OTA - Over The Air).

## ✨ Funcionalidades Clave

### 1. Búsqueda y Escaneo Inteligente
- **Escaneo Compuesto:** Procesa códigos de barras en formato `[Producto]-[Lote]-[Cantidad]`.
- **Búsqueda Dual:** Al ingresar un código, el sistema busca coincidencias tanto en **Lote** como en **SKU**.
- **Selector de Lotes:** Si un SKU tiene múltiples lotes, se despliega una lista de selección con borde rojo indicando el Stock Teórico y la Ubicación de cada uno.

### 2. Control de Inventario
- **Visualización de Stock SAP:** Muestra el stock teórico directamente en el formulario de captura para referencia del operario.
- **Validación de Discrepancias:** Alerta visual inmediata si el conteo físico no coincide con el sistema SAP.
- **Limpieza de Ciclo:** Función para borrar datos locales y de nube al inicio de un nuevo periodo de inventario.

### 3. Reporte Automático y Estilizado
- Genera y actualiza dinámicamente un archivo en Google Drive llamado `RESULTADOS_INVENTARIO`.
- **Pestaña DASHBOARD:** Resumen ejecutivo con KPIs de precisión de inventario y gráficas automáticas de discrepancias.
- **Pestaña DATA_LOTES:** Detalle línea por línea con las diferencias calculadas, encabezados corporativos oscuros, alineación optimizada y formato condicional (celdas en rojo suave si la diferencia es negativa).
- **Pestaña DATA_PRODUCTOS:** Resumen agrupado por SKU con los mismos estándares visuales profesionales y formato condicional.

### 4. Flujo de Datos Optimizado (Directo a la Nube)
- **Consultas Atómicas:** La búsqueda simple de SKU o Lote en el escáner se ejecuta en un solo viaje de red mediante consultas `.or()`.
- **Exportación Eficiente:** La Edge Function `export-results` ya no descarga la totalidad del maestro SAP. En su lugar, aplica filtros inteligentes para descargar únicamente los registros con stock activo o aquellos lotes que interactuaron con los conteos físicos.

---

## 🛡️ Kill Switch (Control Remoto)

La aplicación puede ser bloqueada instantáneamente desde el dashboard de Supabase si es necesario.

**Para DESACTIVAR la app:**
```sql
UPDATE public.app_settings 
SET value = 'false', description = 'Sistema en mantenimiento hasta las 18:00.' 
WHERE key = 'is_app_active';
```

**Para ACTIVAR la app:**
```sql
UPDATE public.app_settings SET value = 'true' WHERE key = 'is_app_active';
```

---

## 🔄 Actualizaciones (OTA)

La aplicación busca actualizaciones automáticamente cada vez que se inicia.
- Si hay una versión nueva disponible en el servidor de Expo, aparecerá un aviso: *"¿Deseas descargarla y reiniciar?"*.
- Esto permite corregir errores o añadir funciones sin necesidad de reinstalar el archivo APK/IPA.

---

## 🚀 Despliegue de Funciones de Nube

Si modificas el código de las Edge Functions, despliega los cambios con:

```bash
npx supabase functions deploy sync-master
npx supabase functions deploy export-results
npx supabase functions deploy clear-database
```

## 📋 Requisitos de Google Drive

Para que el sistema pueda leer el maestro de SAP y exportar reportes:
1. El archivo Excel Maestro debe estar compartido con el correo de la **Service Account** (ubicada en los Secrets de Supabase).
2. Debe existir un archivo (o crearse uno) llamado `RESULTADOS_INVENTARIO` compartido con el bot para que este pueda escribir los resultados.

---
**Multigroup - Operaciones Logísticas**
