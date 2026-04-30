import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import notifee from '@notifee/react-native';

import {RootNavigator} from './src/navigation/RootNavigator';
import {AuthProvider} from './src/contexts/AuthContext';
import {AppProvider} from './src/contexts/AppContext';
import {ErrorBoundary} from './src/components/ErrorBoundary';
import {OfflineBanner} from './src/components/OfflineBanner';
import {
  initializeOfflineSync,
  subscribeToSyncCompletion as subscribeToOutboxDrain,
} from './src/lib/api';
import {startNetworkStatusMonitoring} from './src/lib/network';
import {
  initializeSync as initializeServerSync,
  subscribeToSyncCompletion as subscribeToServerSync,
} from './src/lib/sync';

const reactQueryClient = new QueryClient({
  defaultOptions: {
    queries: {retry: 1, staleTime: 30_000},
  },
});

// When the offline write queue finishes draining, refetch every active
// query so the UI reflects the now-persisted state.
subscribeToOutboxDrain(() => {
  reactQueryClient.invalidateQueries();
});

// The server-sync engine populates the local SQLite mirror in the
// background. Whenever it pulls down fresh rows we also want every
// active server-backed query to re-run so the screens that still read
// from the network see the latest data.
subscribeToServerSync(() => {
  reactQueryClient.invalidateQueries();
});

// Notifee requires a background event handler registered at the root of
// the app module — before any React component renders. This handles
// notification interactions when the app is in the background or
// terminated.
notifee.onBackgroundEvent(async () => {
  // No-op for now — add navigation or analytics hooks here if needed.
});

export default function App() {
  const [hasFinishedInitialPaint, setHasFinishedInitialPaint] = useState(false);

  useEffect(() => {
    initializeOfflineSync();
    startNetworkStatusMonitoring();
    initializeServerSync();
    const initialPaintTimer = setTimeout(() => setHasFinishedInitialPaint(true), 0);
    return () => clearTimeout(initialPaintTimer);
  }, []);

  if (!hasFinishedInitialPaint) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashText}>TraX</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={reactQueryClient}>
          <GestureHandlerRootView style={styles.flex}>
            <KeyboardProvider>
              <AuthProvider>
                <AppProvider>
                  {/*
                    OfflineBanner sits ABOVE the navigator so it survives
                    screen transitions. It self-hides when the device is
                    online and the outbox is empty — no layout cost.
                  */}
                  <OfflineBanner />
                  <NavigationContainer>
                    <RootNavigator />
                  </NavigationContainer>
                </AppProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A56DB',
  },
  splashText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: -1,
  },
});
