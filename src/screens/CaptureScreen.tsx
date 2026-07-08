import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const NAVES = ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210'];
const FILAS = ['A', 'B', 'C'];
const NIVELES = ['1', '2', '3', '4', '5', '6'];

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default function CaptureScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const [transactionId] = useState(() => generateUUID());
  const preloadedData = route.params?.data || null;
  const initialSku = route.params?.sku || '';
  const initialLote = route.params?.lote || route.params?.sku || '';
  const initialCantidad = route.params?.cantidad || '';
  
  const { asignacionId } = route.params || {};
  const isAssigned = !!asignacionId;
  
  const [sku, setSku] = useState(initialSku === 'Desconocido' ? '' : initialSku);
  const [lote, setLote] = useState(initialLote === 'Desconocido' ? '' : initialLote);
  const [descripcion, setDescripcion] = useState(preloadedData?.descripcion || '');

  const [cantidad, setCantidad] = useState(initialCantidad);
  const [nave, setNave] = useState(route.params?.nave || '');
  const [fila, setFila] = useState(route.params?.seccion || '');
  const [nivel, setNivel] = useState(route.params?.numero ? parseInt(route.params.numero, 10).toString() : '');
  
  const [stockSap, setStockSap] = useState<number | null>(preloadedData?.stock_sap || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStock = async () => {
      if (!preloadedData && lote && lote !== 'Desconocido') {
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
  }, [lote, preloadedData]);

  const saveToDb = async (ubicacionReal: string, columnaStr: string) => {
    setLoading(true);
    try {
      const timestamp = new Date().toISOString();

      // Guardar directamente en Supabase en tiempo real usando UPSERT
      // id: transactionId asegura la idempotencia (evita duplicados si el usuario reintenta)
      // ignoreDuplicates: true le indica a PostgreSQL hacer 'ON CONFLICT (id) DO NOTHING'
      const { error } = await supabase.from('conteos_picking').upsert({
        id: transactionId,
        sku: sku || null,
        lote: lote || null,
        descripcion: descripcion || null,
        cantidad_fisica: parseFloat(cantidad),
        ubicacion_fisica: ubicacionReal,
        timestamp,
        operador_id: user ? user.codigo_empleado : null,
        sincronizado_drive: false
      }, { onConflict: 'id', ignoreDuplicates: true });
      
      if (error) throw error;
      
      Alert.alert('Conteo Guardado', `Ubicación Real: ${ubicacionReal}\nSincronizado con Supabase en tiempo real.`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.error('Error al guardar en Supabase:', error);
      Alert.alert(
        '⚠️ Error de Conexión / Guardado',
        `El conteo NO pudo ser guardado en la nube.\n\nDetalle: ${error.message || 'Error de conexión a Internet'}\n\nLos datos ingresados siguen en pantalla. Por favor, verifica tu conexión a Internet e intenta de nuevo.`,
        [{ text: 'Entendido' }]
      );
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
        <Text style={styles.loteText}>Producto (SKU):</Text>
        <TextInput 
          style={styles.editableInput} 
          value={sku} 
          onChangeText={setSku} 
          placeholder="Ingrese SKU"
          placeholderTextColor="#666"
        />
        <Text style={[styles.loteText, {marginTop: 10}]}>Descripción:</Text>
        <TextInput 
          style={styles.editableInputSmall} 
          value={descripcion} 
          onChangeText={setDescripcion} 
          placeholder="Descripción (opcional)"
          placeholderTextColor="#666"
        />
        <Text style={[styles.loteText, {marginTop: 10}]}>Lote / Embarque:</Text>
        <TextInput 
          style={styles.editableInput} 
          value={lote} 
          onChangeText={setLote} 
          placeholder="Ingrese Lote"
          placeholderTextColor="#666"
        />
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

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 }}>
          <Text style={{ color: '#00ffcc', fontSize: 14, fontWeight: '600', textTransform: 'uppercase' }}>
            {isAssigned ? '📍 Ubicación Asignada (Fija)' : '2. Selecciona Nave (201 - 210)'}
          </Text>
          {isAssigned && (
            <View style={{ backgroundColor: 'rgba(230, 168, 34, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#e6a822' }}>
              <Text style={{ color: '#e6a822', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>🔒 BLOQUEADO</Text>
            </View>
          )}
        </View>
        <View style={styles.gridContainer}>
          {NAVES.map(n => (
            <TouchableOpacity 
              key={n} 
              style={[
                styles.gridButton, 
                nave === n && styles.gridButtonActive,
                isAssigned && nave !== n && { opacity: 0.25 }
              ]}
              onPress={() => setNave(n)}
              disabled={isAssigned}
            >
              <Text style={[styles.gridButtonText, nave === n && styles.gridButtonTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.rowLayout}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.label}>3. Sección</Text>
            <View style={styles.rowContainer}>
              {FILAS.map(f => (
                <TouchableOpacity 
                  key={f} 
                  style={[
                    styles.smallButton, 
                    fila === f && styles.smallButtonActive,
                    isAssigned && fila !== f && { opacity: 0.25 }
                  ]}
                  onPress={() => setFila(f)}
                  disabled={isAssigned}
                >
                  <Text style={[styles.gridButtonText, fila === f && styles.gridButtonTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <View style={{ flex: 1.5 }}>
            <Text style={styles.label}>4. Número (001 - 006)</Text>
            <View style={styles.rowContainerWrap}>
              {NIVELES.map(niv => (
                <TouchableOpacity 
                  key={niv} 
                  style={[
                    styles.smallButtonWrap, 
                    nivel === niv && styles.smallButtonActive,
                    isAssigned && nivel !== niv && { opacity: 0.25 }
                  ]}
                  onPress={() => setNivel(niv)}
                  disabled={isAssigned}
                >
                  <Text style={[styles.gridButtonText, nivel === niv && styles.gridButtonTextActive]}>{niv}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveButtonText}>CONFIRMAR CONTEO</Text>}
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
  editableInput: {
    backgroundColor: '#1E1E1E',
    color: '#00ffcc',
    fontSize: 22,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    textAlign: 'center',
    fontWeight: 'bold',
    width: '100%',
    marginTop: 5,
  },
  editableInputSmall: {
    backgroundColor: '#1E1E1E',
    color: '#fff',
    fontSize: 16,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    textAlign: 'center',
    width: '100%',
    marginTop: 5,
    fontStyle: 'italic',
  },
  descText: {
    color: '#00ffcc',
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
    fontStyle: 'italic'
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
