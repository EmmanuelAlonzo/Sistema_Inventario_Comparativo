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

  // 1. Todos los hooks se declaran en la parte superior absoluta (useAuth)

  // 2. Si está cargando, retornar el loader
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#e6a822" />
      </View>
    );
  }

  // 3. Si no hay usuario logueado, retornar el flujo de Login
  if (user === null) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#121212' },
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
      </Stack.Navigator>
    );
  }

  // 4. Si debe cambiar su PIN de forma obligatoria
  if (mustChangePin) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#121212' },
        }}
      >
        <Stack.Screen 
          name="UpdatePin" 
          component={UpdatePinScreen} 
          options={{ headerShown: false }} 
        />
      </Stack.Navigator>
    );
  }

  // 5. Si hay usuario autenticado, evaluar su rol al final para retornar la pantalla correspondiente
  let screenComponent;
  let screenTitle = 'Administración de Bodega';

  if (user.rol === 'auxiliar' || user.rol === 'digitador' || user.rol === 'verificador') {
    screenComponent = AuxiliarScreen;
    screenTitle = 'Mis Ubicaciones';
  } else if (user.rol === 'supervisor') {
    screenComponent = SupervisorScreen;
    screenTitle = 'Panel de Supervisor';
  } else {
    screenComponent = AdminScreen;
    screenTitle = 'Administración de Bodega';
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
      <Stack.Screen 
        name="Main" 
        component={screenComponent} 
        options={{ title: screenTitle }} 
      />
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
