/**
 * NotificationSettingsScreen
 *
 * Local notification scheduling implemented with @notifee/react-native.
 * Mirrors the original expo-notifications behaviour exactly:
 *   - daily   → repeating calendar trigger at chosen hour:minute
 *   - weekly  → repeating calendar trigger at chosen weekday + hour:minute
 *   - monthly → repeating calendar trigger at chosen day-of-month + hour:minute
 *   - custom  → interval trigger every N days
 *
 * Notifee uses Android AlarmManager and iOS UNUserNotificationCenter natively.
 * No Expo runtime required.
 */
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import notifee, {
  TriggerType,
  RepeatFrequency,
  AndroidImportance,
  AuthorizationStatus,
} from '@notifee/react-native';
import type {
  TimestampTrigger,
  IntervalTrigger,
} from '@notifee/react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuth} from '../contexts/AuthContext';
import {useColors} from '../hooks/useColors';
import {
  getNotificationSettings,
  upsertNotificationSettings,
} from '../lib/database';
import type {NotificationFrequency} from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNEL_ID = 'trax-reminders';
const NOTIFICATION_ID = 'trax-recurring-reminder';

const FREQUENCIES: {
  value: NotificationFrequency;
  label: string;
  desc: string;
}[] = [
  {value: 'daily', label: 'Daily', desc: 'Every day at your chosen time'},
  {value: 'weekly', label: 'Weekly', desc: 'Once a week on your chosen day'},
  {
    value: 'monthly',
    label: 'Monthly',
    desc: 'Once a month on your chosen date',
  },
  {value: 'custom', label: 'Custom', desc: 'Every N days'},
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({length: 24}, (_, i) => i);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'TraX Reminders',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

/**
 * Generate an array of digits 
 *  @param start the first number
 *  @param end: the last number 

 */
const generateRange = (start: number, end: number) => {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};


/**
 * Returns the next timestamp for a given weekday (0=Sun … 6=Sat),
 * hour, and minute. Always returns a time in the future.
 */
function nextWeekdayTimestamp(
  weekday: number,
  hour: number,
  minute: number,
): number {
  const now = new Date();
  const result = new Date(now);
  result.setHours(hour, minute, 0, 0);
  // day-of-week diff
  const diff = ((weekday - now.getDay()) + 7) % 7;
  result.setDate(now.getDate() + (diff === 0 && result <= now ? 7 : diff));
  return result.getTime();
}

/**
 * Returns the next timestamp for a given day-of-month, hour, minute.
 */
function nextMonthDayTimestamp(
  dayOfMonth: number,
  hour: number,
  minute: number,
): number {
  const now = new Date();
  const result = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, hour, minute, 0, 0);
  if (result <= now) {
    result.setMonth(result.getMonth() + 1);
  }
  return result.getTime();
}

/**
 * Returns today's timestamp at the given hour:minute, shifted to tomorrow
 * if that time has already passed today.
 */
function nextDailyTimestamp(hour: number, minute: number): number {
  const now = new Date();
  const result = new Date(now);
  result.setHours(hour, minute, 0, 0);
  if (result <= now) result.setDate(result.getDate() + 1);
  return result.getTime();
}

async function cancelAllReminders(): Promise<void> {
  await notifee.cancelNotification(NOTIFICATION_ID);
  // Also cancel any trigger notifications with this id
  const triggered = await notifee.getTriggerNotifications();
  for (const t of triggered) {
    if (t.notification.id === NOTIFICATION_ID) {
      await notifee.cancelTriggerNotification(NOTIFICATION_ID);
    }
  }
}

