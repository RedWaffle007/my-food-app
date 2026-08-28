import { Link, Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

// Donor home — the list of the donor's own bookings and their loop status.
export default function DonorBookings() {
  return (
    <>
      <Stack.Screen options={{ title: 'My bookings' }} />
      <PlaceholderScreen title="My bookings" step="Donor · your pickups and their status">
        <Link href="/new-booking">
          <ThemedText type="link">+ Book a pickup →</ThemedText>
        </Link>
        <Link href={{ pathname: '/booking/[id]', params: { id: 'demo' } }}>
          <ThemedText type="link">Open sample booking →</ThemedText>
        </Link>
      </PlaceholderScreen>
    </>
  );
}
