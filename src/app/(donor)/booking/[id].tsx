import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DetailRow, LoopTimeline, PrimaryButton, ScreenContainer, SectionCard, StatusBadge } from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Booking } from '@/features/bookings/types';

const demoBooking: Booking = {
  id: 'BK-2048', donorId: 'donor-demo', agentId: 'agent-demo', recipientId: 'recipient-demo', ticketId: 'ticket-demo', status: 'matched',
  food: { description: 'Vegetable biryani and lentil curry', quantity: '12 meal boxes', preparedAt: Date.UTC(2026, 7, 28, 17, 30), pickupAddress: '1450 Market Street, Chicago', pickupWindow: { start: Date.UTC(2026, 7, 28, 19), end: Date.UTC(2026, 7, 28, 20) } },
  edibility: { verified: true, note: 'Packed and stored safely', checkedAt: Date.UTC(2026, 7, 28, 18, 40) },
  deposit: { state: 'released', amount: 20, donorRefund: 20 }, fee: 8,
  payment: { amount: 8, state: 'created' }, proof: null, payout: { state: 'pending', amount: 8 },
  createdAt: Date.UTC(2026, 7, 28, 16), updatedAt: Date.UTC(2026, 7, 28, 18, 45),
};

const loopSteps = ['Pickup booked', 'Deposit held', 'Agent assigned', 'Food verified', 'Recipient matched', 'Ride funded', 'Delivered'] as const;

// Donor · booking detail. When the booking is matched, the donor pays into
// escrow here (sandbox) → status: escrow_held. Payment call goes through a
// Cloud Function, never the client.
export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ridePreviewed, setRidePreviewed] = useState(false);
  const booking = { ...demoBooking, id: id ?? demoBooking.id };
  const rideState = ridePreviewed ? 'escrow_held' : booking.payment.state;

  return (
    <>
      <Stack.Screen options={{ title: `Booking ${id}` }} />
      <ScreenContainer>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <ThemedText type="subtitle">{booking.food.description}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{booking.id}</ThemedText>
            </View>
            <StatusBadge status={ridePreviewed ? 'escrow_held' : booking.status} />
          </View>
          <ThemedText themeColor="textSecondary">{booking.food.quantity}</ThemedText>
        </View>
        <SectionCard>
          <ThemedText type="smallBold">Pickup details</ThemedText>
          <DetailRow label="Address" value={booking.food.pickupAddress} />
          <DetailRow label="Window" value="Aug 28 · 7:00–8:00 PM" />
          <DetailRow label="Prepared" value="Aug 28 · 5:30 PM" />
        </SectionCard>
        <SectionCard>
          <ThemedText type="smallBold">Loop status</ThemedText>
          <LoopTimeline steps={loopSteps} currentIndex={ridePreviewed ? 5 : 4} />
        </SectionCard>
        <SectionCard>
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold">Refundable deposit</ThemedText>
            <StatusBadge status={booking.deposit.state} />
          </View>
          <DetailRow label="Deposit" value={`$${booking.deposit.amount.toFixed(2)}`} />
          <ThemedText type="small" themeColor="textSecondary">Food passed inspection, so the deposit was released. It is not applied to the ride fee.</ThemedText>
          <PrimaryButton label="Deposit paid" disabled />
        </SectionCard>
        <SectionCard>
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold">Ride fee · sandbox</ThemedText>
            <StatusBadge status={rideState} />
          </View>
          <DetailRow label="Flat ride fee" value={`$${booking.fee.toFixed(2)}`} />
          <ThemedText type="small" themeColor="textSecondary">A recipient is matched. This separate payment would be held in escrow until delivery proof is approved.</ThemedText>
          <PrimaryButton label={ridePreviewed ? 'Ride fee ready' : 'Pay ride fee'} disabled={ridePreviewed} onPress={() => setRidePreviewed(true)} />
          {ridePreviewed ? <ThemedText type="small" themeColor="textSecondary">Local preview only—no payment was created.</ThemedText> : null}
        </SectionCard>
        <SectionCard>
          <ThemedText type="smallBold">Edibility check</ThemedText>
          <DetailRow label="Result" value="PASS" />
          <DetailRow label="Agent note" value={booking.edibility?.note ?? 'No note'} />
        </SectionCard>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.one },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  titleCopy: { flex: 1, gap: Spacing.one },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
