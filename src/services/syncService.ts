import { supabase } from './supabase';
import { dbLocal } from '../database/sqlite';
import { Alert } from 'react-native';


/**
 * Busca los registros guardados offline y los sube a Supabase
 */
export const uploadPendingCounts = async () => {
  try {
    const pending = await dbLocal.getAllAsync('SELECT * FROM conteos_picking WHERE sincronizado_drive = 0');
    
    if (!pending || pending.length === 0) {
      Alert.alert('Subida', 'No hay conteos pendientes por subir.');
      return { success: true, count: 0 };
    }

    // Insertar en Supabase
    const { error } = await supabase.from('conteos_picking').insert(pending.map((item: any) => ({
      id: item.id,
      lote: item.lote,
      cantidad_fisica: item.cantidad_fisica,
      ubicacion_fisica: `${item.nave}${item.fila}${item.columna}`,
      timestamp: item.timestamp,
      sincronizado_drive: false
    })));

    if (error) throw error;

    // Actualizar localmente a sincronizado para no volver a subir
    const ids = pending.map((p: any) => `'${p.id}'`).join(',');
    await dbLocal.runAsync(`UPDATE conteos_picking SET sincronizado_drive = 1 WHERE id IN (${ids})`);

    return { success: true, count: pending.length };

  } catch (error: any) {
    console.error('Error subiendo conteos:', error.message);
    Alert.alert('Error de Subida', error.message);
    return { success: false, error };
  }
};
