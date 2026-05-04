import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput, Alert, ActivityIndicator, Modal, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../services/supabase';
import ZebraScanner from '../components/Scanner/ZebraScanner';
import CameraScanner from '../components/Scanner/CameraScanner';
import * as Device from 'expo-device';

export default function ScanScreen({ navigation }: any) {
  const [scannedSku, setScannedSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [useCamera, setUseCamera] = useState(false);

  useEffect(() => {
    // Si el fabricante no es Zebra, usamos la cámara por defecto.
    const isZebra = Device.manufacturer?.toLowerCase().includes('zebra');
    setUseCamera(!isZebra);
  }, []);

  const navigateToCapture = (item: any, cantidadExtraida: string) => {
    setShowModal(false);
    navigation.navigate('Capture', { 
      sku: item.sku, 
      lote: item.lote, 
      data: item, 
      cantidad: cantidadExtraida 
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

    // Soporte para códigos compuestos (ej: SKU-LOTE-CANTIDAD)
    if (rawInput.includes('-')) {
      const parts = rawInput.split('-');
      queryProducto = parts[0];
      queryLote = parts[1];
      if (parts.length > 2 && parts[2] !== '@') {
        cantidadExtraida = parts[2];
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
        // 2. Búsqueda simple: Primero intentar por SKU
        const resSku = await supabase
          .from('inventario_maestro')
          .select('*')
          .eq('sku', rawInput);
        
        if (resSku.data && resSku.data.length > 0) {
          data = resSku.data;
          error = resSku.error;
        } else {
          // 3. Si no existe como SKU, entonces buscamos como Lote
          const resLote = await supabase
            .from('inventario_maestro')
            .select('*')
            .eq('lote', rawInput);
          data = resLote.data;
          error = resLote.error;
        }
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
      Alert.alert('Atención', `El material o SKU "${rawInput}" no existe en SAP. ¿Registrar como material nuevo?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Registrar', onPress: () => navigation.navigate('Capture', { 
            sku: queryProducto || rawInput, 
            lote: queryLote || rawInput, 
            cantidad: cantidadExtraida 
          }) 
        }
      ]);
    } finally {
      setLoading(false);
      setScannedSku(''); // Limpiar para el siguiente escaneo
    }
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
        <CameraScanner onScan={searchAndNavigate} isActive={!showModal && !loading} />
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
  }
});
