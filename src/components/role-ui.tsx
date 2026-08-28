import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { BookingStatus, DepositState, PaymentState } from '@/features/bookings/types';
import type { TicketStatus } from '@/features/tickets/types';
import { useTheme } from '@/hooks/use-theme';

export function ScreenContainer({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function SectionCard({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
        style,
      ]}>
      {children}
    </View>
  );
}

type StatusValue = BookingStatus | DepositState | PaymentState | TicketStatus;

const statusLabels: Record<StatusValue, string> = {
  requested: 'Deposit due',
  deposit_held: 'Deposit held',
  agent_assigned: 'Agent assigned',
  verified: 'Food passed',
  rejected: 'Food rejected',
  matched: 'Recipient matched',
  escrow_held: 'Ride funded',
  delivered: 'Delivered',
  completed: 'Complete',
  cancelled: 'Cancelled',
  none: 'Not started',
  held: 'Held',
  released: 'Released',
  captured: 'Captured',
  created: 'Payment ready',
  refunded: 'Refunded',
  waiting: 'Waiting',
  fulfilled: 'Fulfilled',
  expired: 'Expired',
};

export function StatusBadge({ status }: { status: StatusValue }) {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{statusLabels[status]}</ThemedText>
    </View>
  );
}

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary';
};

export function PrimaryButton({ label, variant = 'primary', disabled, style, ...props }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        styles.button,
        {
          backgroundColor: primary ? theme.text : theme.backgroundElement,
          borderColor: primary ? theme.text : theme.backgroundSelected,
          opacity: disabled ? 0.45 : state.pressed ? 0.72 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}>
      <ThemedText style={{ color: primary ? theme.background : theme.text }} type="smallBold">
        {label}
      </ThemedText>
    </Pressable>
  );
}

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
};

export function FormField({ label, error, helper, style, ...props }: FormFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected },
          style,
        ]}
        {...props}
      />
      {error || helper ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error ?? helper}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.detailValue}>{value}</ThemedText>
    </View>
  );
}

export function LoopTimeline({
  steps,
  currentIndex,
}: {
  steps: readonly string[];
  currentIndex: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.timeline}>
      {steps.map((step, index) => (
        <View key={step} style={styles.timelineRow}>
          <View
            style={[
              styles.timelineDot,
              {
                backgroundColor: index <= currentIndex ? theme.text : theme.background,
                borderColor: theme.textSecondary,
              },
            ]}
          />
          <ThemedText
            type={index === currentIndex ? 'smallBold' : 'small'}
            themeColor={index > currentIndex ? 'textSecondary' : undefined}>
            {step}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: Spacing.four },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  badge: { alignSelf: 'flex-start', borderRadius: Spacing.four, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  button: { minHeight: 48, borderRadius: Spacing.two, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  field: { gap: Spacing.one },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.three },
  detailValue: { flex: 1, textAlign: 'right' },
  timeline: { gap: Spacing.two },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
});
