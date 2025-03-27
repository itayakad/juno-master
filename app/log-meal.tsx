import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from 'react-native';
import { db, auth, storage } from '../FirebaseConfig';
import { collection, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../constants/Colors';
import CommonStyles from '../constants/CommonStyles';
import { SPOONACULAR_API_KEY } from '@env';

interface NutritionData {
  calories: { value: number };
  protein: { value: number };
  carbs: { value: number };
  fat: { value: number };
}

export default function LogMeal() {
  const [mealDescription, setMealDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [nutrition, setNutrition] = useState<NutritionData | null>(null);
  const [portionSize, setPortionSize] = useState(1); // 1 = normal, 0.8 = small, 1.2 = large
  const [image, setImage] = useState<string | null>(null); // State for selected image
  const [imageURL, setImageURL] = useState(''); // State for uploaded image URL
  const [isManualInput, setIsManualInput] = useState(false);
  const [selectedButton, setSelectedButton] = useState<'estimate' | 'manual' | null>(null);
  const [manualNutrition, setManualNutrition] = useState({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  });

  // Add effect to update manual nutrition values when portion size changes
  useEffect(() => {
    if (isManualInput && nutrition) {
      const baseCalories = parseFloat(manualNutrition.calories) || 0;
      const baseProtein = parseFloat(manualNutrition.protein) || 0;
      const baseCarbs = parseFloat(manualNutrition.carbs) || 0;
      const baseFat = parseFloat(manualNutrition.fat) || 0;

      setManualNutrition({
        calories: Math.round(baseCalories * portionSize).toString(),
        protein: Math.round(baseProtein * portionSize).toString(),
        carbs: Math.round(baseCarbs * portionSize).toString(),
        fat: Math.round(baseFat * portionSize).toString(),
      });
    }
  }, [portionSize]);

  const router = useRouter();

  const fetchNutrition = async () => {
    if (!mealDescription.trim()) {
      Alert.alert('Error', 'Please enter a description of your meal.');
      return;
    }

    setLoading(true);
    setNutrition(null);
    setIsManualInput(false);
    setSelectedButton('estimate');
    setManualNutrition({
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    });

    try {
      const apiKey = SPOONACULAR_API_KEY;
      const endpoint = `https://api.spoonacular.com/recipes/guessNutrition`;

      const response = await fetch(`${endpoint}?title=${encodeURIComponent(mealDescription)}&apiKey=${apiKey}`);
      const data = await response.json();

      if (data && data.calories) {
        setNutrition(data);
      } else {
        Alert.alert('Error', 'Could not estimate nutrition. Please try again. (HINT: Check your spelling)');
      }
    } catch (error) {
      console.error('Error fetching nutrition:', error);
      Alert.alert('Error', 'Failed to fetch nutrition data.');
    } finally {
      setLoading(false);
    }
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
      const imageRef = ref(storage, `meal_photos/${userId}/${Date.now()}.jpg`);

      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);
      setImageURL(downloadURL);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const logMeal = async () => {
    if (!nutrition) {
      Alert.alert('Error', 'No nutrition data to log.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Error', 'User not authenticated.');
      return;
    }

    try {
      const photoURL = await uploadImage();

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      let currentCalories = 0;
      let currentProtein = 0;
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentCalories = data.caloriesConsumed || 0;
        currentProtein = data.proteinConsumed || 0;
      }

      let mealCalories, mealProtein, mealCarbs, mealFat;
      if (isManualInput) {
        mealCalories = Math.round(parseFloat(manualNutrition.calories) || 0);
        mealProtein = Math.round(parseFloat(manualNutrition.protein) || 0);
        mealCarbs = Math.round(parseFloat(manualNutrition.carbs) || 0);
        mealFat = Math.round(parseFloat(manualNutrition.fat) || 0);
      } else {
        mealCalories = Math.round(nutrition.calories.value * portionSize);
        mealProtein = Math.round(nutrition.protein.value * portionSize);
        mealCarbs = Math.round(nutrition.carbs.value * portionSize);
        mealFat = Math.round(nutrition.fat.value * portionSize);
      }

      const updatedCalories = currentCalories + mealCalories;
      const updatedProtein = currentProtein + mealProtein;

      // Update total calories and protein in Firestore
      await setDoc(docRef, { caloriesConsumed: updatedCalories }, { merge: true });
      await setDoc(docRef, { proteinConsumed: updatedProtein }, { merge: true });

      // Log the meal details in a sub-collection
      const userMealsCollection = collection(db, 'users', user.uid, 'meals');
      await addDoc(userMealsCollection, {
        description: mealDescription,
        calories: mealCalories,
        carbs: mealCarbs,
        fat: mealFat,
        protein: mealProtein,
        photoURL: photoURL || '',
        hasPhoto: !!photoURL,
        timestamp: new Date(),
      });

      Alert.alert('Success', 'Meal logged successfully!');
      router.replace('/(tabs)/calorie-tracking');
    } catch (error) {
      console.error('Error logging meal:', error);
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    }
  };

  const handleManualInput = () => {
    if (!mealDescription.trim()) {
      Alert.alert('Error', 'Please enter a description of your meal.');
      return;
    }
    setIsManualInput(true);
    setSelectedButton('manual');
    setNutrition({
      calories: { value: 0 },
      protein: { value: 0 },
      carbs: { value: 0 },
      fat: { value: 0 },
    });
  };

  const updateManualNutrition = (field: keyof typeof manualNutrition, value: string) => {
    setManualNutrition(prev => ({ ...prev, [field]: value }));
    if (nutrition) {
      const numValue = parseFloat(value) || 0;
      setNutrition(prev => ({
        ...prev!,
        [field]: { value: numValue }
      }));
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[CommonStyles.formContainer, { backgroundColor: Colors.lightorange }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={CommonStyles.formScrollContainer}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={CommonStyles.formHeader}>Log Meal</Text>
  
            <TextInput
              style={CommonStyles.formInput}
              placeholder="Describe your meal (e.g., 'Hamburger')"
              placeholderTextColor={Colors.grey}
              value={mealDescription}
              onChangeText={setMealDescription}
            />
  
            <View style={CommonStyles.buttonContainer}>
              <TouchableOpacity 
                style={[
                  CommonStyles.estimateButton, 
                  { backgroundColor: selectedButton === 'estimate' ? Colors.orange : Colors.midorange }
                ]} 
                onPress={fetchNutrition}
              >
                <Text style={CommonStyles.buttonText}>{loading ? 'Estimating...' : 'Estimate Nutrition'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  CommonStyles.estimateButton, 
                  { backgroundColor: selectedButton === 'manual' ? Colors.orange : Colors.midorange }
                ]} 
                onPress={handleManualInput}
              >
                <Text style={CommonStyles.buttonText}>Enter Manual Info</Text>
              </TouchableOpacity>
            </View>
  
            {loading && <ActivityIndicator size="large" color={Colors.orange} style={CommonStyles.loader} />}
  
            {nutrition && (
              <View style={CommonStyles.resultsContainer}>
                {isManualInput ? (
                  <>
                    <TextInput
                      style={CommonStyles.formInput}
                      placeholder="Calories"
                      placeholderTextColor={Colors.grey}
                      keyboardType="numeric"
                      value={manualNutrition.calories}
                      onChangeText={(value) => updateManualNutrition('calories', value)}
                    />
                    <TextInput
                      style={CommonStyles.formInput}
                      placeholder="Protein (g)"
                      placeholderTextColor={Colors.grey}
                      keyboardType="numeric"
                      value={manualNutrition.protein}
                      onChangeText={(value) => updateManualNutrition('protein', value)}
                    />
                    <TextInput
                      style={CommonStyles.formInput}
                      placeholder="Carbs (g)"
                      placeholderTextColor={Colors.grey}
                      keyboardType="numeric"
                      value={manualNutrition.carbs}
                      onChangeText={(value) => updateManualNutrition('carbs', value)}
                    />
                    <TextInput
                      style={CommonStyles.formInput}
                      placeholder="Fat (g)"
                      placeholderTextColor={Colors.grey}
                      keyboardType="numeric"
                      value={manualNutrition.fat}
                      onChangeText={(value) => updateManualNutrition('fat', value)}
                    />
                  </>
                ) : (
                  <>
                    <Text style={CommonStyles.resultText}>Calories: {Math.round(nutrition.calories.value * portionSize)} kcal</Text>
                    <Text style={CommonStyles.resultText}>Carbs: {Math.round(nutrition.carbs.value * portionSize)} g</Text>
                    <Text style={CommonStyles.resultText}>Fat: {Math.round(nutrition.fat.value * portionSize)} g</Text>
                    <Text style={CommonStyles.resultText}>Protein: {Math.round(nutrition.protein.value * portionSize)} g</Text>

                    {/* Portion Size Adjustment Buttons */}
                    <View style={CommonStyles.portionContainer}>
                      <Text style={CommonStyles.portionText}>Portion Size:</Text>
                      <TouchableOpacity
                        style={[CommonStyles.portionButton, portionSize === 0.8 && CommonStyles.activePortionButton]}
                        onPress={() => setPortionSize(0.8)}
                      >
                        <Text style={CommonStyles.portionButtonText}>Small</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[CommonStyles.portionButton, portionSize === 1 && CommonStyles.activePortionButton]}
                        onPress={() => setPortionSize(1)}
                      >
                        <Text style={CommonStyles.portionButtonText}>Normal</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[CommonStyles.portionButton, portionSize === 1.2 && CommonStyles.activePortionButton]}
                        onPress={() => setPortionSize(1.2)}
                      >
                        <Text style={CommonStyles.portionButtonText}>Large</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Slider for Adjusting Portion Size */}
                    <View style={CommonStyles.sliderContainer}>
                      <Text style={CommonStyles.adjustText}>Adjust Portion Size: {portionSize.toFixed(1)}x</Text>
                      <Slider
                        style={CommonStyles.slider}
                        minimumValue={0.2}
                        maximumValue={1.8}
                        step={0.1}
                        value={portionSize}
                        onValueChange={(value) => setPortionSize(value)}
                        minimumTrackTintColor={Colors.orange}
                        maximumTrackTintColor={Colors.lightgrey}
                        thumbTintColor={Colors.orange}
                      />
                    </View>
                  </>
                )}
  
                {/* Choose Photo Button */}
                <TouchableOpacity style={CommonStyles.formPhotoButton} onPress={pickImage}>
                  <Text style={CommonStyles.buttonText}>Pick a Meal Photo (optional)</Text>
                </TouchableOpacity>
                {image && <Image source={{ uri: image }} style={CommonStyles.imagePreview} />}
              </View>
            )}
  
            {/* Conditional Button Rendering */}
            {!nutrition ? (
              <View style={CommonStyles.singleButtonContainer}>
                <TouchableOpacity style={CommonStyles.largeCancelButton} onPress={() => router.back()}>
                  <Text style={CommonStyles.largeCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={CommonStyles.formButtonContainer}>
                <TouchableOpacity style={CommonStyles.cancelButton} onPress={() => router.back()}>
                  <Text style={CommonStyles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={CommonStyles.submitButton} onPress={logMeal}>
                  <Text style={CommonStyles.buttonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );  
}

const styles = StyleSheet.create({});
