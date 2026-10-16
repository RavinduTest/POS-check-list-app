import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase config is injected at build time:
/// flutter build web --dart-define=FIREBASE_API_KEY=... (see Dockerfile / README)
class Env {
  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY', defaultValue: 'demo-key');
  static const appId = String.fromEnvironment('FIREBASE_APP_ID', defaultValue: '1:000000000000:web:demo');
  static const senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID', defaultValue: '000000000000');
  static const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: 'demo-serp-pos');
  static const authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const storageBucket = String.fromEnvironment('FIREBASE_STORAGE_BUCKET', defaultValue: 'demo-serp-pos.appspot.com');
  // Native apps need their own app IDs (register iOS/Android apps in Firebase).
  static const iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const iosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
  static const androidAppId = String.fromEnvironment('FIREBASE_ANDROID_APP_ID');
  static const androidApiKey = String.fromEnvironment('FIREBASE_ANDROID_API_KEY');
  static const useEmulators = bool.fromEnvironment('USE_EMULATORS');
  static const emulatorHost = String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost');
  static const appVersion = '1.0.0';

  static String get _appId => kIsWeb ? appId : switch (defaultTargetPlatform) {
        TargetPlatform.iOS => iosAppId.isEmpty ? appId : iosAppId,
        TargetPlatform.android => androidAppId.isEmpty ? appId : androidAppId,
        _ => appId,
      };
  static String get _apiKey => kIsWeb ? apiKey : switch (defaultTargetPlatform) {
        TargetPlatform.iOS => iosApiKey.isEmpty ? apiKey : iosApiKey,
        TargetPlatform.android => androidApiKey.isEmpty ? apiKey : androidApiKey,
        _ => apiKey,
      };

  static FirebaseOptions get options => FirebaseOptions(
        apiKey: _apiKey,
        appId: _appId,
        iosBundleId: 'lk.serp.serpPos',
        messagingSenderId: senderId,
        projectId: projectId,
        authDomain: authDomain.isEmpty ? null : authDomain,
        storageBucket: storageBucket.isEmpty ? null : storageBucket,
      );
}
