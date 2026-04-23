-- Script de Inicialización para Supabase: Sistema de Inventario Comparativo

-- 1. Tabla: app_settings (Almacena la configuración dinámica)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS estricto pero permitir que todos lean (si usas anon key)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura de configuraciones" ON public.app_settings FOR SELECT USING (true);

-- 2. Tabla: inventario_maestro (La "Verdad" que viene de SAP - Soporta duplicados de lote)
CREATE TABLE IF NOT EXISTS public.inventario_maestro (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lote text NOT NULL,
  sku text,
  descripcion text,
  ubicacion_sap text,
  stock_sap numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.inventario_maestro ENABLE ROW LEVEL SECURITY;
-- Todos pueden leer el maestro para mandarlo a SQLite
CREATE POLICY "Permitir lectura del maestro" ON public.inventario_maestro FOR SELECT USING (true);

-- 3. Tabla: conteos_picking (Donde caen los envíos del handheld)
CREATE TABLE IF NOT EXISTS public.conteos_picking (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lote text REFERENCES public.inventario_maestro(lote),
  cantidad_fisica numeric NOT NULL,
  ubicacion_fisica text NOT NULL, -- ej. 206B004
  operador_id text,
  timestamp timestamp with time zone NOT NULL,
  sincronizado_drive boolean DEFAULT false, -- Cambiará a true cuando el Edge Function procese
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.conteos_picking ENABLE ROW LEVEL SECURITY;
-- Los usuarios/handhelds pueden insertar y leer sus propios datos
CREATE POLICY "Permitir inserción de conteos" ON public.conteos_picking FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura de conteos" ON public.conteos_picking FOR SELECT USING (true);
CREATE POLICY "Permitir actualización de conteos" ON public.conteos_picking FOR UPDATE USING (true);

-- Notas:
-- Copia y pega esto en tu "SQL Editor" de Supabase y dale a RUN.
