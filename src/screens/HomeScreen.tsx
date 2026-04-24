import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Barcode, CloudDownload, CloudUpload, FileSpreadsheet, Trash2 } from 'lucide-react-native';
import { supabase } from '../services/supabase';
import * as Updates from 'expo-updates';

export default function HomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isKillSwitched, setIsKillSwitched] = useState(false);
  const [killMessage, setKillMessage] = useState('La aplicación ha sido desactivada por el administrador.');

  // Sincronizar actualización OTA
  useEffect(() => {
    async function onFetchUpdateAsync() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          Alert.alert(
            'Actualización Disponible',
            'Hay una nueva versión del sistema. ¿Deseas descargarla y reiniciar?',
            [
              { text: 'Más tarde', style: 'cancel' },
              { text: 'Actualizar', onPress: async () => {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              }}
            ]
          );
        }
      } catch (error) {
        console.log("No se pudo verificar actualizaciones (posiblemente en modo dev):", error);
      }
    }
    onFetchUpdateAsync();
  }, []);

  // Verificar estado de la base de datos al montar
  useEffect(() => {
    checkKillSwitch();
    checkDatabaseState();
    
    // Opcional: suscribirse a cambios, pero podemos checarlo al volver
    const unsubscribe = navigation.addListener('focus', () => {
      checkKillSwitch();
      checkDatabaseState();
    });
    return unsubscribe;
  }, [navigation]);

  const checkKillSwitch = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value, description')
        .eq('key', 'is_app_active')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found, which is fine
      
      if (data && data.value === 'false') {
        setIsKillSwitched(true);
        if (data.description) setKillMessage(data.description);
      } else {
        setIsKillSwitched(false);
      }
    } catch (err) {
      console.error("Error checking kill switch:", err);
    }
  };

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
              // Llamada a Edge Function (sync-master sin argumentos porque usará autodescubrimiento)
              const { data, error } = await supabase.functions.invoke('sync-master');
              
              if (error) {
                // supabase-js a veces envuelve el error real en 'context'
                console.log("Error object:", error);
                const trueError = error.context?.statusText || error.message;
                throw new Error(trueError);
              }

              if (data && data.success === false) {
                throw new Error(data.error);
              }
              
              Alert.alert('Éxito', data?.message || 'Datos importados correctamente.');
              checkDatabaseState(); // Actualizar estado
            } catch (err: any) {
              console.error("Detalle del error:", err);
              Alert.alert('Error de Edge Function', err.message || 'Error desconocido.');
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
      '¿Finalizaste el conteo? Se generará el Excel en la carpeta destino.',
      [
        { text: 'Aún no', style: 'cancel' },
        { 
          text: 'Generar', 
          onPress: async () => {
            setLoading(true);
            try {
              const { data, error } = await supabase.functions.invoke('export-results');
              
              if (error) {
                const trueError = error.context?.statusText || error.message;
                throw new Error(trueError);
              }

              if (data && data.success === false) {
                throw new Error(data.error);
              }
              
              Alert.alert('Reporte Listo', `¡Archivo generado en Drive!\n\nLink: ${data?.url || 'Revisa tu Drive'}`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Hubo un error al generar el reporte.');
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
      '⚠️ CUIDADO: Limpieza Total',
      'Esto borrará TODOS los registros de SAP y los Conteos de Supabase para iniciar un nuevo mes. ¡Asegúrate de haber generado el comparativo primero!',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'SÍ, BORRAR TODO', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // Llamar a la Edge Function que tiene permisos de administrador (SERVICE_ROLE) para saltar políticas de seguridad
              const { data, error } = await supabase.functions.invoke('clear-database');
              
              if (error) {
                const trueError = error.context?.statusText || error.message;
                throw new Error(trueError);
              }

              if (data && data.success === false) {
                throw new Error(data.error);
              }
              
              Alert.alert('Base de Datos Limpia', 'El sistema está listo para un nuevo inventario.');
              checkDatabaseState(); // Volver al estado inicial
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Hubo un problema al limpiar.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  if (isKillSwitched) {
    return (
      <View style={[styles.container, { alignItems: 'center', backgroundColor: '#000' }]}>
        <View style={{ backgroundColor: 'rgba(255,0,0,0.1)', padding: 30, borderRadius: 100, marginBottom: 30 }}>
          <Text style={{ fontSize: 80 }}>🔒</Text>
        </View>
        <Text style={[styles.title, { color: '#ff4444', textAlign: 'center' }]}>ACCESO RESTRINGIDO</Text>
        <Text style={{ color: '#888', textAlign: 'center', marginTop: 20, fontSize: 18, paddingHorizontal: 30 }}>
          {killMessage}
        </Text>
        <TouchableOpacity 
          style={[styles.secondaryButton, { marginTop: 50, borderColor: '#444' }]} 
          onPress={checkKillSwitch}
        >
          <Text style={{ color: '#fff' }}>Reintentar Conexión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (checking) {
    return (
      <View style={[styles.container, { alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00ffcc" />
        <Text style={{ color: '#fff', marginTop: 10 }}>Verificando estado del servidor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Multigroup</Text>
        <Text style={styles.subtitle}>Sistema de Inventario Comparativo</Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <Barcode color="#fff" size={32} />
          <Text style={styles.primaryButtonText}>Iniciar Captura</Text>
          <Text style={styles.buttonSubText}>Escanear SKU para conteo físico</Text>
        </TouchableOpacity>

        {hasData ? (
          <View style={styles.activeStateContainer}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>🟢 INVENTARIO EN CURSO</Text>
            </View>
            
            <View style={styles.secondaryButtonsRow}>
              <TouchableOpacity 
                style={[styles.secondaryButton, { borderColor: '#00ffcc' }, loading && { opacity: 0.5 }]}
                onPress={handleGenerateReport}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#00ffcc" size="small" /> : <FileSpreadsheet color="#00ffcc" size={28} />}
                <Text style={[styles.secondaryButtonText, { color: '#00ffcc' }]}>Generar Comparativo</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.dangerButton, loading && { opacity: 0.5 }]}
              onPress={handleClearDatabase}
              disabled={loading}
            >
              <Trash2 color="#ff4444" size={24} style={{ marginRight: 10 }} />
              <Text style={styles.dangerButtonText}>Limpiar Base de Datos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyText}>No hay datos cargados.</Text>
            <TouchableOpacity 
              style={[styles.secondaryButton, { borderColor: '#e6a822', width: '100%' }, loading && { opacity: 0.5 }]}
              onPress={handleExtractDrive}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#e6a822" size="small" /> : <CloudDownload color="#e6a822" size={28} />}
              <Text style={[styles.secondaryButtonText, { color: '#e6a822' }]}>Extraer Drive - Nube</Text>
            </TouchableOpacity>
            <Text style={styles.helpText}>Esto autodescubrirá el archivo Excel compartido con el bot y lo ingestará en Supabase.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#121212'
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 5,
  },
  menuContainer: {
    gap: 20,
  },
  primaryButton: {
    backgroundColor: '#0052cc',
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#0052cc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
  },
  buttonSubText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 5,
  },
  activeStateContainer: {
    gap: 15,
  },
  statusBadge: {
    backgroundColor: 'rgba(0, 255, 204, 0.1)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 204, 0.3)',
  },
  statusBadgeText: {
    color: '#00ffcc',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  secondaryButtonsRow: {
    flexDirection: 'row',
    gap: 15,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#00ffcc',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#00ffcc',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center'
  },
  dangerButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#ff4444',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  dangerButtonText: {
    color: '#ff4444',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyStateContainer: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    marginBottom: 20,
    fontSize: 16,
  },
  helpText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 15,
  }
});
