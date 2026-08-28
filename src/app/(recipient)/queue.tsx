import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DetailRow, PrimaryButton, ScreenContainer, SectionCard, StatusBadge } from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Ticket } from '@/features/tickets/types';

type QueueDisplay = {
  ticket: Ticket;
  position: number;
  peopleAhead: number;
};

const queueDisplay: QueueDisplay = {
  ticket: {
    id: 'TKT-1087',
    recipientId: 'recipient-demo',
    status: 'waiting',
    createdAt: Date.UTC(2026, 7, 28, 17, 20),
    matchedBookingId: null,
  },
  position: 4,
  peopleAhead: 3,
};

function formatJoinedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Recipient home — the recipient's ticket and its position in the FIFO queue.
export default function RecipientQueue() {
  const { ticket, position, peopleAhead } = queueDisplay;

  return (
    <>
      <Stack.Screen options={{ title: 'My queue' }} />
      <ScreenContainer>
        <View style={styles.heading}>
          <ThemedText type="subtitle">Your place in line</ThemedText>
          <ThemedText themeColor="textSecondary">
            Requests are matched in FIFO order as verified food becomes available.
          </ThemedText>
        </View>

        <SectionCard style={styles.positionCard}>
          <StatusBadge status={ticket.status} />
          <ThemedText style={styles.positionNumber}>#{position}</ThemedText>
          <ThemedText type="smallBold">Current FIFO position</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {peopleAhead} {peopleAhead === 1 ? 'person is' : 'people are'} ahead of you.
          </ThemedText>
        </SectionCard>

        <SectionCard>
          <ThemedText type="smallBold">Ticket details</ThemedText>
          <DetailRow label="Ticket" value={ticket.id} />
          <DetailRow label="Status" value="Waiting for a match" />
          <DetailRow label="Joined" value={formatJoinedAt(ticket.createdAt)} />
        </SectionCard>

        <SectionCard>
          <ThemedText type="smallBold">What happens next</ThemedText>
          <View style={styles.step}>
            <ThemedText type="smallBold">1</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepCopy}>
              Food passes an in-person edibility check.
            </ThemedText>
          </View>
          <View style={styles.step}>
            <ThemedText type="smallBold">2</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepCopy}>
              The oldest waiting ticket is matched automatically.
            </ThemedText>
          </View>
          <View style={styles.step}>
            <ThemedText type="smallBold">3</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stepCopy}>
              Your ticket updates with delivery status.
            </ThemedText>
          </View>
        </SectionCard>

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Position is a local UI preview. The server owns the live FIFO order and matching.
        </ThemedText>

        {ticket.status !== 'waiting' ? (
          <Link href="/request" asChild>
            <PrimaryButton label="Join the queue" />
          </Link>
        ) : null}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.one },
  positionCard: { alignItems: 'center', paddingVertical: Spacing.four },
  positionNumber: { fontSize: 56, lineHeight: 64, fontWeight: '700' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  stepCopy: { flex: 1 },
  note: { textAlign: 'center' },
});
