import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/providers/auth-provider';

// Root layout: wraps the app in the (placeholder) auth context and hosts the
// per-role route groups. Real auth/role gating is wired in a later step.
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(donor)" />
          <Stack.Screen name="(agent)" />
          <Stack.Screen name="(recipient)" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
