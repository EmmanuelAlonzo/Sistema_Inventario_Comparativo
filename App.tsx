import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { initDB } from './src/database/sqlite';

import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import CaptureScreen from './src/screens/CaptureScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    initDB();
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#121212' },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Inventario Comparativo - Inicio' }} 
        />
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
    </NavigationContainer>
  );
}
