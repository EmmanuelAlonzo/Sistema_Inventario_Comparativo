import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

export interface UserProfile {
  id: string;
  nombre: string;
  codigo_empleado: string;
  rol: 'admin' | 'supervisor' | 'auxiliar';
  estado: 'activo' | 'suspendido';
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  mustChangePin: boolean;
  login: (codigoEmpleado: string, pin: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  updatePin: (newPin: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePin, setMustChangePin] = useState(false);

  // Cargar usuario persistido al iniciar con try/catch estricto y fallback offline
  useEffect(() => {
    let active = true;

    async function loadPersistedUser() {
      try {
        const storedUser = await AsyncStorage.getItem('@auth_user');
        if (storedUser && active) {
          const parsedUser = JSON.parse(storedUser);
          
          try {
            // Verificar PIN y estado actual en tiempo real en la nube
            const { data, error } = await supabase
              .from('usuarios_bodega')
              .select('pin, estado')
              .eq('id', parsedUser.id);

            if (error) {
              console.warn('Error devuelto por la consulta de Supabase al arranque:', error);
            } else if (data && data.length > 0) {
              const currentProfile = data[0];
              if (currentProfile.estado === 'suspendido') {
                await AsyncStorage.removeItem('@auth_user');
                if (active) setUser(null);
                return;
              }
              if (currentProfile.pin === '0000') {
                if (active) setMustChangePin(true);
              }
            }
          } catch (supabaseError) {
            console.error('Error de red/conexión al validar sesión en Supabase:', supabaseError);
            // Fallback offline: si falla la consulta a la nube, dejamos que use su sesión persistida
          }
          
          if (active) setUser(parsedUser);
        }
      } catch (e) {
        console.error('Error crítico al recuperar la sesión persistida:', e);
      } finally {
        if (active) setLoading(false);
      }
    }

    try {
      loadPersistedUser();
    } catch (syncError) {
      console.error('Error síncrono crítico al iniciar loadPersistedUser:', syncError);
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, []);

  const login = async (codigoEmpleado: string, pin: string): Promise<UserProfile> => {
    const cleanCodigo = codigoEmpleado.trim();
    const cleanPin = pin.trim();
    console.log("CODIGO ENVIADO: [" + cleanCodigo + "]", "LONGITUD:", cleanCodigo.length);
    console.log("PIN ENVIADO: [" + cleanPin + "]", "LONGITUD:", cleanPin.length);
    
    try {
      const { data, error } = await supabase
        .from('usuarios_bodega')
        .select('*')
        .eq('codigo_empleado', cleanCodigo)
        .eq('pin', cleanPin);

      console.log("LOG FINAL - Data de Supabase:", data);
      console.log("LOG FINAL - Error de Supabase:", error);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        console.log("DEBUG: No se encontró ningún usuario con Código:", cleanCodigo, "y PIN:", cleanPin);
        throw new Error('Credenciales incorrectas');
      }

      const usuarioEncontrado = data[0];

      const userProfile: UserProfile = {
        id: usuarioEncontrado.id,
        nombre: `${usuarioEncontrado.primer_nombre} ${usuarioEncontrado.primer_apellido}`,
        codigo_empleado: usuarioEncontrado.codigo_empleado,
        rol: usuarioEncontrado.rol,
        estado: usuarioEncontrado.estado,
      };

      if (userProfile.estado === 'suspendido') {
        throw new Error('Usuario suspendido. Contacte al supervisor');
      }

      if (usuarioEncontrado.pin === '0000') {
        setMustChangePin(true);
      } else {
        setMustChangePin(false);
      }

      await AsyncStorage.setItem('@auth_user', JSON.stringify(userProfile));
      setUser(userProfile);
      return userProfile;
    } catch (e: any) {
      throw e;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('@auth_user');
      setUser(null);
      setMustChangePin(false);
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
    }
  };

  const updatePin = async (newPin: string) => {
    if (!user) {
      throw new Error('No hay sesión de usuario activa');
    }
    const cleanPin = newPin.trim();
    if (cleanPin === '0000') {
      throw new Error('El nuevo PIN no puede ser "0000"');
    }
    if (cleanPin.length !== 4 || isNaN(Number(cleanPin))) {
      throw new Error('El PIN debe ser de exactamente 4 números');
    }

    try {
      const { error } = await supabase
        .from('usuarios_bodega')
        .update({ pin: cleanPin })
        .eq('id', user.id);

      if (error) throw error;
      setMustChangePin(false);
    } catch (e: any) {
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, mustChangePin, login, logout, updatePin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};
