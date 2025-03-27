import React, { useEffect, useState } from 'react';
import { View, Image, TouchableOpacity, Text, Alert, Dimensions, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ref, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, storage, db } from '../FirebaseConfig';
import Colors from '../constants/Colors';
import CommonStyles from '../constants/CommonStyles';

type PhotoParams = {
  photoURL: string;
  logId: string;
};

export default function ViewPhoto() {
  const router = useRouter();
  const params = useLocalSearchParams<PhotoParams>();
  const [imageError, setImageError] = useState(false);
  const [finalPhotoURL, setFinalPhotoURL] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const maxWidth = screenWidth * 0.9; // 90% of screen width
  const maxHeight = screenHeight * 0.6; // 60% of screen height to leave room for buttons

  useEffect(() => {
    const fetchFreshURL = async () => {
      try {
        if (!params.photoURL) {
          setImageError(true);
          return;
        }

        const encodedPhotoURL = decodeURIComponent(String(params.photoURL));
        const storageRef = ref(storage, encodedPhotoURL);

        const freshURL = await getDownloadURL(storageRef);
        console.log('Fresh URL fetched:', freshURL);
        setFinalPhotoURL(freshURL);

        // Get image dimensions
        Image.getSize(freshURL, (width, height) => {
          const aspectRatio = width / height;
          let newWidth = maxWidth;
          let newHeight = maxWidth / aspectRatio;

          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = maxHeight * aspectRatio;
          }

          setImageSize({ width: newWidth, height: newHeight });
        }, (error) => {
          console.error('Error getting image size:', error);
          setImageError(true);
        });
      } catch (error) {
        console.error('Error fetching fresh URL:', error);
        setImageError(true);
      }
    };

    fetchFreshURL();
  }, [params.photoURL]);

  const handleDeletePhoto = async () => {
    if (!params.photoURL || !params.logId) {
      Alert.alert('Error', 'Missing photo URL or log ID.');
      return;
    }
  
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        Alert.alert('Error', 'User not authenticated.');
        return;
      }
  
      const encodedPhotoURL = decodeURIComponent(String(params.photoURL));
      const storageRef = ref(storage, encodedPhotoURL);
  
      console.log('Deleting photo for logId:', params.logId);
  
      await deleteObject(storageRef);
      console.log('Photo deleted from Firebase Storage.');
  
      const isMealPhoto = encodedPhotoURL.includes('meal_photos');
      const collectionName = isMealPhoto ? 'meals' : 'exercises';
  
      console.log('Firestore collection:', collectionName);
  
      const logRef = doc(db, 'users', userId, collectionName, String(params.logId));
      await updateDoc(logRef, { hasPhoto: false, photoURL: '' });
      console.log('Firestore log updated.');
  
      Alert.alert('Success', 'Photo deleted successfully.');
      router.back();
    } catch (error) {
      console.error('Error deleting photo:', error);
      Alert.alert('Error', 'Failed to delete the photo. Please try again.');
    }
  };  

  if (!finalPhotoURL) {
    return (
      <SafeAreaView style={[CommonStyles.formContainer, { backgroundColor: Colors.white }]}>
        <Text style={CommonStyles.loadingText}>Loading photo...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[CommonStyles.formContainer, { backgroundColor: Colors.white }]}>
      <View style={{
        flex: 1,
        justifyContent: 'space-between',
        paddingVertical: 20,
      }}>
        {imageError ? (
          <View style={CommonStyles.formScrollContainer}>
            <Text style={[CommonStyles.loadingText, { color: Colors.red }]}>Failed to load the image.</Text>
          </View>
        ) : (
          <View style={[CommonStyles.photoContainer, {
            width: maxWidth,
            height: maxHeight,
            alignSelf: 'center',
            marginVertical: 20,
            backgroundColor: Colors.white,
          }]}>
            <Image
              source={{ uri: finalPhotoURL }}
              style={{
                width: imageSize.width,
                height: imageSize.height,
              }}
              resizeMode="contain"
              onLoadStart={() => console.log('Image loading started')}
              onLoad={() => console.log('Image loaded successfully')}
              onError={(error) => {
                console.error('Error loading image:', error.nativeEvent);
                setImageError(true);
                Alert.alert('Error', 'Failed to load the image.');
              }}
            />
          </View>
        )}

        <View style={{
          width: '100%',
          paddingHorizontal: 20,
          gap: 10,
        }}>
          <TouchableOpacity
            style={{
              width: '100%',
              backgroundColor: Colors.grey,
              paddingVertical: 15,
              borderRadius: 25,
              alignItems: 'center',
            }}
            onPress={() => router.back()}
          >
            <Text style={CommonStyles.buttonText}>Go Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              width: '100%',
              backgroundColor: Colors.red,
              paddingVertical: 15,
              borderRadius: 25,
              alignItems: 'center',
            }}
            onPress={handleDeletePhoto}
          >
            <Text style={CommonStyles.buttonText}>Delete Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
