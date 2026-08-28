import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  DetailRow,
  FormField,
  LoopTimeline,
  PrimaryButton,
  ScreenContainer,
  SectionCard,
  StatusBadge,
} from '@/components/role-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Booking, BookingStatus, Edibility, Proof } from '@/features/bookings/types';
import { useTheme } from '@/hooks/use-theme';

type JobStep = 'available' | 'inspection' | 'passed' | 'failed' | 'delivery' | 'proof' | 'complete';

const demoJob: Booking = {
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
};

const jobSteps = ['Accept', 'Check edibility', 'Recipient + ride ready', 'Deliver', 'Upload proof'] as const;

function bookingStatusForStep(step: JobStep): BookingStatus {
  if (step === 'available') return 'deposit_held';
  if (step === 'inspection') return 'agent_assigned';
  if (step === 'passed') return 'verified';
  if (step === 'failed') return 'rejected';
  if (step === 'delivery' || step === 'proof') return 'escrow_held';
  return 'completed';
}

function timelineIndex(step: JobStep) {
  if (step === 'available') return -1;
  if (step === 'inspection') return 0;
  if (step === 'passed') return 1;
  if (step === 'delivery') return 2;
  if (step === 'proof') return 3;
  return 4;
}

// Agent · the job through its whole arc: verify edibility in person → deliver →
// upload proof of receipt. FIFO match + payout release happen server-side, not here.
export default function AgentJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [step, setStep] = useState<JobStep>('available');
  const [inspectionNote, setInspectionNote] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofAdded, setProofAdded] = useState(false);
  const job = { ...demoJob, id: id ?? demoJob.id };
  const status = bookingStatusForStep(step);

  const recordResult = (verified: Edibility['verified']) => {
    setStep(verified ? 'passed' : 'failed');
  };

  const submitProof = () => {
    const localProof: Proof = {
      photoUrl: 'local-preview://proof-of-receipt',
      uploadedAt: Date.now(),
      note: proofNote || undefined,
    };
    if (localProof.photoUrl) setStep('complete');
  };

  return (
    <>
      <Stack.Screen options={{ title: `Job ${id}` }} />
      <ScreenContainer>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <ThemedText type="subtitle">{job.food.description}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{job.id}</ThemedText>
          </View>
          <StatusBadge status={status} />
        </View>

        {step !== 'failed' ? (
          <SectionCard>
            <ThemedText type="smallBold">Job progress</ThemedText>
            <LoopTimeline steps={jobSteps} currentIndex={timelineIndex(step)} />
          </SectionCard>
        ) : null}

        <SectionCard>
          <ThemedText type="smallBold">Pickup details</ThemedText>
          <DetailRow label="Quantity" value={job.food.quantity} />
          <DetailRow label="Address" value={job.food.pickupAddress} />
          <DetailRow label="Window" value="Today · 7:00–8:00 PM" />
          <DetailRow label="Prepared" value="Today · 6:00 PM" />
        </SectionCard>

        {step === 'available' ? (
          <SectionCard>
            <ThemedText type="smallBold">Ready to take this pickup?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Accepting assigns the job to you. Check the food only after you arrive in person.
            </ThemedText>
            <PrimaryButton label="Accept pickup" onPress={() => setStep('inspection')} />
          </SectionCard>
        ) : null}

        {step === 'inspection' ? (
          <SectionCard>
            <ThemedText type="smallBold">Edibility check</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Inspect packaging, storage, temperature, smell, and visible freshness before choosing a result.
            </ThemedText>
            <FormField
              label="Inspection note"
              placeholder="What did you observe?"
              value={inspectionNote}
              onChangeText={setInspectionNote}
              multiline
            />
            <View style={styles.actionRow}>
              <View style={styles.action}><PrimaryButton label="PASS" onPress={() => recordResult(true)} /></View>
              <View style={styles.action}><PrimaryButton label="FAIL" variant="secondary" onPress={() => recordResult(false)} /></View>
            </View>
          </SectionCard>
        ) : null}

        {step === 'passed' ? (
          <SectionCard>
            <ThemedText type="smallBold">Food passed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              The deposit release, FIFO recipient match, and donor ride payment are server-owned. Wait until the job is marked ready for delivery.
            </ThemedText>
            {inspectionNote ? <DetailRow label="Your note" value={inspectionNote} /> : null}
            <PrimaryButton label="Preview ride-funded state" variant="secondary" onPress={() => setStep('delivery')} />
            <ThemedText type="small" themeColor="textSecondary">Local UI preview only.</ThemedText>
          </SectionCard>
        ) : null}

        {step === 'failed' ? (
          <SectionCard>
            <StatusBadge status="rejected" />
            <ThemedText type="smallBold">Trip ended after failed inspection</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              No recipient is matched and no ride begins. Failed-trip compensation and any donor remainder are handled by the server.
            </ThemedText>
            {inspectionNote ? <DetailRow label="Your note" value={inspectionNote} /> : null}
            <DetailRow label="Next action" value="None — terminal" />
          </SectionCard>
        ) : null}

        {step === 'delivery' ? (
          <SectionCard>
            <ThemedText type="smallBold">Ready for delivery</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Recipient matching and the sandbox ride escrow are shown as ready. Confirm only after handing over the food.
            </ThemedText>
            <DetailRow label="Ride fee" value={`$${job.fee.toFixed(2)} held`} />
            <PrimaryButton label="Food delivered" onPress={() => setStep('proof')} />
          </SectionCard>
        ) : null}

        {step === 'proof' ? (
          <SectionCard>
            <ThemedText type="smallBold">Proof of receipt</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Add a clear handoff photo, then submit it with an optional note.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProofAdded(true)}
              style={[
                styles.proofBox,
                { borderColor: theme.textSecondary, backgroundColor: theme.background },
              ]}>
              <ThemedText type="smallBold">{proofAdded ? 'Proof photo added' : '+ Add proof photo'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Local placeholder—no device or Storage access.</ThemedText>
            </Pressable>
            <FormField label="Handoff note (optional)" placeholder="Received by…" value={proofNote} onChangeText={setProofNote} multiline />
            <PrimaryButton label="Submit proof" disabled={!proofAdded} onPress={submitProof} />
          </SectionCard>
        ) : null}

        {step === 'complete' ? (
          <SectionCard>
            <StatusBadge status="completed" />
            <ThemedText type="smallBold">Proof submitted</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This local preview is complete. Payout release remains a server-owned action.
            </ThemedText>
            {proofNote ? <DetailRow label="Handoff note" value={proofNote} /> : null}
          </SectionCard>
        ) : null}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  titleCopy: { flex: 1, gap: Spacing.one },
  actionRow: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1 },
  proofBox: { minHeight: 112, borderWidth: 1, borderStyle: 'dashed', borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, padding: Spacing.three },
});
