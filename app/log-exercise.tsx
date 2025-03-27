import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  SafeAreaView,
  TouchableWithoutFeedback,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DropDownPicker from 'react-native-dropdown-picker';
import { db, auth, storage } from '../FirebaseConfig'; // Ensure storage is initialized
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Import Firebase Storage methods
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import Colors from '../constants/Colors';
import CommonStyles from '../constants/CommonStyles';

type ExerciseType = 'Running' | 'Cycling' | 'Swimming' | 'Yoga' | 'Weightlifting' | null;

export default function LogExercise() {
  const router = useRouter();

  // State variables
  const [exerciseType, setExerciseType] = useState<ExerciseType>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageURL, setImageURL] = useState('');
  const [recordWorkout, setRecordWorkout] = useState('');
  const [recordQuantity, setRecordQuantity] = useState('');

  const exerciseOptions = [
    { label: 'Running', value: 'Running' },
    { label: 'Cycling', value: 'Cycling' },
    { label: 'Swimming', value: 'Swimming' },
    { label: 'Yoga', value: 'Yoga' },
    { label: 'Weightlifting', value: 'Weightlifting' },
  ];

  const calculateCalories = (): number => {
    const durationInMinutes = parseInt(duration);
    if (isNaN(durationInMinutes) || durationInMinutes <= 0 || !exerciseType) {
      return 0;
    }

    const caloriesPerMinute = {
      Running: 10,
      Cycling: 8,
      Swimming: 12,
      Yoga: 5,
      Weightlifting: 7,
    };

    return durationInMinutes * (caloriesPerMinute[exerciseType] || 0);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const uploadImage = async () => {
    if (!image) return null;

    try {
      const response = await fetch(image);
      const blob = await response.blob();

      const userId = auth.currentUser?.uid;
      const imageRef = ref(storage, `progress_photos/${userId}/${Date.now()}.jpg`);

      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);
      setImageURL(downloadURL);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const handleSubmit = async () => {
    const caloriesBurned = calculateCalories();
    const userId = auth.currentUser?.uid;
  
    if (!exerciseType || !duration || isNaN(caloriesBurned)) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
  
    if (!userId) {
      Alert.alert('Error', 'User not authenticated.');
      return;
    }
  
    const durationInMinutes = parseInt(duration);
    const today = new Date(); // Get the current date
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()]; // Convert to day name
  
    try {
      const photoURL = await uploadImage();
  
      // Update the user's total exercise minutes
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
  
      let currentMinutes = 0;
      let workoutDays = [];
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        currentMinutes = data.exerciseMinutes || 0;
        workoutDays = data.workoutDays || [];
      }
  
      const updatedMinutes = currentMinutes + durationInMinutes;
  
      // Add the current day to the workoutDays array if not already included
      if (!workoutDays.includes(dayOfWeek)) {
        workoutDays.push(dayOfWeek);
      }
  
      // Save the updated data to Firestore
      await setDoc(userDocRef, { 
        exerciseMinutes: updatedMinutes, 
        workoutDays 
      }, { merge: true });
  
      // Log the specific exercise
      const exerciseLogRef = doc(db, 'users', userId, 'exercises', `${Date.now()}`);
      await setDoc(exerciseLogRef, {
        exerciseType,
        duration: durationInMinutes,
        caloriesBurned,
        notes,
        photoURL,
        hasPhoto: !!photoURL,
        recordWorkout,
        recordQuantity,
        timestamp: today,
      });
  
      Alert.alert('Success', 'Exercise logged successfully!');
      router.replace('/(tabs)/exercise-tracking'); // Redirect to exercise tracking page
    } catch (error) {
      console.error('Error logging exercise:', error);
      Alert.alert('Error', 'Failed to log exercise. Please try again.');
    }
  };  

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[CommonStyles.formContainer, { backgroundColor: Colors.lightgreen }]}>
        <KeyboardAwareScrollView
          contentContainerStyle={[CommonStyles.formScrollContainer, { paddingHorizontal: 20 }]}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          keyboardOpeningTime={0}
          extraScrollHeight={Platform.OS === 'ios' ? 120 : 40}
        >
          <Text style={[CommonStyles.formHeader, { marginBottom: 25, fontSize: 32 }]}>Log Exercise</Text>

          <View style={{ marginBottom: 15 }}>
            <Text style={[CommonStyles.label, { paddingHorizontal: 0, fontSize: 18, marginBottom: 8 }]}>Select Exercise Type:</Text>
            <View style={[CommonStyles.dropdownWrapper, { zIndex: 1000, paddingHorizontal: 0 }]}>
              <DropDownPicker
                open={dropdownOpen}
                value={exerciseType}
                items={exerciseOptions}
                setOpen={setDropdownOpen}
                setValue={setExerciseType}
                placeholder="Choose exercise type"
                style={[CommonStyles.dropdown, { 
                  height: 50,
                  borderWidth: 1,
                  borderColor: Colors.lightgrey,
                  borderRadius: 10
                }]}
                dropDownContainerStyle={[CommonStyles.dropdownContainer, {
                  borderColor: Colors.lightgrey,
                  borderRadius: 10,
                  marginTop: 1
                }]}
                placeholderStyle={{ color: Colors.grey }}
                textStyle={{ color: Colors.black }}
                listMode="SCROLLVIEW"
                scrollViewProps={{
                  nestedScrollEnabled: true
                }}
              />
            </View>
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text style={[CommonStyles.label, { paddingHorizontal: 0, fontSize: 18, marginBottom: 8 }]}>Duration (minutes):</Text>
            <TextInput
              style={[CommonStyles.formInput, { 
                height: 50,
                borderWidth: 1,
                borderColor: Colors.lightgrey,
                borderRadius: 10,
                paddingHorizontal: 15,
                fontSize: 16
              }]}
              placeholder="Enter duration in minutes"
              placeholderTextColor={Colors.grey}
              keyboardType="numeric"
              value={duration}
              onChangeText={setDuration}
            />
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text style={[CommonStyles.label, { paddingHorizontal: 0, fontSize: 18, marginBottom: 8 }]}>Estimated Calories Burned:</Text>
            <Text style={[CommonStyles.resultText, { fontSize: 20, fontWeight: '600', paddingHorizontal: 0 }]}>{calculateCalories()} kcal</Text>
          </View>

          <View style={{ marginBottom: 15 }}>
            <Text style={[CommonStyles.label, { paddingHorizontal: 0, fontSize: 18, marginBottom: 8 }]}>Notes (optional):</Text>
            <TextInput
              style={[CommonStyles.formInput, { 
                height: 100,
                borderWidth: 1,
                borderColor: Colors.lightgrey,
                borderRadius: 10,
                paddingHorizontal: 15,
                paddingTop: 12,
                fontSize: 16,
                textAlignVertical: 'top'
              }]}
              placeholder="Add notes about your session"
              placeholderTextColor={Colors.grey}
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          <TouchableOpacity 
            style={[CommonStyles.formPhotoButton, { 
              backgroundColor: Colors.green,
              marginBottom: 15,
              height: 50,
              borderRadius: 10,
              justifyContent: 'center'
            }]} 
            onPress={pickImage}
          >
            <Text style={[CommonStyles.buttonText, { fontSize: 16 }]}>Pick a Progress Photo (optional)</Text>
          </TouchableOpacity>
          {image && <Image source={{ uri: image }} style={[CommonStyles.imagePreview, { marginBottom: 15, borderRadius: 10 }]} />}

          <View style={[CommonStyles.formButtonContainer, { marginTop: 10, paddingHorizontal: 0, gap: 15 }]}>
            <TouchableOpacity 
              style={[CommonStyles.cancelButton, { 
                height: 50,
                borderRadius: 10,
                justifyContent: 'center'
              }]} 
              onPress={() => router.back()}
            >
              <Text style={[CommonStyles.cancelButtonText, { fontSize: 16 }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[CommonStyles.submitButton, { 
                backgroundColor: Colors.green,
                height: 50,
                borderRadius: 10,
                justifyContent: 'center'
              }]} 
              onPress={handleSubmit}
            >
              <Text style={[CommonStyles.buttonText, { fontSize: 16 }]}>Submit</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({});
