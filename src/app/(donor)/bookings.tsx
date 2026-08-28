import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton, ScreenContainer, SectionCard, StatusBadge } from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Booking } from '@/features/bookings/types';

const bookings: Booking[] = [
  {
    id: 'BK-2048',
    donorId: 'donor-demo',
    agentId: 'agent-demo',
    recipientId: 'recipient-demo',
    ticketId: 'ticket-demo',
    status: 'matched',
    food: {
      description: 'Vegetable biryani and lentil curry',
      quantity: '12 meal boxes',
      preparedAt: Date.UTC(2026, 7, 28, 17, 30),
      pickupAddress: '1450 Market Street, Chicago',
      pickupWindow: { start: Date.UTC(2026, 7, 28, 19), end: Date.UTC(2026, 7, 28, 20) },
    },
    edibility: { verified: true, note: 'Packed and stored safely', checkedAt: Date.UTC(2026, 7, 28, 18, 40) },
    deposit: { state: 'released', amount: 20, donorRefund: 20 },
    fee: 8,
    payment: { amount: 8, state: 'created' },
    proof: null,
    payout: { state: 'pending', amount: 8 },
    createdAt: Date.UTC(2026, 7, 28, 16),
    updatedAt: Date.UTC(2026, 7, 28, 18, 45),
  },
  {
    id: 'BK-2041',
    donorId: 'donor-demo',
    agentId: 'agent-demo',
    recipientId: null,
    ticketId: null,
    status: 'rejected',
    food: {
      description: 'Assorted sandwiches',
      quantity: '8 portions',
      preparedAt: Date.UTC(2026, 7, 27, 16),
      pickupAddress: '82 Lake Avenue, Chicago',
      pickupWindow: { start: Date.UTC(2026, 7, 27, 18), end: Date.UTC(2026, 7, 27, 19) },
    },
    edibility: { verified: false, note: 'Temperature check failed', checkedAt: Date.UTC(2026, 7, 27, 18, 20) },
    deposit: { state: 'captured', amount: 20, agentComp: 12, donorRefund: 8 },
    fee: 8,
    payment: { amount: 8, state: 'none' },
    proof: null,
    payout: { state: 'released', amount: 12 },
    createdAt: Date.UTC(2026, 7, 27, 14),
    updatedAt: Date.UTC(2026, 7, 27, 18, 25),
  },
];

function formatWindow(start: number, end: number) {
  const date = new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const startTime = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTime = new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${startTime}–${endTime}`;
}

// Donor home — the list of the donor's own bookings and their loop status.
export default function DonorBookings() {
  return (
    <>
      <Stack.Screen options={{ title: 'My bookings' }} />
      <ScreenContainer>
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <ThemedText type="subtitle">My pickups</ThemedText>
            <ThemedText themeColor="textSecondary">Track each donation from deposit to delivery.</ThemedText>
          </View>
          <Link href="/new-booking" asChild>
            <PrimaryButton label="Book a pickup" />
          </Link>
        </View>
        {bookings.map((booking) => (
          <Link key={booking.id} href={{ pathname: '/booking/[id]', params: { id: booking.id } }} asChild>
            <Pressable accessibilityRole="link">
              <SectionCard>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{booking.id}</ThemedText>
                  <StatusBadge status={booking.status} />
                </View>
                <ThemedText>{booking.food.description}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{booking.food.quantity}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatWindow(booking.food.pickupWindow.start, booking.food.pickupWindow.end)}
                </ThemedText>
                <ThemedText type="smallBold">View booking →</ThemedText>
              </SectionCard>
            </Pressable>
          </Link>
        ))}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.three },
  headingCopy: { gap: Spacing.one },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
