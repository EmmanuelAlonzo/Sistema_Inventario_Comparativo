import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

interface ZebraScannerProps {
  onScan: (data?: string) => void;
  scannedSku: string;
  setScannedSku: (val: string) => void;
}

export default function ZebraScanner({ onScan, scannedSku, setScannedSku }: ZebraScannerProps) {
  return (
    <TextInput 
      style={styles.input}
      placeholder="Escanear SKU o Lote..."
      placeholderTextColor="#555"
      autoFocus
      value={scannedSku}
      onChangeText={setScannedSku}
      onSubmitEditing={() => onScan(scannedSku)}
    />
  );
}

const styles = StyleSheet.create({
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
  }
});
