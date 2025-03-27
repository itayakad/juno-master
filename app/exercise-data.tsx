import React, { useState } from 'react';
import {
  StyleSheet,
  Alert,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { collection, getDocs, deleteDoc, DocumentReference, DocumentData } from 'firebase/firestore';
import { auth, db } from '../FirebaseConfig';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Colors from '../constants/Colors';
import CommonStyles from '../constants/CommonStyles';

interface ExerciseLog {
  id: string;
  ref: DocumentReference<DocumentData>;
  timestamp?: { seconds: number };
  exerciseType: string;
  duration: number;
  caloriesBurned: number;
  notes?: string;
  hasPhoto?: boolean;
  photoURL?: string;
}

interface GroupedExerciseLog {
  date: string;
  exercises: ExerciseLog[];
  totalCalories: number;
  totalDuration: number;
}

interface ExpandedDates {
  [key: string]: boolean;
}

export default function ExerciseData() {
  const [groupedLogs, setGroupedLogs] = useState<GroupedExerciseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<ExpandedDates>({});
  const router = useRouter();

  const toggleExpand = (date: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const fetchExerciseLogs = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const q = collection(db, 'users', user.uid, 'exercises');
        const querySnapshot = await getDocs(q);

        const logs = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ref: doc.ref,
          ...doc.data(),
        })) as ExerciseLog[];        

        const grouped = logs.reduce<Record<string, { exercises: ExerciseLog[]; totalCalories: number; totalDuration: number }>>((acc, log) => {
          const date = log.timestamp?.seconds 
            ? new Date(log.timestamp.seconds * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();

          if (!acc[date]) {
            acc[date] = {
              exercises: [],
              totalCalories: 0,
              totalDuration: 0,
            };
          }

          acc[date].exercises.push(log);
          acc[date].totalCalories += log.caloriesBurned || 0;
          acc[date].totalDuration += log.duration || 0;

          return acc;
        }, {});

        const groupedArray = Object.keys(grouped).map((date) => ({
          date,
          ...grouped[date],
        }));

        setGroupedLogs(groupedArray);
      }
    } catch (error) {
      console.error('Error fetching exercise logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteExerciseLog = async (logRef: DocumentReference<DocumentData>) => {
    try {
      await deleteDoc(logRef);
      Alert.alert('Success', 'Log deleted successfully!');
      fetchExerciseLogs();
    } catch (error) {
      console.error('Error deleting log:', error);
      Alert.alert('Error', 'Failed to delete log. Please try again.');
    }
  };  

  useFocusEffect(
    React.useCallback(() => {
      fetchExerciseLogs(); // Refresh exercise logs whenever the page is accessed
    }, [])
  );  

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={CommonStyles.header}>Exercise Logs</Text>
  
        {loading ? (
          <Text style={styles.loadingText}>Loading exercise logs...</Text>
        ) : groupedLogs.length === 0 ? (
          <Text style={styles.noLogsText}>No exercise logs found.</Text>
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
                    Total Calories: {item.totalCalories} kcal | Total Duration: {item.totalDuration} mins | Exercises: {item.exercises.length}
                  </Text>
                </TouchableOpacity>
                {expandedDates[item.date] && (
                  <FlatList
                    data={item.exercises}
                    keyExtractor={(log) => log.id}
                    renderItem={({ item: log }) => (
                      <View style={styles.logItemRow}>
                        <View style={styles.logContent}>
                          <Text style={styles.logText}>
                            Type: {log.exerciseType}
                          </Text>
                          <Text style={styles.logText}>
                            Duration: {log.duration} mins
                          </Text>
                          <Text style={styles.logText}>
                            Calories Burned: {log.caloriesBurned} kcal
                          </Text>
                          {log.notes && (
                            <Text style={styles.logText}>Notes: {log.notes}</Text>
                          )}
                          {log.hasPhoto && (
                            <TouchableOpacity
                              style={styles.photoButton}
                              onPress={() =>
                                router.push({
                                  pathname: '/view-photo',
                                  params: { photoURL: log.photoURL, logId: log.id },
                                })
                              }
                            >
                              <Text style={CommonStyles.buttonText}>
                                View Photo
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => deleteExerciseLog(log.ref)}
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
    backgroundColor: Colors.lightgreen,
  },
  content: CommonStyles.logContent,
  loadingText: CommonStyles.loadingText,
  noLogsText: CommonStyles.noLogsText,
  dateSection: CommonStyles.dateSection,
  dateHeader: {
    ...CommonStyles.dateHeader,
    backgroundColor: Colors.green,
  },
  dateText: CommonStyles.dateText,
  summaryText: CommonStyles.summaryText,
  logItemRow: CommonStyles.logItemRow,
  logContent: CommonStyles.logContent,
  logText: CommonStyles.logText,
  photoButton: {
    ...CommonStyles.photoButton,
    backgroundColor: Colors.green,
  },
  deleteButton: {
    ...CommonStyles.deleteButton,
    backgroundColor: Colors.red,
  },
  deleteButtonText: CommonStyles.deleteButtonText,
});
