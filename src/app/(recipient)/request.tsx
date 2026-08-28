import { Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';

// Recipient · joins the FIFO queue by creating a waiting ticket (status: waiting).
export default function RecipientRequest() {
  return (
    <>
      <Stack.Screen options={{ title: 'Join the queue' }} />
      <PlaceholderScreen
        title="Join the queue"
        step="Recipient · create a waiting ticket (status: waiting)"
      />
    </>
  );
}
