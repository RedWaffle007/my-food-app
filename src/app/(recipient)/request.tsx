import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DetailRow, PrimaryButton, ScreenContainer, SectionCard, StatusBadge } from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Ticket } from '@/features/tickets/types';
import { useTheme } from '@/hooks/use-theme';

type RequestConfirmation = Pick<Ticket, 'recipientId' | 'status' | 'matchedBookingId'>;

const initialRequest: RequestConfirmation = {
  recipientId: 'recipient-demo',
  status: 'waiting',
  matchedBookingId: null,
};

// Recipient · joins the FIFO queue by creating a waiting ticket (status: waiting).
export default function RecipientRequest() {
  const theme = useTheme();
  const [confirmed, setConfirmed] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const joinQueue = () => {
    const localTicket: Ticket = {
      id: 'TKT-PREVIEW',
      recipientId: initialRequest.recipientId,
      status: initialRequest.status,
      createdAt: Date.now(),
      matchedBookingId: initialRequest.matchedBookingId,
    };
    setTicket(localTicket);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Join the queue' }} />
      <ScreenContainer>
        <View style={styles.heading}>
          <ThemedText type="subtitle">Request a food delivery</ThemedText>
          <ThemedText themeColor="textSecondary">
            One request places you in the FIFO queue for the next suitable verified donation.
          </ThemedText>
        </View>

        {ticket ? (
          <>
            <SectionCard style={styles.successCard}>
              <StatusBadge status={ticket.status} />
              <ThemedText type="smallBold">You’re in the queue</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                This is a local preview. A connected version will show the server-issued ticket and live position.
              </ThemedText>
              <DetailRow label="Preview ticket" value={ticket.id} />
            </SectionCard>
            <Link href="/queue" asChild>
              <PrimaryButton label="View queue status" />
            </Link>
          </>
        ) : (
          <>
            <SectionCard>
              <ThemedText type="smallBold">How matching works</ThemedText>
              <DetailRow label="Order" value="Oldest waiting ticket first" />
              <DetailRow label="Food" value="Verified by a delivery agent" />
              <DetailRow label="Updates" value="Shown on your queue ticket" />
              <ThemedText type="small" themeColor="textSecondary">
                Joining does not reserve a specific meal or guarantee an arrival time. Matching happens automatically when verified food is available.
              </ThemedText>
            </SectionCard>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed((current) => !current)}
              style={styles.confirmation}>
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: theme.text,
                    backgroundColor: confirmed ? theme.text : theme.background,
                  },
                ]}>
                {confirmed ? <ThemedText style={{ color: theme.background }}>✓</ThemedText> : null}
              </View>
              <ThemedText type="small" style={styles.confirmationCopy}>
                I understand this creates one waiting ticket and matching follows FIFO order.
              </ThemedText>
            </Pressable>

            <PrimaryButton label="Join the queue" disabled={!confirmed} onPress={joinQueue} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              UI preview only—no ticket is written to Firebase.
            </ThemedText>
          </>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.one },
  successCard: { alignItems: 'center', paddingVertical: Spacing.four },
  confirmation: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderRadius: Spacing.one, alignItems: 'center', justifyContent: 'center' },
  confirmationCopy: { flex: 1 },
  note: { textAlign: 'center' },
});
