import React, { useState } from 'react';
import { View, Text, Button, TextInput, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';

export default function ScanScreen({ navigation }: any) {
  const [scannedSku, setScannedSku] = useState('');
  const [loading, setLoading] = useState(false);

  const searchAndNavigate = async () => {
    if (!scannedSku) return;
    setLoading(true);

    let queryLote = scannedSku.trim();
    let queryProducto = '';
    let cantidadExtraida = '';

    if (queryLote.includes('-')) {
      const parts = queryLote.split('-');
      queryProducto = parts[0];
      queryLote = parts[1];
      if (parts.length > 2 && parts[2] !== '@') {
        cantidadExtraida = parts[2];
      }
    }

    try {
      const { data, error } = await supabase
        .from('inventario_maestro')
        .select('*')
        .eq('lote', queryLote)
        .single();
        
      if (data) {
        navigation.navigate('Capture', { 
          sku: queryProducto || data.sku, 
          lote: queryLote, 
          data: data, 
          cantidad: cantidadExtraida 
        });
      } else {
        throw new Error('No encontrado');
      }
    } catch (e: any) {
      Alert.alert('Atención', `El lote ${queryLote} no existe en SAP. ¿Registrar como material nuevo?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Registrar', onPress: () => navigation.navigate('Capture', { 
            sku: queryProducto || queryLote, 
            lote: queryLote, 
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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
      <Text style={{ color: '#fff', fontSize: 20, marginBottom: 20 }}>Escáner de Código de Barras (O Lector Externo)</Text>
      
      <TextInput 
        style={{ backgroundColor: '#2A2A2A', color: '#00ffcc', padding: 15, fontSize: 24, width: '80%', textAlign: 'center', borderRadius: 8, borderWidth: 2, borderColor: '#0052cc', marginBottom: 20 }}
        placeholder="Dispara el láser aquí..."
        placeholderTextColor="#555"
        autoFocus
        value={scannedSku}
        onChangeText={setScannedSku}
        onSubmitEditing={searchAndNavigate}
      />

      <View style={{ marginVertical: 20, width: '60%' }}>
        <Button 
          title="Buscar Manualmente" 
          color="#0052cc"
          onPress={searchAndNavigate} 
        />
      </View>
    </View>
  );
}
