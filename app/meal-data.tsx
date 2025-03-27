import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { collection, getDocs, deleteDoc, doc, setDoc, getDoc, DocumentReference, DocumentData } from 'firebase/firestore';
import { auth, db } from '../FirebaseConfig';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Colors from '../constants/Colors';
import CommonStyles from '../constants/CommonStyles';

interface MealLog {
  id: string;
  ref: DocumentReference<DocumentData>;
  timestamp?: { seconds: number };
  description: string;
  calories: number;
  carbs: number;
  fat: number;
  protein: number;
  photoURL?: string;
}

interface GroupedMealLog {
  date: string;
  meals: MealLog[];
  totalCalories: number;
}

interface ExpandedDates {
  [key: string]: boolean;
}

export default function MealData() {
  const [groupedLogs, setGroupedLogs] = useState<GroupedMealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<ExpandedDates>({});
  const router = useRouter();

  const toggleExpand = (date: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const fetchMealLogs = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const q = collection(db, 'users', user.uid, 'meals');
        const querySnapshot = await getDocs(q);

        const logs = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ref: doc.ref,
          ...doc.data(),
        })) as MealLog[];

        const grouped = logs.reduce<Record<string, { meals: MealLog[]; totalCalories: number }>>((acc, log) => {
          const date = log.timestamp?.seconds 
            ? new Date(log.timestamp.seconds * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();

          if (!acc[date]) {
            acc[date] = {
              meals: [],
              totalCalories: 0,
            };
          }

          acc[date].meals.push(log);
          acc[date].totalCalories += log.calories || 0;

          return acc;
        }, {});

        const groupedArray = Object.keys(grouped).map((date) => ({
          date,
          ...grouped[date],
        }));

        setGroupedLogs(groupedArray);
      }
    } catch (error) {
      console.error('Error fetching meal logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteMealLog = async (logRef: DocumentReference<DocumentData>, logCalories: number, logDate: string) => {
    const todayDate = new Date().toLocaleDateString();
  
    Alert.alert(
      'Delete Meal Log',
      'Are you sure you want to delete this meal log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(logRef);
  
              if (logDate === todayDate) {
                const user = auth.currentUser;
                if (user) {
                  const userDocRef = doc(db, 'users', user.uid);
                  const userDocSnap = await getDoc(userDocRef);
  
                  if (userDocSnap.exists()) {
                    const currentCalories = userDocSnap.data().caloriesConsumed || 0;
  
                    const updatedCalories = Math.max(0, currentCalories - logCalories);
                    await setDoc(userDocRef, { caloriesConsumed: updatedCalories }, { merge: true });
                  }
                }
              }
  
              fetchMealLogs();
            } catch (error) {
              console.error('Error deleting meal log:', error);
              Alert.alert('Error', 'Failed to delete meal log. Please try again.');
            }
          },
        },
      ]
    );
  };  

  useFocusEffect(
    React.useCallback(() => {
      fetchMealLogs(); // Refresh meal logs whenever the page is accessed
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.header}>Meal Logs</Text>

        {loading ? (
          <Text style={styles.loadingText}>Loading meal logs...</Text>
        ) : groupedLogs.length === 0 ? (
          <Text style={styles.noLogsText}>No meal logs found.</Text>
        ) : (
          <FlatList
            data={groupedLogs}
            keyExtractor={(item) => item.date}
            renderItem={({ item }) => (
              <View style={styles.dateSection}>
                <TouchableOpacity
                  onPress={() => toggleExpand(item.date)}
                  style={styles.dateHeader}
                >
                  <Text style={styles.dateText}>{item.date}</Text>
                  <Text style={styles.summaryText}>
                    Total Calories: {item.totalCalories} kcal | Meals: {item.meals.length}
                  </Text>
                </TouchableOpacity>
                {expandedDates[item.date] && (
                  <FlatList
                    data={item.meals}
                    keyExtractor={(log) => log.id}
                    renderItem={({ item: log }) => (
                      <View style={styles.logItemRow}>
                        <View style={styles.logContent}>
                          <Text style={styles.logText}>Description: {log.description}</Text>
                          <Text style={styles.logText}>Calories: {log.calories} kcal</Text>
                          <Text style={styles.logText}>
                            Carbs: {log.carbs} g | Fat: {log.fat} g | Protein: {log.protein} g
                          </Text>
                          {log.photoURL && (
                            <TouchableOpacity
                              style={styles.photoButton}
                              onPress={() =>
                                router.push({
                                  pathname: '/view-photo', // Use existing `ViewPhoto` screen
                                  params: { photoURL: log.photoURL, logId: log.id },
                                })
                              }
                            >
                              <Text style={styles.photoButtonText}>View Meal Photo</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => deleteMealLog(
                            log.ref, 
                            log.calories, 
                            log.timestamp?.seconds 
                              ? new Date(log.timestamp.seconds * 1000).toLocaleDateString()
                              : new Date().toLocaleDateString()
                          )}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  />
                )}
              </View>
            )}
          />
        )}
      </View>
      <TouchableOpacity
        style={CommonStyles.greyGoBackButton}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={CommonStyles.buttonText}>Go Back</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...CommonStyles.logContainer,
    backgroundColor: Colors.lightorange,
  },
  content: CommonStyles.logContent,
  loadingText: CommonStyles.loadingText,
  noLogsText: CommonStyles.noLogsText,
  dateSection: CommonStyles.dateSection,
  dateHeader: {
    ...CommonStyles.dateHeader,
    backgroundColor: Colors.orange,
  },
  dateText: CommonStyles.dateText,
  summaryText: CommonStyles.summaryText,
  logItemRow: CommonStyles.logItemRow,
  logContent: CommonStyles.logContent,
  logText: CommonStyles.logText,
  photoButton: {
    ...CommonStyles.photoButton,
    backgroundColor: Colors.orange,
  },
  deleteButton: {
    ...CommonStyles.deleteButton,
    backgroundColor: Colors.red,
  },
  deleteButtonText: CommonStyles.deleteButtonText,
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: Colors.black,
  },
  photoButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
