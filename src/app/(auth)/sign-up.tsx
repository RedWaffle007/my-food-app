import { Link, Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { DEPOSIT_DISCLOSURE_GENERIC } from '@/features/deposit/disclosure';

// Placeholder role picker. Each link jumps straight into that role's group.
// Real signup writes the role to Auth claims + the users doc in a later step.
export default function SignUp() {
  return (
    <>
      <Stack.Screen options={{ title: 'Choose role' }} />
      <PlaceholderScreen title="Choose your role" step="Auth · placeholder role picker">
        <Link href="/bookings">
          <ThemedText type="link">Continue as Donor →</ThemedText>
        </Link>
        <Link href="/pickups">
          <ThemedText type="link">Continue as Agent →</ThemedText>
        </Link>
        <Link href="/queue">
          <ThemedText type="link">Continue as Recipient →</ThemedText>
        </Link>
        {/* Required deposit disclosure — shown at signup. */}
        <ThemedText type="small" themeColor="textSecondary">
          {DEPOSIT_DISCLOSURE_GENERIC}
        </ThemedText>
      </PlaceholderScreen>
    </>
  );
}
