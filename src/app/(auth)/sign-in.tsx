import { Link, Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

export default function SignIn() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <PlaceholderScreen title="Sign in" step="Auth · placeholder — no Firebase yet">
        <Link href="/sign-up">
          <ThemedText type="link">New here? Pick a role →</ThemedText>
        </Link>
      </PlaceholderScreen>
    </>
  );
}
