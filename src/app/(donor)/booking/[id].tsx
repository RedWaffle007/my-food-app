import { Stack, useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';

// Donor · booking detail. When the booking is matched, the donor pays into
// escrow here (sandbox) → status: escrow_held. Payment call goes through a
// Cloud Function, never the client.
export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: `Booking ${id}` }} />
      <PlaceholderScreen
        title={`Booking ${id}`}
        step="Donor · pay into escrow (sandbox) when matched → status: escrow_held"
      />
    </>
  );
}