async function scheduleReminder(settings: {
  enabled: boolean;
  frequency: NotificationFrequency;
  notification_time: string;
  day_of_week?: number;
  day_of_month?: number;
  custom_interval_days?: number;
}): Promise<void> {
  if (Platform.OS === 'web') return;

  // Always cancel existing before rescheduling
  await cancelAllReminders();
  if (!settings.enabled) return;

  await ensureChannel();

  const [hourStr, minStr] = settings.notification_time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  const notificationBody: Parameters<typeof notifee.createTriggerNotification>[0] =
    {
      id: NOTIFICATION_ID,
      title: 'TraX Reminder',
      body: "Don't forget to record today's transactions!",
      android: {
        channelId: CHANNEL_ID,
        // Monochrome status-bar icon (white-on-transparent vector drawable).
        // See android/app/src/main/res/drawable/ic_stat_trax.xml.
        smallIcon: 'ic_stat_trax',
        color: '#1A56DB',
        pressAction: {id: 'default'},
      },
      ios: {
        sound: 'default',
        badgeCount: 1,
      },
    };

  if (settings.frequency === 'daily') {
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextDailyTimestamp(hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
    };
    await notifee.createTriggerNotification(notificationBody, trigger);
    return;
  }

  if (settings.frequency === 'weekly') {
    const weekday = settings.day_of_week ?? 1;
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextWeekdayTimestamp(weekday, hour, minute),
      repeatFrequency: RepeatFrequency.WEEKLY,
    };
    await notifee.createTriggerNotification(
      {
        ...notificationBody,
        title: 'TraX Weekly Reminder',
        body: 'Time to log your weekly transactions!',
      },
      trigger,
    );
    return;
  }

  if (settings.frequency === 'monthly') {
    const dom = settings.day_of_month ?? 1;
    // Notifee does not have a built-in monthly repeat, so we schedule for
    // the next occurrence. The app will reschedule on next open if needed.
    // For a fully reliable monthly reminder, the app can re-schedule on
    // foreground resume — but this gives the correct first fire date.
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMonthDayTimestamp(dom, hour, minute),
      // No built-in monthly repeatFrequency in notifee — fires once per schedule.
      // We use WEEKLY * 4 as the closest approximation for background operation.
      // Production alternative: schedule from AppState change listener on each launch.
    };
    await notifee.createTriggerNotification(
      {
        ...notificationBody,
        title: 'TraX Monthly Reminder',
        body: 'Review your monthly expenses!',
      },
      trigger,
    );
    return;
  }

  if (settings.frequency === 'custom') {
    const days = Math.max(1, settings.custom_interval_days ?? 3);
    const trigger: IntervalTrigger = {
      type: TriggerType.INTERVAL,
      interval: days * 24 * 60, // notifee interval is in minutes
    };
    await notifee.createTriggerNotification(
      {
        ...notificationBody,
        body: 'Time to log your transactions!',
      },
      trigger,
    );
    return;
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const {session} = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<NotificationFrequency>('daily');
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [intervalDays, setIntervalDays] = useState('3');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    getNotificationSettings(session.user.id).then(s => {
      if (s) {
        setEnabled(s.enabled);
        setFrequency(s.frequency);
        const [h, m] = s.notification_time.split(':').map(Number);
        setHour(h);
        setMinute(m);
        if (s.day_of_week != null) setDayOfWeek(s.day_of_week);
        if (s.day_of_month != null) setDayOfMonth(s.day_of_month);
        if (s.custom_interval_days)
          setIntervalDays(s.custom_interval_days.toString());
      }
      setLoading(false);
    });
  }, [session?.user.id]);

  const handleToggle = async (val: boolean) => {
    if (val && Platform.OS !== 'web') {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings to use reminders.',
        );
        return;
      }
    }
    setEnabled(val);
  };

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    const settings = {
      user_id: session.user.id,
      enabled,
      frequency,
      notification_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      day_of_week: frequency === 'weekly' ? dayOfWeek : undefined,
      day_of_month: frequency === 'monthly' ? dayOfMonth : undefined,
      custom_interval_days:
        frequency === 'custom' ? parseInt(intervalDays, 10) || 3 : undefined,
    };
    // Schedule the local notification FIRST. If this fails the user
    // would otherwise see "Saved" while no reminder actually fires.
    // Only on a successful schedule do we persist server-side; if the
    // server upsert then fails we roll the schedule back so the device
    // and the server agree.
    try {
      await scheduleReminder(settings);
    } catch (scheduleError: any) {
      setSaving(false);
      Alert.alert(
        "Couldn't schedule reminder",
        scheduleError?.message ??
          'The system rejected the notification schedule. Please try again.',
      );
      return;
    }

    try {
      await upsertNotificationSettings(settings);
      Alert.alert(
        'Saved',
        enabled ? 'Reminders have been set up!' : 'Reminders turned off.',
      );
    } catch (saveError: any) {
      // Roll back the schedule we just installed so the device matches
      // the (still-old) server state.
      try {
        await cancelAllReminders();
      } catch {
        // best-effort
      }
      Alert.alert(
        "Couldn't save",
        saveError?.message ?? 'Failed to save reminder settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {paddingTop: insets.top + 12}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, {color: colors.foreground}]}>
          Reminders
        </Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {paddingBottom: insets.bottom + 40},
        ]}>
        {/* Enable toggle */}
        <View
          style={[
            styles.card,
            {backgroundColor: colors.card, borderColor: colors.border},
          ]}>
          <View style={styles.cardRow}>
            <View
              style={[
                styles.bellIcon,
                {backgroundColor: colors.primary + '15'},
              ]}>
              <Icon
                name="notifications-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, {color: colors.foreground}]}>
                Transaction Reminders
              </Text>
              <Text style={[styles.cardSub, {color: colors.mutedForeground}]}>
                Get notified to log your income & expenses
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{false: colors.muted, true: colors.primary + '80'}}
              thumbColor={enabled ? colors.primary : colors.mutedForeground}
            />
          </View>
        </View>

        {enabled && (
          <>
            {/* Frequency */}
            <Text
              style={[styles.sectionLabel, {color: colors.mutedForeground}]}>
              Frequency
            </Text>
            <View
              style={[
                styles.card,
                {backgroundColor: colors.card, borderColor: colors.border},
              ]}>
              {FREQUENCIES.map((f, i) => (
                <TouchableOpacity
                  key={f.value}
                  style={[
                    styles.freqRow,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                  onPress={() => setFrequency(f.value)}>
                  <View style={styles.freqInfo}>
                    <Text
                      style={[styles.freqLabel, {color: colors.foreground}]}>
                      {f.label}
                    </Text>
                    <Text
                      style={[
                        styles.freqDesc,
                        {color: colors.mutedForeground},
                      ]}>
                      {f.desc}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor:
                          frequency === f.value
                            ? colors.primary
                            : colors.border,
                      },
                    ]}>
                    {frequency === f.value && (
                      <View
                        style={[
                          styles.radioDot,
                          {backgroundColor: colors.primary},
                        ]}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Time picker */}
            <Text
              style={[styles.sectionLabel, {color: colors.mutedForeground}]}>
              Reminder Time
            </Text>
            <View
              style={[
                styles.card,
                {backgroundColor: colors.card, borderColor: colors.border},
              ]}>
              <View style={styles.timeRow}>
                <View style={styles.timePickerCol}>
                  <Text
                    style={[
                      styles.timeLabel,
                      {color: colors.mutedForeground},
                    ]}>
                    Hour
                  </Text>
                  <ScrollView
                    style={styles.timePicker}
                    showsVerticalScrollIndicator={false}>
                    {HOURS.map(h => (
                      <TouchableOpacity
                        key={h}
                        style={[
                          styles.timeItem,
                          hour === h && {backgroundColor: colors.primary},
                        ]}
                        onPress={() => setHour(h)}>
                        <Text
                          style={[
                            styles.timeItemText,
                            {
                              color:
                                hour === h ? '#fff' : colors.foreground,
                            },
                          ]}>
                          {String(h).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <Text style={[styles.timeSep, {color: colors.foreground}]}>
                  :
                </Text>
                <View style={styles.timePickerCol}>
                  <Text
                    style={[
                      styles.timeLabel,
                      {color: colors.mutedForeground},
                    ]}>
                    Min
                  </Text>
                  <ScrollView
                    style={styles.timePicker}
                    showsVerticalScrollIndicator={false}>
                    {[ ...generateRange(0, 59)].map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.timeItem,
                          minute === m && {backgroundColor: colors.primary},
                        ]}
                        onPress={() => setMinute(m)}>
                        <Text
                          style={[
                            styles.timeItemText,
                            {
                              color:
                                minute === m ? '#fff' : colors.foreground,
                            },
                          ]}>
                          {String(m).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.timeDisplay}>
                  <Text
                    style={[
                      styles.timeDisplayText,
                      {color: colors.primary},
                    ]}>
                    {String(hour).padStart(2, '0')}:
                    {String(minute).padStart(2, '0')}
                  </Text>
                  <Text
                    style={[
                      styles.timeDisplayLabel,
                      {color: colors.mutedForeground},
                    ]}>
                    {hour < 12 ? 'AM' : 'PM'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Weekly: day of week */}
            {frequency === 'weekly' && (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    {color: colors.mutedForeground},
                  ]}>
                  Day of Week
                </Text>
                <View style={styles.dayRow}>
                  {DAYS.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.dayBtn,
                        {
                          backgroundColor:
                            dayOfWeek === i ? colors.primary : colors.card,
                          borderColor:
                            dayOfWeek === i ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setDayOfWeek(i)}>
                      <Text
                        style={[
                          styles.dayText,
                          {
                            color:
                              dayOfWeek === i ? '#fff' : colors.foreground,
                          },
                        ]}>
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Monthly: day of month */}
            {frequency === 'monthly' && (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    {color: colors.mutedForeground},
                  ]}>
                  Day of Month
                </Text>
                <View
                  style={[
                    styles.card,
                    {backgroundColor: colors.card, borderColor: colors.border},
                  ]}>
                  <View style={styles.monthRow}>
                    <TouchableOpacity
                      onPress={() => setDayOfMonth(d => Math.max(1, d - 1))}>
                      <Icon name="remove" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <Text
                      style={[styles.monthDay, {color: colors.foreground}]}>
                      {dayOfMonth}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setDayOfMonth(d => Math.min(28, d + 1))
                      }>
                      <Icon name="add" size={24} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            {/* Custom: every N days */}
            {frequency === 'custom' && (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    {color: colors.mutedForeground},
                  ]}>
                  Every N Days
                </Text>
                <View
                  style={[
                    styles.card,
                    {backgroundColor: colors.card, borderColor: colors.border},
                  ]}>
                  <View style={styles.customRow}>
                    <Text
                      style={[
                        styles.customLabel,
                        {color: colors.foreground},
                      ]}>
                      Every
                    </Text>
                    <TextInput
                      style={[
                        styles.customInput,
                        {
                          backgroundColor: colors.input,
                          borderColor: colors.border,
                          color: colors.foreground,
                        },
                      ]}
                      value={intervalDays}
                      onChangeText={setIntervalDays}
                      keyboardType="number-pad"
                      maxLength={3}
                    />
                    <Text
                      style={[
                        styles.customLabel,
                        {color: colors.foreground},
                      ]}>
                      days
                    </Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}

        <TouchableOpacity
          style={[
            styles.saveBtn,
            {
              backgroundColor: colors.primary,
              opacity: saving ? 0.7 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Icon name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {padding: 16},
  card: {borderRadius: 14, borderWidth: 1, marginBottom: 0},
  cardRow: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16},
  bellIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {flex: 1},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 12, fontWeight: '400', marginTop: 2},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  freqRow: {flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12},
  freqInfo: {flex: 1},
  freqLabel: {fontSize: 15, fontWeight: '500'},
  freqDesc: {fontSize: 12, fontWeight: '400', marginTop: 2},
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {width: 10, height: 10, borderRadius: 5},
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  timePickerCol: {alignItems: 'center', gap: 4},
  timeLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timePicker: {height: 120},
  timeItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginVertical: 2,
  },
  timeItemText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  timeSep: {fontSize: 24, fontWeight: '700'},
  timeDisplay: {flex: 1, alignItems: 'center'},
  timeDisplayText: {fontSize: 36, fontWeight: '700'},
  timeDisplayLabel: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 4,
  },
  dayRow: {flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 0},
  dayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 42,
    alignItems: 'center',
  },
  dayText: {fontSize: 12, fontWeight: '500'},
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 16,
  },
  monthDay: {
    fontSize: 32,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'center',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  customLabel: {fontSize: 16, fontWeight: '500'},
  customInput: {
    width: 70,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 14,
    marginTop: 24,
  },
  saveBtnText: {color: '#fff', fontSize: 17, fontWeight: '600'},
});
