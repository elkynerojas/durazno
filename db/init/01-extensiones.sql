-- Se ejecuta una sola vez, al crear el volumen de datos por primera vez.
-- La imagen postgis/postgis ya instala PostGIS; esto asegura las extensiones
-- que usa el proyecto aunque se cambie de imagen.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Zona horaria por defecto de la base: las fechas se guardan como timestamptz
-- (UTC internamente) y se muestran en hora de Colombia.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Bogota');
END
$$;
