import 'react-native-url-polyfill/auto';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';

import LoginScreen from './src/screens/LoginScreen';
import AuxiliarScreen from './src/screens/AuxiliarScreen';
import ScanScreen from './src/screens/ScanScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import SupervisorScreen from './src/screens/SupervisorScreen';
import AdminScreen from './src/screens/AdminScreen';
import UpdatePinScreen from './src/screens/UpdatePinScreen';

const Stack = createNativeStackNavigator();

function NavigationWrapper() {
  const { user, loading, mustChangePin } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#e6a822" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1A1A1A' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: '#121212' },
      }}
    >
      {user === null ? (
        // Flujo No Autenticado
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
      ) : mustChangePin ? (
        // Flujo Forzado de Cambio de PIN
        <Stack.Screen 
          name="UpdatePin" 
          component={UpdatePinScreen} 
          options={{ headerShown: false }} 
        />
      ) : (
        // Flujos Autenticados por Rol
        <>
          {user.rol === 'auxiliar' ? (
            <Stack.Screen 
              name="Auxiliar" 
              component={AuxiliarScreen} 
              options={{ title: 'Mis Ubicaciones' }} 
            />
          ) : user.rol === 'supervisor' ? (
            <Stack.Screen 
              name="Supervisor" 
              component={SupervisorScreen} 
              options={{ title: 'Panel de Supervisor' }} 
            />
          ) : (
            <Stack.Screen 
              name="Admin" 
              component={AdminScreen} 
              options={{ title: 'Administración de Bodega' }} 
            />
          )}

          {/* Pantallas comunes de escaneo y captura */}
          <Stack.Screen 
            name="Scan" 
            component={ScanScreen} 
            options={{ title: 'Escanear SKU' }} 
          />
          <Stack.Screen 
            name="Capture" 
            component={CaptureScreen} 
            options={{ title: 'Registrar Conteo' }} 
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <NavigationWrapper />
      </NavigationContainer>
    </AuthProvider>
  );
}
