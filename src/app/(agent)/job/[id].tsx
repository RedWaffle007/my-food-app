import { Stack, useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';

// Agent · the job through its whole arc: verify edibility in person → deliver →
// upload proof of receipt. FIFO match + payout release happen server-side, not here.
export default function AgentJob() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: `Job ${id}` }} />
      <PlaceholderScreen
        title={`Job ${id}`}
        step="Agent · verify edibility → deliver → upload proof (verified → delivered)"
      />
    </>
  );
}
