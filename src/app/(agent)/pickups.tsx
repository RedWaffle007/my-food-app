import { Link, Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

// Agent home — open pickups the agent can accept.
export default function AgentPickups() {
  return (
    <>
      <Stack.Screen options={{ title: 'Available pickups' }} />
      <PlaceholderScreen
        title="Available pickups"
        step="Agent · accept a pickup → status: agent_assigned">
        <Link href={{ pathname: '/job/[id]', params: { id: 'demo' } }}>
          <ThemedText type="link">Open sample job →</ThemedText>
        </Link>
      </PlaceholderScreen>
    </>
  );
}
