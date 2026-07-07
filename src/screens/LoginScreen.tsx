import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  ScrollView,
  Modal,
  TextInput
} from 'react-native';
import { Lock, User, Delete, RotateCcw } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

export default function LoginScreen() {
  const { login } = useAuth();
  const [codigoEmpleado, setCodigoEmpleado] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeInput, setActiveInput] = useState<'codigo' | 'pin'>('codigo');

  // Recuperación de PIN
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryCodigo, setRecoveryCodigo] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleRequestRecovery = async () => {
    if (!recoveryCodigo.trim()) return;
    setRecoveryLoading(true);
    try {
      const { error } = await supabase
        .from('solicitudes_recuperacion')
        .insert([
          {
            codigo_empleado: recoveryCodigo.trim(),
            estado: 'pendiente'
          }
        ]);

      if (error) throw error;

      Alert.alert(
        'Solicitud Enviada', 
        'Tu solicitud ha sido registrada. Pídele al supervisor que apruebe tu reseteo a PIN genérico "0000".'
      );
      setShowRecoveryModal(false);
      setRecoveryCodigo('');
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo enviar la solicitud: ' + e.message);
    } finally {
      setRecoveryLoading(false);
    }
  };

  const isButtonDisabled = codigoEmpleado.trim() === '' || pin.length !== 4;

  const handleKeyPress = (num: string) => {
    if (activeInput === 'codigo') {
      setCodigoEmpleado(prev => prev + num);
    } else {
      if (pin.length < 4) {
        setPin(prev => prev + num);
      }
    }
  };

  const handleBackspace = () => {
    if (activeInput === 'codigo') {
      setCodigoEmpleado(prev => prev.slice(0, -1));
    } else {
      setPin(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (activeInput === 'codigo') {
      setCodigoEmpleado('');
    } else {
      setPin('');
    }
  };

  const handleLogin = async () => {
    if (isButtonDisabled) return;
    setLoading(true);
    try {
      await login(codigoEmpleado.trim(), pin);
    } catch (e: any) {
      Alert.alert('Error de Acceso', e.message || 'Hubo un error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} bounces={false}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>📦</Text>
          </View>
          <Text style={styles.title}>CONTROL DE INVENTARIO</Text>
          <Text style={styles.subtitle}>Ingreso de Personal de Bodega</Text>
        </View>

        {/* Inputs del formulario */}
        <View style={styles.form}>
          <Text style={styles.label}>CÓDIGO DE EMPLEADO</Text>
          <TouchableOpacity 
            activeOpacity={0.8}
            style={[styles.inputBox, activeInput === 'codigo' && styles.inputBoxActive]}
            onPress={() => setActiveInput('codigo')}
          >
            <User color={activeInput === 'codigo' ? '#e6a822' : '#888'} size={20} />
            <Text style={[styles.inputText, !codigoEmpleado && styles.placeholderText]}>
              {codigoEmpleado || 'Seleccionar e ingresar código'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>PIN DE ACCESO (4 DÍGITOS)</Text>
          <TouchableOpacity 
            activeOpacity={0.8}
            style={[styles.inputBox, activeInput === 'pin' && styles.inputBoxActive]}
            onPress={() => setActiveInput('pin')}
          >
            <Lock color={activeInput === 'pin' ? '#e6a822' : '#888'} size={20} />
            <Text style={[styles.inputText, !pin && styles.placeholderText]}>
              {pin ? '• '.repeat(pin.length).trim() : 'Seleccionar e ingresar PIN'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Teclado numérico industrial en pantalla */}
        <View style={styles.keypad}>
          <View style={styles.row}>
            {['1', '2', '3'].map((num) => (
              <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            {['4', '5', '6'].map((num) => (
              <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            {['7', '8', '9'].map((num) => (
              <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.key, styles.utilityKey]} onPress={handleClear}>
              <RotateCcw color="#ff4444" size={24} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, styles.utilityKey]} onPress={handleBackspace}>
              <Delete color="#e6a822" size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Botón de envío */}
        <TouchableOpacity
          style={[
            styles.button,
            isButtonDisabled && styles.buttonDisabled,
            loading && styles.buttonLoading
          ]}
          onPress={handleLogin}
          disabled={isButtonDisabled || loading}
        >
          {loading ? (
            <ActivityIndicator color="#121212" size="small" />
          ) : (
            <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
          )}
        </TouchableOpacity>

        {/* Botón Olvidé mi PIN */}
        <TouchableOpacity 
          style={styles.forgotBtn} 
          onPress={() => setShowRecoveryModal(true)}
          disabled={loading}
        >
          <Text style={styles.forgotText}>¿Olvidaste tu PIN?</Text>
        </TouchableOpacity>

        {/* Modal de Recuperación */}
        <Modal
          visible={showRecoveryModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            if (!recoveryLoading) {
              setShowRecoveryModal(false);
              setRecoveryCodigo('');
            }
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>RECUPERAR ACCESO</Text>
              <Text style={styles.modalDesc}>
                Ingresa tu Código de Empleado para solicitar que un supervisor resetee tu PIN a "0000".
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="Código de Empleado"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={recoveryCodigo}
                onChangeText={setRecoveryCodigo}
                editable={!recoveryLoading}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalBtnCancel]} 
                  onPress={() => {
                    setShowRecoveryModal(false);
                    setRecoveryCodigo('');
                  }}
                  disabled={recoveryLoading}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalBtnSend]} 
                  onPress={handleRequestRecovery}
                  disabled={recoveryLoading || !recoveryCodigo.trim()}
                >
                  {recoveryLoading ? (
                    <ActivityIndicator color="#121212" size="small" />
                  ) : (
                    <Text style={styles.modalBtnSendText}>Enviar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    backgroundColor: '#e6a822',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoIcon: {
    fontSize: 26,
  },
  title: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  form: {
    gap: 10,
    marginBottom: 20,
  },
  label: {
    color: '#e6a822',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3D3D3D',
    borderRadius: 8,
    paddingHorizontal: 15,
    height: 50,
  },
  inputBoxActive: {
    borderColor: '#e6a822',
    backgroundColor: '#2D2D2D',
  },
  inputText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
    fontWeight: '600',
  },
  placeholderText: {
    color: '#555',
    fontWeight: 'normal',
  },
  keypad: {
    gap: 10,
    marginBottom: 25,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  key: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  utilityKey: {
    backgroundColor: '#222',
  },
  keyText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#e6a822',
    borderRadius: 8,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e6a822',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#333',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonLoading: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#121212',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  forgotBtn: {
    alignItems: 'center',
    marginTop: 15,
  },
  forgotText: {
    color: '#e6a822',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDesc: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 16,
  },
  modalInput: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3D3D3D',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 15,
    height: 48,
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  modalBtnCancelText: {
    color: '#aaa',
    fontWeight: '700',
  },
  modalBtnSend: {
    backgroundColor: '#e6a822',
  },
  modalBtnSendText: {
    color: '#121212',
    fontWeight: '900',
  },
});
