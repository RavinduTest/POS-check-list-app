import 'package:flutter/material.dart';

const serpBlue = Color(0xFF1E73BE);
const serpNavy = Color(0xFF0B2A4A);

ThemeData buildTheme(Brightness b) => ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: serpBlue, brightness: b),
      fontFamily: 'Poppins',
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(48, 48))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48))),
      inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    );
