import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { DetailRow, ScreenContainer, SectionCard, StatusBadge } from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Booking } from '@/features/bookings/types';

const availablePickups: Booking[] = [
  {
    id: 'BK-2053',
    donorId: 'donor-2053',
    agentId: null,
    recipientId: null,
    ticketId: null,
    status: 'deposit_held',
    food: {
      description: 'Chickpea curry with rice',
      quantity: '10 sealed meal boxes',
      preparedAt: Date.UTC(2026, 7, 28, 18),
      pickupAddress: '310 W Polk Street, Chicago',
      pickupWindow: { start: Date.UTC(2026, 7, 28, 19), end: Date.UTC(2026, 7, 28, 20) },
    },
    edibility: null,
    deposit: { state: 'held', amount: 20 },
    fee: 8,
    payment: { amount: 8, state: 'none' },
    proof: null,
    payout: { state: 'pending', amount: 8 },
    createdAt: Date.UTC(2026, 7, 28, 17, 30),
    updatedAt: Date.UTC(2026, 7, 28, 17, 30),
  },
  {
    id: 'BK-2055',
    donorId: 'donor-2055',
    agentId: null,
    recipientId: null,
    ticketId: null,
    status: 'deposit_held',
    food: {
      description: 'Vegetable wraps and fruit cups',
      quantity: '18 portions',
      preparedAt: Date.UTC(2026, 7, 28, 18, 15),
      pickupAddress: '900 S Wabash Avenue, Chicago',
      pickupWindow: { start: Date.UTC(2026, 7, 28, 20), end: Date.UTC(2026, 7, 28, 21) },
    },
    edibility: null,
    deposit: { state: 'held', amount: 20 },
    fee: 8,
    payment: { amount: 8, state: 'none' },
    proof: null,
    payout: { state: 'pending', amount: 8 },
    createdAt: Date.UTC(2026, 7, 28, 17, 45),
    updatedAt: Date.UTC(2026, 7, 28, 17, 45),
  },
];

function formatPickupWindow(start: number, end: number) {
  const startTime = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTime = new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${startTime}–${endTime}`;
}

// Agent home — open pickups the agent can accept.
export default function AgentPickups() {
  return (
    <>
      <Stack.Screen options={{ title: 'Available pickups' }} />
      <ScreenContainer>
        <View style={styles.heading}>
          <ThemedText type="subtitle">Pickups near you</ThemedText>
          <ThemedText themeColor="textSecondary">
            Accept one pickup at a time. Verify the food in person before delivery.
          </ThemedText>
        </View>
        <SectionCard>
          <ThemedText type="smallBold">Before you accept</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The donor has already funded the refundable deposit. You will record the edibility result at pickup.
          </ThemedText>
        </SectionCard>
        {availablePickups.map((booking) => (
          <Link key={booking.id} href={{ pathname: '/job/[id]', params: { id: booking.id } }} asChild>
            <Pressable accessibilityRole="link">
              <SectionCard>
                <View style={styles.cardHeader}>
                  <ThemedText type="smallBold">{booking.id}</ThemedText>
                  <StatusBadge status={booking.status} />
                </View>
                <ThemedText>{booking.food.description}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {booking.food.quantity}
                </ThemedText>
                <DetailRow label="Pickup" value={booking.food.pickupAddress} />
                <DetailRow
                  label="Window"
                  value={formatPickupWindow(booking.food.pickupWindow.start, booking.food.pickupWindow.end)}
                />
                <DetailRow label="Flat ride fee" value={`$${booking.fee.toFixed(2)}`} />
                <ThemedText type="smallBold">Review pickup →</ThemedText>
              </SectionCard>
            </Pressable>
          </Link>
        ))}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.one },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
