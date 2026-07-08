import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput, Alert, ActivityIndicator, Modal, FlatList, TouchableOpacity, StyleSheet, DeviceEventEmitter, Platform } from 'react-native';
import { supabase } from '../services/supabase';
import ZebraScanner from '../components/Scanner/ZebraScanner';
import CameraScanner from '../components/Scanner/CameraScanner';
import * as Device from 'expo-device';

export default function ScanScreen({ route, navigation }: any) {
  const { nave, seccion, numero, asignacionId } = route.params || {};
  const [scannedSku, setScannedSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    // Si el fabricante no es Zebra, usamos la cámara por defecto.
    const isZebra = Device.manufacturer?.toLowerCase().includes('zebra');
    setUseCamera(!isZebra);
  }, []);

  useEffect(() => {
    // Configuración recomendada en la aplicación nativa de DataWedge en terminales Zebra:
    // ---------------------------------------------------------------------------------
    // * Profile Name: Multigroup
    // * Associated App: com.multigroup.inventario (o "*" para todas las actividades)
    // * Intent Delivery: Broadcast Intent
    // * Intent Action: com.multigroup.inventario.ACTION
    // * Intent Category: (Dejar vacía o por defecto)
    // ---------------------------------------------------------------------------------
    if (Platform.OS === 'android') {
      const subscription = DeviceEventEmitter.addListener(
        'onBroadcastReceiverReceived',
        (event: any) => {
          if (event && event.action === 'com.multigroup.inventario.ACTION') {
            const barcode = event.extras?.['com.symbol.datawedge.data_string'] || event['com.symbol.datawedge.data_string'];
            if (barcode) {
              searchAndNavigate(barcode.trim());
            }
          }
        }
      );
      return () => {
        subscription.remove();
      };
    }
  }, []);

  const navigateToCapture = (item: any, cantidadExtraida: string) => {
    setShowModal(false);
    navigation.navigate('Capture', { 
      sku: item.sku, 
      lote: item.lote, 
      data: item, 
      cantidad: cantidadExtraida,
      nave,
      seccion,
      numero,
      asignacionId
    });
  };

  const searchAndNavigate = async (codeToSearch?: string | any) => {
    const inputToUse = typeof codeToSearch === 'string' ? codeToSearch : scannedSku;
    if (!inputToUse) return;
    setLoading(true);

    const rawInput = inputToUse.trim();
    let queryLote = rawInput;
    let queryProducto = '';
    let cantidadExtraida = '';

    // Soporte para códigos compuestos (ej: SKU-LOTE-CANTIDAD o [SKU-CON-GUION]-LOTE-CANTIDAD)
    if (rawInput.includes('-')) {
      const parts = rawInput.split('-');
      if (parts.length >= 3) {
        // Leer de derecha a izquierda (split inverso)
        const possibleQty = parts[parts.length - 1];
        if (possibleQty !== '@') {
          cantidadExtraida = possibleQty;
        }
        queryLote = parts[parts.length - 2];
        // Reconstruir el SKU por si tenía guiones originalmente
        queryProducto = parts.slice(0, parts.length - 2).join('-');
      } else if (parts.length === 2) {
        queryProducto = parts[0];
        queryLote = parts[1];
      }
    }

    try {
      let data: any[] | null = null;
      let error = null;

      if (queryProducto && queryProducto !== '') {
        // 1. Si es un código compuesto, buscar coincidencia exacta
        const res = await supabase
          .from('inventario_maestro')
          .select('*')
          .eq('sku', queryProducto)
          .eq('lote', queryLote);
        data = res.data;
        error = res.error;
      } else {
        // Búsqueda simple optimizada: ejecuta la consulta de SKU o Lote en un solo viaje de red
        const { data: resData, error: resError } = await supabase
          .from('inventario_maestro')
          .select('*')
          .or(`sku.eq.${rawInput},lote.eq.${rawInput}`);
        
        data = resData;
        error = resError;
      }
        
      if (data && data.length > 0) {
        if (data.length === 1) {
          navigateToCapture(data[0], cantidadExtraida);
        } else {
          // Si hay más de uno, mostramos selección
          setResults(data);
          setShowModal(true);
        }
      } else {
        throw new Error('No encontrado');
      }
    } catch (e: any) {
      setShowAlert(true);
      Alert.alert('Atención', `El material o SKU "${rawInput}" no existe en SAP. ¿Registrar como material nuevo?`, [
        { text: 'Cancelar', style: 'cancel', onPress: () => setShowAlert(false) },
        { text: 'Registrar', onPress: () => { 
            setShowAlert(false);
            navigation.navigate('Capture', { 
              sku: queryProducto || rawInput, 
              lote: queryLote || rawInput, 
              cantidad: cantidadExtraida,
              nave,
              seccion,
              numero,
              asignacionId
            }) 
          } 
        }
      ]);
    } finally {
      setLoading(false);
      setScannedSku(''); // Limpiar para el siguiente escaneo
    }
  };

  const handleFinishAssignment = async () => {
    if (!asignacionId) {
      Alert.alert('Error', 'No hay una asignación activa.');
      return;
    }
    Alert.alert(
      'Finalizar Conteo de Ubicación',
      '¿Estás seguro de finalizar el conteo en esta ubicación? Ya no podrás agregar más materiales a esta zona.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Finalizar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('asignaciones_conteo')
                .update({ estado: 'completada' })
                .eq('id', asignacionId);

              if (error) throw error;

              Alert.alert('Ubicación Finalizada', 'La ubicación ha sido marcada como completada con éxito.', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (e: any) {
              Alert.alert('Error', 'No se pudo finalizar la ubicación: ' + e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Escáner de Inventario</Text>
        <TouchableOpacity 
          style={styles.toggleButton} 
          onPress={() => setUseCamera(!useCamera)}
        >
          <Text style={styles.toggleText}>{useCamera ? '📸 Cámara' : '📳 Láser'}</Text>
        </TouchableOpacity>
      </View>
      
      {useCamera ? (
        <CameraScanner onScan={searchAndNavigate} isActive={!showModal && !loading && !showAlert} />
      ) : (
        <ZebraScanner 
          onScan={searchAndNavigate} 
          scannedSku={scannedSku} 
          setScannedSku={setScannedSku} 
        />
      )}

      <View style={{ marginVertical: 20, width: '60%' }}>
        <TouchableOpacity style={styles.manualButton} onPress={searchAndNavigate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.manualButtonText}>BUSCAR AHORA</Text>}
        </TouchableOpacity>
      </View>

      {asignacionId && (
        <TouchableOpacity 
          style={styles.finalizeButton} 
          onPress={handleFinishAssignment}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.finalizeButtonText}>Finalizar Conteo de Ubicación</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Modal de Selección de Lote */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Múltiples Lotes Encontrados</Text>
            <Text style={styles.modalSubtitle}>Selecciona el lote físico que tienes en mano:</Text>
            
            <FlatList 
              data={results}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.itemCard}
                  onPress={() => navigateToCapture(item, '')}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.itemLote}>Lote: {item.lote}</Text>
                    {item.descripcion ? <Text style={styles.itemDesc} numberOfLines={2}>{item.descripcion}</Text> : null}
                    <Text style={styles.itemInfo}>Stock SAP: {item.stock_sap} | Ubic: {item.ubicacion_sap}</Text>
                  </View>
                  <Text style={styles.selectText}>SELECCIONAR</Text>
                </TouchableOpacity>
              )}
            />
            
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowModal(false)}>
              <Text style={styles.closeButtonText}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    marginTop: 20
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  toggleButton: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleText: {
    color: '#00ffcc',
    fontWeight: 'bold',
    fontSize: 14
  },
  input: {
    backgroundColor: '#2A2A2A',
    color: '#00ffcc',
    padding: 15,
    fontSize: 24,
    width: '100%',
    textAlign: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0052cc',
    marginBottom: 20
  },
  manualButton: {
    backgroundColor: '#0052cc',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center'
  },
  manualButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333'
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  modalSubtitle: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 5
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#ff4444'
  },
  itemLote: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  itemDesc: {
    color: '#00ffcc',
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic'
  },
  itemInfo: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 2
  },
  selectText: {
    color: '#ff4444',
    fontWeight: '900',
    fontSize: 12
  },
  closeButton: {
    marginTop: 20,
    padding: 15,
    alignItems: 'center'
  },
  closeButtonText: {
    color: '#ff4444',
    fontWeight: 'bold'
  },
  finalizeButton: {
    backgroundColor: '#ff3333',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    width: '90%',
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#ff6666',
    shadowColor: '#ff3333',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },
  finalizeButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  }
});
