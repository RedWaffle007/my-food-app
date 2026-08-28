import { Link, Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

// Recipient home — the recipient's ticket and its position in the FIFO queue.
export default function RecipientQueue() {
  return (
    <>
      <Stack.Screen options={{ title: 'My queue' }} />
      <PlaceholderScreen title="My queue status" step="Recipient · your FIFO ticket position">
        <Link href="/request">
          <ThemedText type="link">Join the queue →</ThemedText>
        </Link>
      </PlaceholderScreen>
    </>
  );
}
