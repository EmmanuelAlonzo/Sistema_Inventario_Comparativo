import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';
import { dbLocal } from '../database/sqlite';

const NAVES = ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210'];
const FILAS = ['A', 'B', 'C'];
const NIVELES = ['1', '2', '3', '4', '5', '6'];

export default function CaptureScreen({ route, navigation }: any) {
  const lote = route.params?.lote || route.params?.sku || 'Desconocido';
  const sku = route.params?.sku || 'Desconocido';
  const preloadedData = route.params?.data || null;
  const initialCantidad = route.params?.cantidad || '';
  
  const [cantidad, setCantidad] = useState(initialCantidad);
  const [nave, setNave] = useState('');
  const [fila, setFila] = useState('');
  const [nivel, setNivel] = useState('');
  
  const [stockSap, setStockSap] = useState<number | null>(preloadedData?.stock_sap || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStock = async () => {
      if (!preloadedData && lote !== 'Desconocido') {
        try {
          const { data, error } = await supabase
            .from('inventario_maestro')
            .select('stock_sap')
            .eq('lote', lote)
            .single();
            
          if (data) setStockSap(data.stock_sap);
        } catch (err) {
          console.error('Error cargando stock SAP:', err);
        }
      }
    };
    fetchStock();
  }, [lote]);

  const saveToDb = async (ubicacionReal: string, columnaStr: string) => {
    setLoading(true);
    try {
      const idStr = Math.random().toString(36).substring(2, 15);
      const timestamp = new Date().toISOString();

      // Guardar directamente en Supabase (usando las columnas del esquema remoto)
      const { error } = await supabase.from('conteos_picking').insert({
        lote: lote, // Se guarda usando el identificador único del lote
        cantidad_fisica: parseFloat(cantidad),
        ubicacion_fisica: ubicacionReal,
        timestamp,
        sincronizado_drive: true 
      });
      
      if (error) throw error;
      
      // Guardar respaldo offline opcional (para que uploadPendingCounts lo ignore porque sincronizado_drive=1)
      await dbLocal.runAsync(
        'INSERT INTO conteos_picking (id, lote, cantidad_fisica, nave, fila, columna, timestamp, sincronizado_drive) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [idStr, lote, parseFloat(cantidad), nave, fila, columnaStr, timestamp]
      ).catch(() => {});

      Alert.alert('Conteo Guardado', `Ubicación Real asignada: ${ubicacionReal}\nSincronizado con la Nube.`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', 'No se pudo guardar en Supabase: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cantidad || !nave || !fila || !nivel) {
      Alert.alert('Error', 'Todos los campos son obligatorios.');
      return;
    }

    const columnaStr = nivel.padStart(3, '0');
    const ubicacionReal = `${nave}${fila}${columnaStr}`;
    const cantidadNum = parseFloat(cantidad);

    if (stockSap !== null && cantidadNum !== stockSap) {
      Alert.alert(
        '⚠️ Discrepancia Detectada',
        `Teórico SAP: ${stockSap}\nConteo Físico: ${cantidadNum}\nDiferencia: ${cantidadNum - stockSap}\n\n¿Estás seguro de confirmar este conteo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sí, Confirmar', style: 'destructive', onPress: () => saveToDb(ubicacionReal, columnaStr) }
        ]
      );
      return;
    }

    saveToDb(ubicacionReal, columnaStr);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.headerPanel}>
        <Text style={styles.loteText}>Producto:</Text>
        <Text style={styles.loteValue}>{sku}</Text>
        <Text style={[styles.loteText, {marginTop: 10}]}>Lote / Embarque:</Text>
        <Text style={[styles.loteValue, {fontSize: 20}]}>{lote}</Text>
      </View>
      
      <View style={styles.formCard}>
        <Text style={styles.label}>1. Cantidad Física (Pzas)</Text>
        <TextInput 
          style={styles.numericInput} 
          keyboardType="numeric" 
          value={cantidad} 
          onChangeText={setCantidad} 
          placeholderTextColor="#666"
          placeholder="0"
        />

        <Text style={styles.label}>2. Selecciona Nave (201 - 210)</Text>
        <View style={styles.gridContainer}>
          {NAVES.map(n => (
            <TouchableOpacity 
              key={n} 
              style={[styles.gridButton, nave === n && styles.gridButtonActive]}
              onPress={() => setNave(n)}
            >
              <Text style={[styles.gridButtonText, nave === n && styles.gridButtonTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.rowLayout}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.label}>3. Fila</Text>
            <View style={styles.rowContainer}>
              {FILAS.map(f => (
                <TouchableOpacity 
                  key={f} 
                  style={[styles.smallButton, fila === f && styles.smallButtonActive]}
                  onPress={() => setFila(f)}
                >
                  <Text style={[styles.gridButtonText, fila === f && styles.gridButtonTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <View style={{ flex: 1.5 }}>
            <Text style={styles.label}>4. Nivel (001 - 006)</Text>
            <View style={styles.rowContainerWrap}>
              {NIVELES.map(niv => (
                <TouchableOpacity 
                  key={niv} 
                  style={[styles.smallButtonWrap, nivel === niv && styles.smallButtonActive]}
                  onPress={() => setNivel(niv)}
                >
                  <Text style={[styles.gridButtonText, nivel === niv && styles.gridButtonTextActive]}>{niv}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>CONFIRMAR CONTEO OFFLINE</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#121212',
  },
  headerPanel: {
    backgroundColor: '#2A2A2A',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: '#00ffcc',
  },
  loteText: {
    color: '#aaa',
    fontSize: 16,
  },
  loteValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 5,
  },
  formCard: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 12,
  },
  label: {
    color: '#00ffcc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase',
  },
  numericInput: {
    backgroundColor: '#000',
    color: '#fff',
    fontSize: 32,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  gridButton: {
    width: '18%',
    aspectRatio: 1,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  gridButtonActive: {
    backgroundColor: '#0052cc',
    borderColor: '#0088ff',
  },
  gridButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gridButtonTextActive: {
    color: '#fff',
  },
  rowLayout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowContainer: {
    flexDirection: 'column',
    gap: 10,
  },
  rowContainerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  smallButton: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  smallButtonWrap: {
    width: '45%',
    backgroundColor: '#2A2A2A',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  smallButtonActive: {
    backgroundColor: '#0052cc',
    borderColor: '#0088ff',
  },
  saveButton: {
    backgroundColor: '#00ffcc',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 40,
    elevation: 3,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  }
});
