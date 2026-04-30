import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

interface CameraScannerProps {
  onScan: (data: string) => void;
}

export default function CameraScanner({ onScan }: CameraScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const lastScanned = useRef<{ data: string; time: number }>({ data: '', time: 0 });

  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Cargar el sonido del beep
    async function loadSound() {
      try {
        const { sound } = await Audio.Sound.createAsync(require('../../../assets/beep.mp3'));
        soundRef.current = sound;
      } catch (error) {
        console.warn('No se pudo cargar beep.mp3', error);
      }
    }
    loadSound();

    return () => { 
      if (soundRef.current) {
        soundRef.current.unloadAsync(); 
      }
    };
  }, []);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.message}>Necesitamos tu permiso para usar la cámara</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Otorgar Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    const now = Date.now();
    // Bloqueo de 1.5 segundos para el MISMO código
    if (lastScanned.current.data === data && (now - lastScanned.current.time) < 1500) {
      return;
    }

    lastScanned.current = { data, time: now };

    // Feedback sensorial
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Flash visual (borde verde)
    setFlashOn(true);
    setTimeout(() => setFlashOn(false), 300);

    // Reproducir beep
    if (soundRef.current) {
      try {
        await soundRef.current.replayAsync();
      } catch (error) {
        // Ignorar si falla la reproducción
      }
    }

    // Emitir el escaneo
    onScan(data);
  };

  return (
    <View style={[styles.container, flashOn && styles.flashBorder]}>
      <CameraView 
        style={styles.camera} 
        facing="back"
        onBarcodeScanned={handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_e", "upc_a"],
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.scanFrame} />
        <Text style={styles.instructions}>Apunta al código de barras</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300, // Ajustable según necesidad
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: 'transparent', // Por defecto transparente
  },
  flashBorder: {
    borderColor: '#00ffcc', // Borde verde al escanear
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 20,
  },
  message: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#0052cc',
    padding: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 200,
    height: 100,
    borderWidth: 2,
    borderColor: '#ffffff80',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  instructions: {
    position: 'absolute',
    bottom: 20,
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    fontSize: 12,
  }
});
