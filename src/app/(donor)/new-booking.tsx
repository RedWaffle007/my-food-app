import { Stack } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import {
  DEPOSIT_DISCLOSURE,
  DEPOSIT_DISCLOSURE_GENERIC,
} from '@/features/deposit/disclosure';

// Donor · loop step 1 — books a pickup and pays the refundable deposit (deposit_held).
export default function NewBooking() {
  return (
    <>
      <Stack.Screen options={{ title: 'Book a pickup' }} />
      <PlaceholderScreen
        title="Book a pickup"
        step="Donor · pay a refundable deposit → status: deposit_held">
        {/* Required deposit disclosure — shown at booking. Method-aware copy is
            selected once the donor picks UPI vs card at payment. */}
        <ThemedText type="small" themeColor="textSecondary">
          {DEPOSIT_DISCLOSURE_GENERIC}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          UPI · {DEPOSIT_DISCLOSURE.upi}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Card · {DEPOSIT_DISCLOSURE.card}
        </ThemedText>
      </PlaceholderScreen>
    </>
  );
}
