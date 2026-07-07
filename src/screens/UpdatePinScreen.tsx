import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { Lock, Delete, RotateCcw, LogOut } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

export default function UpdatePinScreen() {
  const { updatePin, logout } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [activeInput, setActiveInput] = useState<'new' | 'confirm'>('new');
  const [loading, setLoading] = useState(false);

  const handleKeyPress = (num: string) => {
    if (activeInput === 'new') {
      if (newPin.length < 4) {
        setNewPin(prev => prev + num);
      }
    } else {
      if (confirmPin.length < 4) {
        setConfirmPin(prev => prev + num);
      }
    }
  };

  const handleBackspace = () => {
    if (activeInput === 'new') {
      setNewPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (activeInput === 'new') {
      setNewPin('');
    } else {
      setConfirmPin('');
    }
  };

  const handleSavePin = async () => {
    if (newPin.length !== 4 || confirmPin.length !== 4) {
      Alert.alert('Error', 'El PIN debe ser de exactamente 4 dígitos.');
      return;
    }
    if (newPin === '0000') {
      Alert.alert('Error', 'El nuevo PIN no puede ser "0000".');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Error', 'Los PINs ingresados no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await updatePin(newPin);
      Alert.alert('PIN Actualizado', 'Tu clave de seguridad ha sido actualizada. Ya puedes operar.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo actualizar el PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Lock color="#121212" size={26} />
          </View>
          <Text style={styles.title}>ACTUALIZAR PIN</Text>
          <Text style={styles.subtitle}>
            Tu PIN ha sido reseteado por soporte. Por seguridad, debes ingresar una nueva clave de 4 dígitos para continuar.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Input Nuevo PIN */}
          <Text style={styles.label}>NUEVO PIN DE 4 DÍGITOS</Text>
          <TouchableOpacity
            style={[styles.inputBox, activeInput === 'new' && styles.inputBoxActive]}
            onPress={() => setActiveInput('new')}
          >
            <Lock color={activeInput === 'new' ? '#e6a822' : '#666'} size={20} />
            <Text style={styles.inputText}>
              {newPin ? '• '.repeat(newPin.length) : <Text style={styles.placeholderText}>Escribe nuevo PIN</Text>}
            </Text>
          </TouchableOpacity>

          {/* Input Confirmar PIN */}
          <Text style={styles.label}>CONFIRMAR NUEVO PIN</Text>
          <TouchableOpacity
            style={[styles.inputBox, activeInput === 'confirm' && styles.inputBoxActive]}
            onPress={() => setActiveInput('confirm')}
          >
            <Lock color={activeInput === 'confirm' ? '#e6a822' : '#666'} size={20} />
            <Text style={styles.inputText}>
              {confirmPin ? '• '.repeat(confirmPin.length) : <Text style={styles.placeholderText}>Confirma nuevo PIN</Text>}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Teclado numérico personalizado */}
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

        {/* Botón de Confirmación */}
        <TouchableOpacity
          style={[
            styles.button,
            (newPin.length !== 4 || confirmPin.length !== 4 || loading) && styles.buttonDisabled
          ]}
          onPress={handleSavePin}
          disabled={newPin.length !== 4 || confirmPin.length !== 4 || loading}
        >
          {loading ? (
            <ActivityIndicator color="#121212" size="small" />
          ) : (
            <Text style={styles.buttonText}>GUARDAR CLAVE</Text>
          )}
        </TouchableOpacity>

        {/* Enlace de Cerrar Sesión para salir */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <LogOut color="#ff4444" size={16} />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  title: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
    textAlign: 'center',
    lineHeight: 16,
  },
  form: {
    gap: 8,
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
    height: 48,
  },
  inputBoxActive: {
    borderColor: '#e6a822',
    backgroundColor: '#2D2D2D',
  },
  inputText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
    fontWeight: '700',
    letterSpacing: 3,
  },
  placeholderText: {
    color: '#555',
    fontSize: 14,
    fontWeight: 'normal',
    letterSpacing: 0,
  },
  keypad: {
    gap: 8,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  key: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    height: 48,
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
    fontSize: 20,
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#e6a822',
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#333',
  },
  buttonText: {
    color: '#121212',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    gap: 5,
  },
  logoutText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
