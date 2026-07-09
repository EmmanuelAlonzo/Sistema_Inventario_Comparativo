import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Modal, 
  TextInput 
} from 'react-native';
import { Play, CheckCircle, LogOut, User, MapPin, Lock } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

interface Asignacion {
  id: string;
  nave: string;
  seccion: string;
  numero: string;
  estado: 'pendiente' | 'en_progreso' | 'completada';
  operador_id?: string;
  auxiliar_1_id?: string;
  centro?: string;
  almacen?: string;
  ubicacion?: string;
}

export default function AuxiliarScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal Cambiar PIN
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    fetchAsignaciones();
    const unsubscribe = navigation.addListener('focus', () => {
      fetchAsignaciones();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchAsignaciones = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('asignaciones_conteo')
        .select('*')
        .eq('operador_id', user.id)
        .in('estado', ['pendiente', 'en_progreso']);

      if (error) throw error;
      setAsignaciones(data || []);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudieron cargar las asignaciones: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStartConteo = async (item: Asignacion) => {
    if (item.estado === 'pendiente') {
      try {
        const { error } = await supabase
          .from('asignaciones_conteo')
          .update({
            id: item.id,
            estado: 'en_progreso',
            operador_id: item.operador_id || user?.id,
            auxiliar_1_id: item.auxiliar_1_id || user?.id,
            centro: item.centro || 'C200',
            almacen: item.almacen || 'A100',
            ubicacion: item.ubicacion || `${item.nave}${item.seccion}${item.numero.padStart(3, '0')}`,
            nave: item.nave,
            seccion: item.seccion,
            numero: item.numero
          })
          .eq('id', item.id);
        
        if (error) throw error;
      } catch (err: any) {
        console.error('Error al actualizar estado a en_progreso:', err);
        Alert.alert('Error de Conexión', 'No se pudo iniciar el conteo en Supabase: ' + err.message);
        return; // Detener flujo para no navegar si falló la actualización
      }
    }

    navigation.navigate('Scan', {
      nave: item.nave,
      seccion: item.seccion,
      numero: item.numero,
      asignacionId: item.id
    });
  };

  const handleChangePin = async () => {
    if (newPin.length !== 4 || confirmPin.length !== 4) {
      Alert.alert('Error', 'El PIN debe ser de exactamente 4 dígitos.');
      return;
    }
    if (newPin === '0000') {
      Alert.alert('Error', 'El nuevo PIN no puede ser "0000".');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Error', 'Los PINs no coinciden.');
      return;
    }

    setPinLoading(true);
    try {
      const { error } = await supabase
        .from('usuarios_bodega')
        .update({ pin: newPin.trim() })
        .eq('id', user?.id);

      if (error) throw error;
      Alert.alert('Éxito', 'Tu PIN de seguridad ha sido modificado.');
      setNewPin('');
      setConfirmPin('');
      setShowChangePinModal(false);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo actualizar el PIN: ' + e.message);
    } finally {
      setPinLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Deseas salir del sistema?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar Sesión', style: 'destructive', onPress: logout }
    ]);
  };

  const renderItem = ({ item }: { item: Asignacion }) => (
    <View style={styles.card}>
      <View style={[styles.cardHeader, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPin color="#e6a822" size={22} />
          <Text style={styles.cardTitle}>UBICACIÓN ASIGNADA</Text>
        </View>
        <View style={[
          styles.statusBadge,
          item.estado === 'en_progreso' 
            ? { backgroundColor: 'rgba(230, 168, 34, 0.15)', borderColor: '#e6a822' }
            : { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderColor: '#555' }
        ]}>
          <Text style={[
            styles.statusBadgeText,
            item.estado === 'en_progreso' ? { color: '#e6a822' } : { color: '#aaa' }
          ]}>
            {item.estado === 'en_progreso' ? 'EN PROGRESO' : 'PENDIENTE'}
          </Text>
        </View>
      </View>

      <View style={styles.locationContainer}>
        <Text style={styles.locationLabel}>CÓDIGO DE UBICACIÓN</Text>
        <Text style={styles.locationValue}>
          {item.ubicacion || `${item.nave}${item.seccion}${item.numero.padStart(3, '0')}`}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={styles.startButton}
          onPress={() => handleStartConteo(item)}
        >
          <Play color="#121212" size={18} fill="#121212" />
          <Text style={styles.startButtonText}>
            {item.estado === 'en_progreso' ? 'Reanudar Conteo' : 'Iniciar Conteo'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          <View style={styles.avatar}>
            <User color="#121212" size={22} />
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user?.nombre}</Text>
            <Text style={styles.userRole}>AUXILIAR DE BODEGA • #{user?.codigo_empleado}</Text>
          </View>
          <View style={styles.actionsHeaderRow}>
            <TouchableOpacity style={styles.keyBtn} onPress={() => setShowChangePinModal(true)}>
              <Lock color="#e6a822" size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <LogOut color="#ff4444" size={20} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>MIS TAREAS DE CONTEO</Text>

      {loading && asignaciones.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#e6a822" />
          <Text style={styles.grayText}>Cargando ubicaciones asignadas...</Text>
        </View>
      ) : asignaciones.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchAsignaciones();
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyText}>¡No tienes ubicaciones pendientes!</Text>
              <Text style={styles.emptySubText}>Buen trabajo, consulta al supervisor si requieres nuevas asignaciones.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={asignaciones}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchAsignaciones();
          }}
        />
      )}

      {/* Modal Cambiar PIN */}
      <Modal
        visible={showChangePinModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChangePinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>MODIFICAR PIN</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nuevo PIN (4 dígitos)"
              placeholderTextColor="#666"
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              value={newPin}
              onChangeText={setNewPin}
              editable={!pinLoading}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Confirmar PIN"
              placeholderTextColor="#666"
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
              editable={!pinLoading}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setNewPin('');
                  setConfirmPin('');
                  setShowChangePinModal(false);
                }}
                disabled={pinLoading}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnSend]}
                onPress={handleChangePin}
                disabled={pinLoading}
              >
                {pinLoading ? <ActivityIndicator size="small" color="#121212" /> : <Text style={styles.modalBtnSendText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 15,
  },
  header: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: '#e6a822',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  userRole: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  actionsHeaderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keyBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(230, 168, 34, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(230, 168, 34, 0.2)',
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  sectionTitle: {
    color: '#e6a822',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 15,
  },
  listContainer: {
    gap: 15,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#aaa',
    fontWeight: '700',
    fontSize: 12,
  },
  layoutInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#262626',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  infoCol: {
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
  },
  infoValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6a822',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  startButtonText: {
    color: '#121212',
    fontWeight: '900',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  grayText: {
    color: '#888',
    marginTop: 10,
    fontSize: 14,
  },
  emptyIcon: {
    fontSize: 45,
    marginBottom: 10,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
    width: '100%',
    maxWidth: 300,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3D3D3D',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 15,
    height: 44,
    fontSize: 13,
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 5,
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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  locationContainer: {
    backgroundColor: '#262626',
    borderRadius: 8,
    padding: 16,
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  locationLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  locationValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
