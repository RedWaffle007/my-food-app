import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  title: string;
  /** One line describing which role owns this screen and which loop step it maps to. */
  step?: string;
  children?: ReactNode;
};

/** Shared shell for the scaffold's placeholder screens. No data, no backend. */
export function PlaceholderScreen({ title, step, children }: Props) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {step ? (
          <ThemedText type="small" themeColor="textSecondary">
            {step}
          </ThemedText>
        ) : null}
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
