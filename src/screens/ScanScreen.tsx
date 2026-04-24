import React, { useState } from 'react';
import { View, Text, Button, TextInput, Alert, ActivityIndicator, Modal, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../services/supabase';

export default function ScanScreen({ navigation }: any) {
  const [scannedSku, setScannedSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const navigateToCapture = (item: any, cantidadExtraida: string) => {
    setShowModal(false);
    navigation.navigate('Capture', { 
      sku: item.sku, 
      lote: item.lote, 
      data: item, 
      cantidad: cantidadExtraida 
    });
  };

  const searchAndNavigate = async () => {
    if (!scannedSku) return;
    setLoading(true);

    const rawInput = scannedSku.trim();
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
      // Buscamos coincidencia exacta por LOTE o por SKU (sin límite de 1)
      const { data, error } = await supabase
        .from('inventario_maestro')
        .select('*')
        .or(`lote.eq."${queryLote}",sku.eq."${rawInput}"`);
        
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
      <Text style={styles.title}>Escáner de Inventario</Text>
      
      <TextInput 
        style={styles.input}
        placeholder="Escanear SKU o Lote..."
        placeholderTextColor="#555"
        autoFocus
        value={scannedSku}
        onChangeText={setScannedSku}
        onSubmitEditing={searchAndNavigate}
      />

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
                  <View>
                    <Text style={styles.itemLote}>Lote: {item.lote}</Text>
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
  title: {
    color: '#fff',
    fontSize: 20,
    marginBottom: 20,
    fontWeight: 'bold'
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
