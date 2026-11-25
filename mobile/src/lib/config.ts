import Constants from 'expo-constants';
import { Platform } from 'react-native';

// API origin. Set EXPO_PUBLIC_API_URL at build time (or expo.extra.apiUrl in app.json).
// On web the app is served by the API itself, so same-origin requests work.
const fromEnv = process.env.EXPO_PUBLIC_API_URL;
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

export const API_URL: string = (fromEnv || fromExtra || (Platform.OS === 'web' ? '' : 'http://10.0.2.2:8080')).replace(/\/$/, '');
