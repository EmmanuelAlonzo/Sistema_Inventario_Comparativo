import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  ScrollView,
  FlatList,
  Modal,
  TextInput,
  Switch
} from 'react-native';
import { 
  Barcode, 
  CloudDownload, 
  FileSpreadsheet, 
  LogOut, 
  ShieldAlert, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Check, 
  Trash2, 
  Settings, 
  RefreshCw,
  MapPin,
  Lock
} from 'lucide-react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

interface Usuario {
  id: string;
  primer_nombre: string;
  segundo_nombre?: string;
  primer_apellido: string;
  segundo_apellido?: string;
  codigo_empleado: string;
  pin: string;
  rol: string;
  estado: 'activo' | 'suspendido';
}

interface Solicitud {
  id: string;
  codigo_empleado: string;
  estado: 'pendiente' | 'resuelta';
  creado_at: string;
}

interface UbicacionCatalogo {
  id: string;
  nave: string;
  seccion: string;
  numero: string;
}

const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default function AdminScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [checking, setChecking] = useState(true);

  // Tabs: 'operaciones' | 'asignaciones' | 'personal' | 'recuperacion'
  const [activeTab, setActiveTab] = useState<'operaciones' | 'asignaciones' | 'personal' | 'recuperacion'>('operaciones');

  // Listas
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<any[]>([]);
  const [catUbicaciones, setCatUbicaciones] = useState<UbicacionCatalogo[]>([]);

  // Modales y formularios
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newSecondName, setNewSecondName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newSecondLastName, setNewSecondLastName] = useState('');
  const [newCodigo, setNewCodigo] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRol, setNewRol] = useState<'auxiliar' | 'supervisor' | 'admin'>('auxiliar');
  const [secondaryFieldsOptional, setSecondaryFieldsOptional] = useState(false);

  // Modal y formulario Editar Usuario
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editSecondName, setEditSecondName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editSecondLastName, setEditSecondLastName] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRol, setEditRol] = useState<'auxiliar' | 'supervisor' | 'admin'>('auxiliar');

  // Formulario Asignar Ubicación
  const [selectedOperador, setSelectedOperador] = useState<Usuario | null>(null);
  const [showOperatorSelectModal, setShowOperatorSelectModal] = useState(false);
  const [selectedUbicacion, setSelectedUbicacion] = useState<UbicacionCatalogo | null>(null);
  const [showUbicacionSelectModal, setShowUbicacionSelectModal] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);

  // Modal Cambiar PIN
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [myNewPin, setMyNewPin] = useState('');
  const [myConfirmPin, setMyConfirmPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    checkDatabaseState();
    fetchPersonal();
    fetchSolicitudes();
    fetchActiveAssignments();
    fetchCatalogUbicaciones();
  }, []);

  const checkDatabaseState = async () => {
    setChecking(true);
    try {
      const { count, error } = await supabase
        .from('inventario_maestro')
        .select('*', { count: 'exact', head: true });
        
      if (error) throw error;
      setHasData((count || 0) > 0);
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  const fetchPersonal = async () => {
    try {
      // Administrador puede ver todos los roles
      const { data, error } = await supabase
        .from('usuarios_bodega')
        .select('*')
        .order('primer_nombre', { ascending: true });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (e: any) {
      console.error('Error fetching personal:', e);
    }
  };

  const fetchSolicitudes = async () => {
    try {
      // select plano sin filtros que lo rompan
      const { data, error } = await supabase
        .from('solicitudes_recuperacion')
        .select('*')
        .order('creado_at', { ascending: false });

      if (error) throw error;
      setSolicitudes(data || []);
    } catch (e: any) {
      console.error('Error fetching solicitudes:', e);
    }
  };

  const fetchActiveAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('asignaciones_conteo')
        .select('*')
        .eq('estado', 'pendiente')
        .order('id', { ascending: false });

      if (error) throw error;
      setActiveAssignments(data || []);
    } catch (e: any) {
      console.error('Error fetching active assignments:', e);
    }
  };

  const fetchCatalogUbicaciones = async () => {
    setCatalogLoading(true);
    try {
      const { data, error } = await supabase
        .from('cat_ubicaciones')
        .select('*')
        .order('nave', { ascending: true })
        .order('seccion', { ascending: true })
        .order('numero', { ascending: true });

      if (error) throw error;
      setCatUbicaciones(data || []);
    } catch (e: any) {
      console.error('Error fetching cat_ubicaciones:', e);
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleExtractDrive = async () => {
    Alert.alert(
      'Extraer SAP',
      '¿Deseas conectar con Google Drive y extraer el archivo Maestro? Esto puede tomar un minuto.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Proceder', 
          onPress: async () => {
            setLoading(true);
            try {
              const { data, error } = await supabase.functions.invoke('sync-master');
              if (error) throw new Error(error.message || 'Error desconocido.');
              if (data && data.success === false) throw new Error(data.error);
              Alert.alert('Éxito', data?.message || 'Datos importados correctamente.');
              checkDatabaseState();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleGenerateReport = async () => {
    Alert.alert(
      'Generar Comparativo',
      '¿Finalizó el conteo? Se generará el reporte en Google Sheets.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Generar', 
          onPress: async () => {
            setLoading(true);
            try {
              const { data, error } = await supabase.functions.invoke('export-results');
              if (error) throw new Error(error.message || 'Error desconocido.');
              if (data && data.success === false) throw new Error(data.error);
              Alert.alert('Reporte Listo', `¡Archivo generado en Drive!\n\nLink: ${data?.url || 'Revisa tu Drive'}`);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleClearDatabase = async () => {
    Alert.alert(
      '⚠️ CUIDADO: Limpieza Estructural Total',
      'Esto borrará TODOS los registros de SAP y los Conteos de Supabase para iniciar un nuevo inventario. ¿Proceder?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'SÍ, BORRAR TODO', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { data, error } = await supabase.functions.invoke('clear-database');
              if (error) throw new Error(error.message || 'Error desconocido.');
              if (data && data.success === false) throw new Error(data.error);
              Alert.alert('Base de Datos Limpia', 'El sistema está listo para un nuevo inventario.');
              checkDatabaseState();
              fetchActiveAssignments();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCreateUser = async () => {
    const isSecondNameMissing = !newSecondName.trim() && !secondaryFieldsOptional;
    const isSecondLastNameMissing = !newSecondLastName.trim() && !secondaryFieldsOptional;

    if (!newFirstName.trim() || isSecondNameMissing || !newLastName.trim() || isSecondLastNameMissing || !newCodigo.trim() || newPin.length !== 4) {
      Alert.alert(
        'Datos Incompletos', 
        `Por favor llena todos los campos obligatorios. El PIN debe ser de exactamente 4 dígitos. ${!secondaryFieldsOptional ? 'Actualmente Segundo Nombre y Segundo Apellido son requeridos.' : ''}`
      );
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('usuarios_bodega')
        .insert([
          {
            primer_nombre: newFirstName.trim(),
            segundo_nombre: newSecondName.trim() || null,
            primer_apellido: newLastName.trim(),
            segundo_apellido: newSecondLastName.trim() || null,
            codigo_empleado: newCodigo.trim(),
            pin: newPin.trim(),
            rol: newRol,
            estado: 'activo'
          }
        ]);

      if (error) throw error;

      Alert.alert('Usuario Creado', 'El operador ha sido registrado correctamente.');
      setShowAddUserModal(false);
      setNewFirstName('');
      setNewSecondName('');
      setNewLastName('');
      setNewSecondLastName('');
      setNewCodigo('');
      setNewPin('');
      setNewRol('auxiliar');
      setSecondaryFieldsOptional(false);
      fetchPersonal();
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo crear el usuario: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (item: Usuario) => {
    console.log("Abriendo modal para:", item.primer_nombre);
    
    // Guardar los datos de forma inmediata y síncrona en los estados locales
    setEditingUser(item);
    setEditFirstName(item.primer_nombre || '');
    setEditSecondName(item.segundo_nombre || '');
    setEditLastName(item.primer_apellido || '');
    setEditSecondLastName(item.segundo_apellido || '');
    setEditCodigo(item.codigo_empleado || '');
    setEditPin(item.pin || '');
    setEditRol((item.rol as any) || 'auxiliar');
    
    // Ejecutar la apertura en el próximo ciclo del event loop para asegurar que React
    // haya procesado las actualizaciones de estado, previniendo desfases
    setTimeout(() => {
      setShowEditUserModal(true);
    }, 0);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    if (!editFirstName.trim() || !editLastName.trim() || !editCodigo.trim() || editPin.length !== 4) {
      Alert.alert(
        'Datos Incompletos',
        'Por favor llena todos los campos obligatorios (Primer Nombre, Primer Apellido, Código de Empleado). El PIN debe tener exactamente 4 dígitos.'
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('usuarios_bodega')
        .update({
          primer_nombre: editFirstName.trim(),
          segundo_nombre: editSecondName.trim() || null,
          primer_apellido: editLastName.trim(),
          segundo_apellido: editSecondLastName.trim() || null,
          codigo_empleado: editCodigo.trim(),
          pin: editPin.trim(),
          rol: editRol
        })
        .eq('id', editingUser.id);

      if (error) throw error;

      Alert.alert('Usuario Actualizado', 'Los datos del operador han sido actualizados correctamente.');
      setShowEditUserModal(false);
      setEditingUser(null);
      fetchPersonal();
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo actualizar el usuario: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserStatus = async (item: Usuario) => {
    const nuevoEstado = item.estado === 'activo' ? 'suspendido' : 'activo';
    Alert.alert(
      `${nuevoEstado === 'activo' ? 'Activar' : 'Suspender'} Usuario`,
      `¿Confirmas que deseas cambiar el estado de ${item.primer_nombre} a ${nuevoEstado}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('usuarios_bodega')
                .update({ estado: nuevoEstado })
                .eq('id', item.id);

              if (error) throw error;
              fetchPersonal();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteUser = async (item: Usuario) => {
    Alert.alert(
      '⚠️ ELIMINAR OPERADOR',
      `¿Confirmas que deseas eliminar permanentemente al operador ${item.primer_nombre} ${item.primer_apellido} (#${item.codigo_empleado})?\n\nEsta acción es irreversible y podría causar inconsistencias en sus registros históricos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'SÍ, ELIMINAR',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('usuarios_bodega')
                .delete()
                .eq('id', item.id);

              if (error) throw error;
              Alert.alert('Operador Eliminado', 'El operador ha sido removido del sistema.');
              fetchPersonal();
            } catch (e: any) {
              Alert.alert('Error', 'No se pudo eliminar el usuario: ' + e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleApproveRecovery = async (item: Solicitud) => {
    Alert.alert(
      'Aprobar Recuperación',
      `¿Confirmas resetear el PIN del empleado #${item.codigo_empleado} a "0000"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar Reseteo',
          onPress: async () => {
            setLoading(true);
            try {
              // 1. Actualizar PIN del usuario
              const { error: userError } = await supabase
                .from('usuarios_bodega')
                .update({ pin: '0000' })
                .eq('codigo_empleado', item.codigo_empleado);

              if (userError) throw userError;

              // 2. Eliminar la solicitud de la tabla
              const { error: deleteError } = await supabase
                .from('solicitudes_recuperacion')
                .delete()
                .eq('id', item.id);

              if (deleteError) throw deleteError;

              Alert.alert('Éxito', `El PIN para #${item.codigo_empleado} ha sido reseteado a "0000" y la solicitud eliminada.`);
              fetchSolicitudes();
              fetchPersonal();
            } catch (e: any) {
              Alert.alert('Error', 'No se pudo procesar el reseteo: ' + e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleAssignUbicacion = async () => {
    if (!selectedOperador) {
      Alert.alert('Falta Operador', 'Por favor selecciona un operador de la lista.');
      return;
    }
    if (!selectedUbicacion) {
      Alert.alert('Falta Ubicación', 'Por favor selecciona una ubicación del catálogo.');
      return;
    }

    setAssignLoading(true);
    try {
      const assignmentId = generateUUID();
      const ubicacionConcatenada = `${selectedUbicacion.nave}${selectedUbicacion.seccion}${selectedUbicacion.numero.padStart(3, '0')}`;

      // Usar upsert con ignoreDuplicates: true para evitar duplicaciones al guardar en Supabase
      // Enviamos tanto la estructura de layouts (nave/seccion/numero) como el esquema público (centro/almacen/ubicacion)
      // auxiliar_1_id es obligatorio en la base de datos pública y se mapea al ID del operador
      const { error } = await supabase
        .from('asignaciones_conteo')
        .upsert({
          id: assignmentId,
          operador_id: selectedOperador.id,
          auxiliar_1_id: selectedOperador.id,
          nave: selectedUbicacion.nave,
          seccion: selectedUbicacion.seccion,
          numero: selectedUbicacion.numero,
          centro: 'C200',
          almacen: 'A100',
          ubicacion: ubicacionConcatenada,
          estado: 'pendiente'
        }, { onConflict: 'id', ignoreDuplicates: true });

      if (error) throw error;

      Alert.alert('Asignación Creada', `Ubicación asignada con éxito a ${selectedOperador.primer_nombre}.`);
      setSelectedUbicacion(null);
      setSelectedOperador(null);
      fetchActiveAssignments();
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo crear la asignación: ' + e.message);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleChangePin = async () => {
    if (myNewPin.length !== 4 || myConfirmPin.length !== 4) {
      Alert.alert('Error', 'El PIN debe ser de exactamente 4 dígitos.');
      return;
    }
    if (myNewPin === '0000') {
      Alert.alert('Error', 'El nuevo PIN no puede ser "0000".');
      return;
    }
    if (myNewPin !== myConfirmPin) {
      Alert.alert('Error', 'Los PINs no coinciden.');
      return;
    }

    setPinLoading(true);
    try {
      const { error } = await supabase
        .from('usuarios_bodega')
        .update({ pin: myNewPin.trim() })
        .eq('id', user?.id);

      if (error) throw error;
      Alert.alert('Éxito', 'Tu PIN de seguridad ha sido modificado.');
      setMyNewPin('');
      setMyConfirmPin('');
      setShowChangePinModal(false);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo actualizar el PIN: ' + e.message);
    } finally {
      setPinLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout }
    ]);
  };

  // Ayudantes para obtener nombres de operadores en memoria
  const getOperatorName = (codigo: string) => {
    const found = usuarios.find(u => u.codigo_empleado === codigo);
    return found ? `${found.primer_nombre} ${found.primer_apellido}` : '';
  };

  const getOperatorNameByUuid = (uuid: string) => {
    const found = usuarios.find(u => u.id === uuid);
    return found ? `${found.primer_nombre} ${found.primer_apellido}` : `#${uuid}`;
  };

  if (checking) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#ff4444" />
        <Text style={{ color: '#fff', marginTop: 10 }}>Cargando panel...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          <View style={styles.avatar}>
            <ShieldAlert color="#121212" size={24} />
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user?.nombre}</Text>
            <Text style={styles.userRole}>ADMINISTRADOR • #{user?.codigo_empleado}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={styles.keyBtn} onPress={() => setShowChangePinModal(true)}>
              <Lock color="#ff4444" size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <LogOut color="#ff4444" size={22} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs selector */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'operaciones' && styles.tabButtonActive]}
          onPress={() => setActiveTab('operaciones')}
        >
          <Settings color={activeTab === 'operaciones' ? '#121212' : '#888'} size={16} />
          <Text style={[styles.tabText, activeTab === 'operaciones' && styles.tabTextActive]}>Operaciones</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'asignaciones' && styles.tabButtonActive]}
          onPress={() => setActiveTab('asignaciones')}
        >
          <MapPin color={activeTab === 'asignaciones' ? '#121212' : '#888'} size={16} />
          <Text style={[styles.tabText, activeTab === 'asignaciones' && styles.tabTextActive]}>Asignar</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'personal' && styles.tabButtonActive]}
          onPress={() => setActiveTab('personal')}
        >
          <UserPlus color={activeTab === 'personal' ? '#121212' : '#888'} size={16} />
          <Text style={[styles.tabText, activeTab === 'personal' && styles.tabTextActive]}>Personal</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'recuperacion' && styles.tabButtonActive]}
          onPress={() => setActiveTab('recuperacion')}
        >
          <RefreshCw color={activeTab === 'recuperacion' ? '#121212' : '#888'} size={16} />
          <Text style={[styles.tabText, activeTab === 'recuperacion' && styles.tabTextActive]}>PINs</Text>
          {solicitudes.length > 0 && (
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountText}>{solicitudes.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Render Active Tab */}
      {activeTab === 'operaciones' && (
        <ScrollView contentContainerStyle={styles.tabContent} bounces={false}>
          <Text style={styles.sectionTitle}>ACCIONES RÁPIDAS</Text>
          
          <TouchableOpacity 
            style={styles.primaryConteoBtn}
            onPress={() => navigation.navigate('Scan')}
          >
            <Barcode color="#fff" size={28} />
            <View>
              <Text style={styles.primaryConteoText}>Iniciar Captura</Text>
              <Text style={styles.primaryConteoSubText}>Realizar escaneo y registro físico</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>GESTIÓN SAP & NUBE</Text>

          {hasData ? (
            <View style={styles.stateContainer}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>🟢 MAESTRO SAP CARGADO</Text>
              </View>
              
              <TouchableOpacity 
                style={[styles.actionCard, { borderColor: '#00ffcc' }, loading && { opacity: 0.5 }]}
                onPress={handleGenerateReport}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#00ffcc" size="small" /> : <FileSpreadsheet color="#00ffcc" size={28} />}
                <View style={styles.actionCardTextContainer}>
                  <Text style={[styles.actionCardTitle, { color: '#00ffcc' }]}>Generar Reporte Drive</Text>
                  <Text style={styles.actionCardSub}>Exportar comparativo final a Google Sheets</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.stateContainer}>
              <View style={styles.statusBadgeEmpty}>
                <Text style={styles.statusBadgeTextEmpty}>⚪️ ESPERANDO MAESTRO SAP</Text>
              </View>

              <TouchableOpacity 
                style={[styles.actionCard, { borderColor: '#e6a822' }, loading && { opacity: 0.5 }]}
                onPress={handleExtractDrive}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#e6a822" size="small" /> : <CloudDownload color="#e6a822" size={28} />}
                <View style={styles.actionCardTextContainer}>
                  <Text style={[styles.actionCardTitle, { color: '#e6a822' }]}>Extraer SAP de Drive</Text>
                  <Text style={styles.actionCardSub}>Descargar catálogo maestro desde la nube</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionTitle}>MANTENIMIENTO DEL SISTEMA</Text>
          <TouchableOpacity 
            style={[styles.dangerCard, loading && { opacity: 0.5 }]}
            onPress={handleClearDatabase}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#ff4444" size="small" /> : <Trash2 color="#ff4444" size={28} />}
            <View style={styles.actionCardTextContainer}>
              <Text style={styles.dangerCardTitle}>Limpiar Base de Datos Completa</Text>
              <Text style={styles.dangerCardSub}>Borrar catálogo maestro y todo registro de conteo</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'asignaciones' && (
        <View style={styles.tabContainerFull}>
          <Text style={styles.sectionTitle}>ASIGNAR UBICACIÓN DE TRABAJO</Text>
          
          <View style={styles.assignForm}>
            {/* Selector de Operador */}
            <TouchableOpacity 
              style={styles.dropdownBtn}
              onPress={() => setShowOperatorSelectModal(true)}
            >
              <Text style={styles.dropdownBtnText}>
                {selectedOperador 
                  ? `👤 ${selectedOperador.primer_nombre} ${selectedOperador.primer_apellido} (#${selectedOperador.codigo_empleado})`
                  : 'Seleccionar Operador...'}
              </Text>
            </TouchableOpacity>

            {/* Selector de Ubicación del Catálogo (Nave/Sección/Número) */}
            <TouchableOpacity 
              style={styles.dropdownBtn}
              onPress={() => setShowUbicacionSelectModal(true)}
              disabled={catalogLoading}
            >
              {catalogLoading ? (
                <ActivityIndicator color="#aaa" size="small" />
              ) : (
                <Text style={styles.dropdownBtnText}>
                  {selectedUbicacion 
                    ? `📍 Nave ${selectedUbicacion.nave} • Sección ${selectedUbicacion.seccion} • Número ${selectedUbicacion.numero}`
                    : 'Seleccionar Ubicación (Catálogo)...'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.confirmAssignBtn, assignLoading && { opacity: 0.7 }]}
              onPress={handleAssignUbicacion}
              disabled={assignLoading}
            >
              {assignLoading ? (
                <ActivityIndicator color="#121212" size="small" />
              ) : (
                <Text style={styles.confirmAssignBtnText}>CONFIRMAR ASIGNACIÓN</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>UBICACIONES ACTIVAS ({activeAssignments.length})</Text>
          <FlatList
            data={activeAssignments}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listPadding}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.grayText}>No hay asignaciones de conteo pendientes.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.assignmentItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignmentTitle}>Nave {item.nave} • Sección {item.seccion} • Número {item.numero}</Text>
                  <Text style={styles.assignmentSub}>Operador: {getOperatorNameByUuid(item.operador_id)}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>PENDIENTE</Text>
                </View>
              </View>
            )}
          />

          {/* Modal de Selección de Operador */}
          <Modal
            visible={showOperatorSelectModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowOperatorSelectModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>SELECCIONAR OPERADOR</Text>
                <FlatList
                  data={usuarios.filter(u => u.estado === 'activo')}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 300, marginBottom: 15 }}
                  ListEmptyComponent={
                    <Text style={[styles.grayText, { textAlign: 'center', marginVertical: 20 }]}>
                      No hay operadores activos.
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.pickerItem}
                      onPress={() => {
                        setSelectedOperador(item);
                        setShowOperatorSelectModal(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>
                        {item.primer_nombre} {item.primer_apellido} (#{item.codigo_empleado})
                      </Text>
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => setShowOperatorSelectModal(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal de Selección de Ubicación */}
          <Modal
            visible={showUbicacionSelectModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowUbicacionSelectModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>SELECCIONAR UBICACIÓN</Text>
                <FlatList
                  data={catUbicaciones}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 300, marginBottom: 15 }}
                  ListEmptyComponent={
                    <Text style={[styles.grayText, { textAlign: 'center', marginVertical: 20 }]}>
                      Cargando catálogo desde la nube...
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.pickerItem}
                      onPress={() => {
                        setSelectedUbicacion(item);
                        setShowUbicacionSelectModal(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>
                        Nave {item.nave} • Sección {item.seccion} • Número {item.numero}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => setShowUbicacionSelectModal(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      )}

      {activeTab === 'personal' && (
        <View style={styles.tabContainerFull}>
          <View style={styles.personalHeader}>
            <Text style={styles.sectionTitle}>EQUIPO DE TRABAJO ({usuarios.length})</Text>
            <TouchableOpacity 
              style={styles.addUserBtn}
              onPress={() => setShowAddUserModal(true)}
            >
              <UserPlus color="#121212" size={16} />
              <Text style={styles.addUserBtnText}>Agregar</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={usuarios}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listPadding}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.userItem}
                activeOpacity={0.7}
                onPress={() => handleOpenEditModal(item)}
              >
                <View style={styles.userMeta}>
                  <Text style={styles.userItemName}>
                    {item.primer_nombre} {item.segundo_nombre || ''} {item.primer_apellido} {item.segundo_apellido || ''}
                  </Text>
                  <Text style={styles.userItemInfo}>
                    Código: #{item.codigo_empleado} • PIN: {item.pin} • Rol: {item.rol.toUpperCase()}
                  </Text>
                  {/* Indicador visual táctil */}
                  <Text style={{ color: '#ff4444', fontSize: 10, fontWeight: '800', marginTop: 5, letterSpacing: 0.5 }}>
                    👉 Pulsar para Editar
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity 
                    style={[
                      styles.statusBtn,
                      item.estado === 'activo' ? styles.statusBtnActive : styles.statusBtnSuspended
                    ]}
                    onPress={() => handleToggleUserStatus(item)}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    {item.estado === 'activo' ? (
                      <>
                        <UserCheck color="#00ffcc" size={16} />
                        <Text style={styles.statusBtnActiveText}>Activo</Text>
                      </>
                    ) : (
                      <>
                        <UserX color="#ff4444" size={16} />
                        <Text style={styles.statusBtnSuspendedText}>Suspendido</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Botón de Eliminación Exclusivo Admin */}
                  <TouchableOpacity 
                    style={styles.deleteUserBtn}
                    onPress={() => handleDeleteUser(item)}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Trash2 color="#ff4444" size={18} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {activeTab === 'recuperacion' && (
        <View style={styles.tabContainerFull}>
          <Text style={styles.sectionTitle}>SOLICITUDES DE RESEO DE PIN ({solicitudes.length})</Text>
          <FlatList
            data={solicitudes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listPadding}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>🎉</Text>
                <Text style={styles.grayText}>No hay solicitudes de recuperación pendientes.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.requestItem}>
                <View style={styles.requestMeta}>
                  <Text style={styles.requestItemTitle}>Reseteo PIN solicitado</Text>
                  <Text style={styles.requestItemSub}>
                    Empleado: #{item.codigo_empleado} {getOperatorName(item.codigo_empleado) ? `(${getOperatorName(item.codigo_empleado)})` : ''}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.approveBtn}
                  onPress={() => handleApproveRecovery(item)}
                  disabled={loading}
                >
                  <Check color="#121212" size={18} />
                  <Text style={styles.approveBtnText}>Aprobar</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      {/* Modal Agregar Usuario */}
      <Modal
        visible={showAddUserModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!loading) setShowAddUserModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>NUEVO OPERADOR</Text>
              
              <TextInput
                style={styles.modalInput}
                placeholder="Primer Nombre (Obligatorio)"
                placeholderTextColor="#666"
                value={newFirstName}
                onChangeText={setNewFirstName}
                editable={!loading}
              />

              <TextInput
                style={[styles.modalInput, secondaryFieldsOptional && { borderColor: '#444', backgroundColor: '#1A1A1A' }]}
                placeholder={secondaryFieldsOptional ? "Segundo Nombre (Opcional)" : "Segundo Nombre (Obligatorio)"}
                placeholderTextColor="#666"
                value={newSecondName}
                onChangeText={setNewSecondName}
                editable={!loading}
              />

              <TextInput
                style={styles.modalInput}
                placeholder="Primer Apellido (Obligatorio)"
                placeholderTextColor="#666"
                value={newLastName}
                onChangeText={setNewLastName}
                editable={!loading}
              />

              <TextInput
                style={[styles.modalInput, secondaryFieldsOptional && { borderColor: '#444', backgroundColor: '#1A1A1A' }]}
                placeholder={secondaryFieldsOptional ? "Segundo Apellido (Opcional)" : "Segundo Apellido (Obligatorio)"}
                placeholderTextColor="#666"
                value={newSecondLastName}
                onChangeText={setNewSecondLastName}
                editable={!loading}
              />

              <TextInput
                style={styles.modalInput}
                placeholder="Código de Empleado"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={newCodigo}
                onChangeText={setNewCodigo}
                editable={!loading}
              />

              <TextInput
                style={styles.modalInput}
                placeholder="PIN de Seguridad (4 dígitos)"
                placeholderTextColor="#666"
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                value={newPin}
                onChangeText={setNewPin}
                editable={!loading}
              />

              {/* Switch de campos secundarios opcionales */}
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Hacer campos secundarios opcionales</Text>
                <Switch
                  value={secondaryFieldsOptional}
                  onValueChange={setSecondaryFieldsOptional}
                  disabled={loading}
                  trackColor={{ false: '#333', true: '#ff4444' }}
                  thumbColor={secondaryFieldsOptional ? '#121212' : '#f4f3f4'}
                />
              </View>

              {/* Selector de Rol */}
              <Text style={styles.roleLabel}>ROL ASIGNADO:</Text>
              <View style={styles.rolesRow}>
                {['auxiliar', 'supervisor', 'admin'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleSelectBtn, newRol === r && styles.roleSelectBtnActive]}
                    onPress={() => setNewRol(r as any)}
                    disabled={loading}
                  >
                    <Text style={[styles.roleSelectText, newRol === r && styles.roleSelectTextActive]}>
                      {r.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => {
                    setShowAddUserModal(false);
                    setSecondaryFieldsOptional(false);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalBtnSend]}
                  onPress={handleCreateUser}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator size="small" color="#121212" /> : <Text style={styles.modalBtnSendText}>Registrar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>



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
              value={myNewPin}
              onChangeText={setMyNewPin}
              editable={!pinLoading}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Confirmar PIN"
              placeholderTextColor="#666"
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              value={myConfirmPin}
              onChangeText={setMyConfirmPin}
              editable={!pinLoading}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setMyNewPin('');
                  setMyConfirmPin('');
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

      {/* Modal Editar Usuario (Premium) */}
      {showEditUserModal && editingUser && (
        <Modal
          visible={showEditUserModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            if (!loading) {
              setShowEditUserModal(false);
              setEditingUser(null);
            }
          }}
        >
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>EDITAR OPERADOR</Text>
                
                <TextInput
                  style={styles.modalInput}
                  placeholder="Primer Nombre (Obligatorio)"
                  placeholderTextColor="#666"
                  value={editFirstName}
                  onChangeText={setEditFirstName}
                  editable={!loading}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Segundo Nombre (Opcional)"
                  placeholderTextColor="#666"
                  value={editSecondName}
                  onChangeText={setEditSecondName}
                  editable={!loading}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Primer Apellido (Obligatorio)"
                  placeholderTextColor="#666"
                  value={editLastName}
                  onChangeText={setEditLastName}
                  editable={!loading}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Segundo Apellido (Opcional)"
                  placeholderTextColor="#666"
                  value={editSecondLastName}
                  onChangeText={setEditSecondLastName}
                  editable={!loading}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Código de Empleado"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={editCodigo}
                  onChangeText={setEditCodigo}
                  editable={!loading}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="PIN de Seguridad (4 dígitos)"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                  value={editPin}
                  onChangeText={setEditPin}
                  editable={!loading}
                />

                {/* Selector de Rol */}
                <Text style={styles.roleLabel}>ROL ASIGNADO:</Text>
                <View style={styles.rolesRow}>
                  {['auxiliar', 'supervisor', 'admin'].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleSelectBtn, editRol === r && styles.roleSelectBtnActive]}
                      onPress={() => setEditRol(r as any)}
                      disabled={loading}
                    >
                      <Text style={[styles.roleSelectText, editRol === r && styles.roleSelectTextActive]}>
                        {r.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => {
                      setShowEditUserModal(false);
                      setEditingUser(null);
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalBtn, styles.modalBtnSend]}
                    onPress={handleUpdateUser}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator size="small" color="#121212" /> : <Text style={styles.modalBtnSendText}>Guardar</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
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
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: '#ff4444',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  userRole: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  keyBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  tabButtonActive: {
    backgroundColor: '#ff4444',
  },
  tabText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#121212',
  },
  badgeCount: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    top: -2,
    right: 3,
  },
  badgeCountText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  tabContent: {
    gap: 15,
    paddingBottom: 20,
  },
  tabContainerFull: {
    flex: 1,
  },
  sectionTitle: {
    color: '#ff4444',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  primaryConteoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0052cc',
    borderRadius: 12,
    padding: 18,
    gap: 15,
    marginBottom: 5,
  },
  primaryConteoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  primaryConteoSubText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  stateContainer: {
    gap: 12,
  },
  statusBadge: {
    backgroundColor: 'rgba(0, 255, 204, 0.08)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 204, 0.2)',
  },
  statusBadgeEmpty: {
    backgroundColor: 'rgba(230, 168, 34, 0.08)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(230, 168, 34, 0.2)',
  },
  statusBadgeText: {
    color: '#00ffcc',
    fontWeight: 'bold',
    letterSpacing: 1,
    fontSize: 12,
  },
  statusBadgeTextEmpty: {
    color: '#e6a822',
    fontWeight: 'bold',
    letterSpacing: 1,
    fontSize: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  actionCardTextContainer: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  actionCardSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 3,
  },
  dangerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#ff4444',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  dangerCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ff4444',
  },
  dangerCardSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 3,
  },
  personalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  addUserBtnText: {
    color: '#121212',
    fontWeight: '700',
    fontSize: 12,
  },
  listPadding: {
    gap: 12,
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  userMeta: {
    flex: 1,
    marginRight: 10,
  },
  userItemName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  userItemInfo: {
    color: '#888',
    fontSize: 11,
    marginTop: 3,
  },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBtnActive: {
    borderColor: 'rgba(0, 255, 204, 0.3)',
    backgroundColor: 'rgba(0, 255, 204, 0.05)',
  },
  statusBtnActiveText: {
    color: '#00ffcc',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBtnSuspended: {
    borderColor: 'rgba(255, 68, 68, 0.3)',
    backgroundColor: 'rgba(255, 68, 68, 0.05)',
  },
  statusBtnSuspendedText: {
    color: '#ff4444',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteUserBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  requestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  requestMeta: {
    flex: 1,
    marginRight: 10,
  },
  requestItemTitle: {
    color: '#ff4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  requestItemSub: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00ffcc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  approveBtnText: {
    color: '#121212',
    fontWeight: '900',
    fontSize: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
  },
  grayText: {
    color: '#888',
    fontSize: 13,
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
    maxWidth: 320,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    backgroundColor: '#262626',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  switchLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  roleLabel: {
    color: '#ff4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 5,
    marginBottom: 8,
  },
  rolesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  roleSelectBtn: {
    flex: 1,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3D3D3D',
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleSelectBtnActive: {
    borderColor: '#ff4444',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  roleSelectText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
  },
  roleSelectTextActive: {
    color: '#ff4444',
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
    backgroundColor: '#ff4444',
  },
  modalBtnSendText: {
    color: '#121212',
    fontWeight: '900',
  },

  // Asignar Layout Styles
  assignForm: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 15,
    gap: 12,
    marginBottom: 10,
  },
  dropdownBtn: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3D3D3D',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  dropdownBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmAssignBtn: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmAssignBtnText: {
    color: '#121212',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  assignmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  assignmentTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  assignmentSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 3,
  },
  pendingBadge: {
    backgroundColor: 'rgba(255, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingBadgeText: {
    color: '#ff4444',
    fontSize: 9,
    fontWeight: 'bold',
  },
  pickerItem: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3D3D3D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pickerItemText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
