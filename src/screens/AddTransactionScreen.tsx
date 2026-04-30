import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  Platform,
  Vibration,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useAuth} from '../contexts/AuthContext';
import {useColors} from '../hooks/useColors';
import {useApp} from '../contexts/AppContext';
import {
  addTransaction,
  getCategories,
  getDefaultAccount,
} from '../lib/database';
import type {Category, TransactionType} from '../types';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Haptics replacement: use Vibration API (works on Android & iOS)
const hapticSelection = () => {
  if (Platform.OS !== 'web') Vibration.vibrate(10);
};
const hapticSuccess = () => {
  if (Platform.OS !== 'web') Vibration.vibrate([0, 40, 30, 40]);
};

export default function AddTransactionScreen() {
  const {session} = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {primaryCurrency} = useApp();
  const qc = useQueryClient();
  const navigation = useNavigation<Nav>();

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-fetch the default account and categories in parallel on mount.
  // This way the Save button doesn't need a blocking round-trip to look
  // up the account at submit time — the modal is much snappier.
  const userId = session?.user.id;
  const {data: categories = []} = useQuery({
    queryKey: ['categories', userId],
    queryFn: () => getCategories(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
  const {data: defaultAccount} = useQuery({
    queryKey: ['default-account', userId],
    queryFn: () => getDefaultAccount(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const filteredCats = categories.filter(
    c => c.type === type || c.type === 'both',
  );

  const handleSave = async () => {
    if (!session) return;
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!amount || isNaN(num) || num <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Category required', 'Please select a category.');
      return;
    }

    setSaving(true);
    try {
      // The server will fall back to the user's default account when
      // account_id is omitted, so we don't block on a preflight call.
      // If the prefetched account is available we still pass it for an
      // explicit, deterministic write.
      await addTransaction({
        user_id: session.user.id,
        account_id: defaultAccount?.id ?? '',
        category_id: selectedCategory.id,
        type,
        amount: num,
        currency: primaryCurrency,
        description: description.trim() || undefined,
        date,
        is_recurring: isRecurring,
      });
      hapticSuccess();
      qc.invalidateQueries({queryKey: ['transactions']});
      qc.invalidateQueries({queryKey: ['monthly-stats']});
      qc.invalidateQueries({queryKey: ['budget-usage']});
      qc.invalidateQueries({queryKey: ['transactions-recent']});
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const formatDisplayDate = (d: string) => {
    const parts = d.split('-');
    if (parts.length !== 3) return d;
    return new Date(d + 'T00:00:00').toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const adjustDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    setDate(`${yyyy}-${mm}-${dd}`);
  };

  const bottomPad = insets.bottom;

  return (
    <View style={[styles.root, {backgroundColor: colors.background}]}>
      <View style={[styles.topBar, {paddingTop: 12}]}>
        <View style={[styles.handle, {backgroundColor: colors.border}]} />
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, {color: colors.foreground}]}>
            Add Transaction
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {paddingBottom: bottomPad + 24},
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.typeToggle, {backgroundColor: colors.muted}]}>
          {(['expense', 'income'] as TransactionType[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[
                styles.typeBtn,
                type === t && {
                  backgroundColor:
                    t === 'income' ? colors.income : colors.expense,
                },
              ]}
              onPress={() => {
                setType(t);
                setSelectedCategory(null);
                hapticSelection();
              }}>
              <Icon
                name={
                  t === 'income' ? 'arrow-down-outline' : 'arrow-up-outline'
                }
                size={16}
                color={type === t ? '#fff' : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.typeBtnText,
                  {color: type === t ? '#fff' : colors.mutedForeground},
                ]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.amountSection}>
          <Text style={[styles.currency, {color: colors.mutedForeground}]}>
            {primaryCurrency}
          </Text>
          <TextInput
            style={[
              styles.amountInput,
              {
                color:
                  type === 'income' ? colors.income : colors.expense,
              },
            ]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.border}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>

        <Text style={[styles.sectionLabel, {color: colors.mutedForeground}]}>
          Category
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}>
          {filteredCats.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.catChip,
                {
                  backgroundColor:
                    selectedCategory?.id === cat.id
                      ? cat.color + '25'
                      : colors.card,
                  borderColor:
                    selectedCategory?.id === cat.id
                      ? cat.color
                      : colors.border,
                },
              ]}
              onPress={() => {
                setSelectedCategory(cat);
                hapticSelection();
              }}>
              <Icon name={cat.icon as any} size={18} color={cat.color} />
              <Text
                style={[
                  styles.catChipText,
                  {
                    color:
                      selectedCategory?.id === cat.id
                        ? cat.color
                        : colors.foreground,
                  },
                ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.sectionLabel, {color: colors.mutedForeground}]}>
          Note (optional)
        </Text>
        <TextInput
          style={[
            styles.noteInput,
            {
              backgroundColor: colors.input,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          placeholder="Add a note..."
          placeholderTextColor={colors.mutedForeground}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={200}
        />

        <Text style={[styles.sectionLabel, {color: colors.mutedForeground}]}>
          Date
        </Text>
        <View
          style={[
            styles.dateRow,
            {backgroundColor: colors.input, borderColor: colors.border},
          ]}>
          <TouchableOpacity
            onPress={() => adjustDate(-1)}
            style={styles.dateArrow}>
            <Icon
              name="chevron-back"
              size={20}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
          <Text style={[styles.dateText, {color: colors.foreground}]}>
            {formatDisplayDate(date)}
          </Text>
          <TouchableOpacity
            onPress={() => adjustDate(1)}
            style={styles.dateArrow}>
            <Icon
              name="chevron-forward"
              size={20}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        <View
          style={[styles.recurRow, {borderColor: colors.border}]}>
          <Icon name="repeat-outline" size={20} color={colors.primary} />
          <Text style={[styles.recurLabel, {color: colors.foreground}]}>
            Recurring
          </Text>
          <Switch
            value={isRecurring}
            onValueChange={v => {
              setIsRecurring(v);
              hapticSelection();
            }}
            trackColor={{false: colors.muted, true: colors.primary + '80'}}
            thumbColor={isRecurring ? colors.primary : colors.mutedForeground}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            {
              backgroundColor:
                type === 'income' ? colors.income : colors.expense,
              opacity: saving ? 0.7 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  topBar: {paddingHorizontal: 20, paddingBottom: 4},
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {fontSize: 18, fontWeight: '700'},
  scroll: {paddingHorizontal: 20, paddingTop: 16},
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  typeBtnText: {fontSize: 15, fontWeight: '600'},
  amountSection: {alignItems: 'center', marginBottom: 28},
  currency: {fontSize: 16, fontWeight: '500', marginBottom: 4},
  amountInput: {
    fontSize: 52,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 100,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 8,
  },
  catScroll: {marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 8},
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
  },
  catChipText: {fontSize: 13, fontWeight: '500'},
  noteInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    fontWeight: '400',
    minHeight: 70,
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 2,
    marginBottom: 8,
  },
  dateArrow: {padding: 12},
  dateText: {fontSize: 15, fontWeight: '500'},
  recurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  recurLabel: {flex: 1, fontSize: 15, fontWeight: '500'},
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 14,
    marginTop: 16,
  },
  saveBtnText: {color: '#fff', fontSize: 17, fontWeight: '600'},
});
