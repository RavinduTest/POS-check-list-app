import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'firebase_options.dart';
import 'screens/change_password_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/record_service.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: Env.options);
  if (Env.useEmulators) {
    await FirebaseAuth.instance.useAuthEmulator(Env.emulatorHost, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(Env.emulatorHost, 8080);
    FirebaseFunctions.instance.useFunctionsEmulator(Env.emulatorHost, 5001);
    await FirebaseStorage.instance.useStorageEmulator(Env.emulatorHost, 9199);
  }
  // Offline support (6.4): local cache + queued writes.
  FirebaseFirestore.instance.settings = const Settings(persistenceEnabled: true, cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED);

  final prefs = await SharedPreferences.getInstance();
  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (_) => AuthService()),
      ProxyProvider<AuthService, RecordService>(update: (_, a, _) => RecordService(a)),
      ChangeNotifierProvider(create: (_) => ThemeController(prefs)),
    ],
    child: const SerpApp(),
  ));
}

class ThemeController extends ChangeNotifier {
  final SharedPreferences prefs;
  ThemeController(this.prefs);
  ThemeMode get mode => ThemeMode.values.byName(prefs.getString('theme') ?? 'system');
  void set(ThemeMode m) {
    prefs.setString('theme', m.name);
    notifyListeners();
  }
}

class SerpApp extends StatelessWidget {
  const SerpApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'SERP POS Tracker',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: context.watch<ThemeController>().mode,
        home: const _Gate(),
      );
}

class _Gate extends StatelessWidget {
  const _Gate();
  @override
  Widget build(BuildContext context) {
    final a = context.watch<AuthService>();
    if (!a.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (a.user == null) return const LoginScreen();
    if (a.mustChangePassword) return const ChangePasswordScreen(forced: true);
    return const HomeScreen();
  }
}
