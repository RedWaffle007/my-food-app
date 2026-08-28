import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField, PrimaryButton, ScreenContainer, SectionCard } from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Food } from '@/features/bookings/types';
import {
  DEPOSIT_DISCLOSURE,
  DEPOSIT_DISCLOSURE_GENERIC,
  type DepositMethod,
} from '@/features/deposit/disclosure';
import { useTheme } from '@/hooks/use-theme';

type BookingForm = Pick<Food, 'description' | 'quantity' | 'pickupAddress'> & {
  preparedAt: string;
  pickupStart: string;
  pickupEnd: string;
};

const emptyForm: BookingForm = {
  description: '',
  quantity: '',
  preparedAt: '',
  pickupAddress: '',
  pickupStart: '',
  pickupEnd: '',
};

// Donor · loop step 1 — books a pickup and pays the refundable deposit (deposit_held).
export default function NewBooking() {
  const theme = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [method, setMethod] = useState<DepositMethod>('upi');
  const [submitted, setSubmitted] = useState(false);
  const update = (field: keyof BookingForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const isComplete = Object.values(form).every((value) => value.trim().length > 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Book a pickup' }} />
      <ScreenContainer>
        <View style={styles.heading}>
          <ThemedText type="subtitle">Tell us about the food</ThemedText>
          <ThemedText themeColor="textSecondary">An agent will verify it in person before delivery.</ThemedText>
        </View>
        <SectionCard>
          <ThemedText type="smallBold">Food details</ThemedText>
          <FormField label="Description" placeholder="Vegetable curry and rice" value={form.description} onChangeText={update('description')} multiline />
          <FormField label="Quantity" placeholder="12 meal boxes" value={form.quantity} onChangeText={update('quantity')} />
          <FormField label="Prepared at" placeholder="Today, 5:30 PM" value={form.preparedAt} onChangeText={update('preparedAt')} helper="Use a date and time the agent can verify." />
        </SectionCard>
        <SectionCard>
          <ThemedText type="smallBold">Pickup</ThemedText>
          <FormField label="Address" placeholder="Street address and pickup notes" value={form.pickupAddress} onChangeText={update('pickupAddress')} multiline />
          <View style={styles.windowRow}>
            <View style={styles.windowField}><FormField label="Window starts" placeholder="6:30 PM" value={form.pickupStart} onChangeText={update('pickupStart')} /></View>
            <View style={styles.windowField}><FormField label="Window ends" placeholder="7:30 PM" value={form.pickupEnd} onChangeText={update('pickupEnd')} /></View>
          </View>
        </SectionCard>
        <SectionCard>
          <ThemedText type="smallBold">Refundable deposit</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{DEPOSIT_DISCLOSURE_GENERIC}</ThemedText>
          <View style={styles.methodRow}>
            {(['upi', 'card'] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: method === option }}
                onPress={() => setMethod(option)}
                style={[
                  styles.method,
                  { borderColor: theme.backgroundSelected, backgroundColor: method === option ? theme.backgroundSelected : theme.background },
                ]}>
                <ThemedText type="smallBold">{option === 'upi' ? 'UPI' : 'Card'}</ThemedText>
              </Pressable>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">{DEPOSIT_DISCLOSURE[method]}</ThemedText>
          <ThemedText type="smallBold">The ride fee is separate and is requested only after a recipient is matched.</ThemedText>
        </SectionCard>
        {submitted ? (
          <SectionCard>
            <ThemedText type="smallBold">Pickup ready for deposit</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">This is a local UI preview. No booking or payment was created.</ThemedText>
          </SectionCard>
        ) : null}
        <PrimaryButton label="Continue to deposit" disabled={!isComplete} onPress={() => setSubmitted(true)} />
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.one },
  windowRow: { flexDirection: 'row', gap: Spacing.two },
  windowField: { flex: 1 },
  methodRow: { flexDirection: 'row', gap: Spacing.two },
  method: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, alignItems: 'center' },
});
