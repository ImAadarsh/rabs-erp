import 'package:flutter/material.dart';

/// RABS brand: deep crimson + gold on warm charcoal ink (matches rabs-panels).
class RabsTheme {
  static const brand = Color(0xFFA31F24); // crimson 500
  static const brandDark = Color(0xFF8E1B1F); // crimson 600
  static const brandDeep = Color(0xFF75161A); // crimson 700
  static const gold = Color(0xFFD4AF37);
  static const goldWarm = Color(0xFFE8A33D);
  static const ink = Color(0xFF141111);
  static const charcoal = Color(0xFF262222);
  static const surface = Color(0xFFFAF7F5);
  static const card = Color(0xFFFFFFFF);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: brand,
      primary: brand,
      secondary: gold,
      surface: surface,
      brightness: Brightness.light,
    ).copyWith(
      primary: brand,
      onPrimary: Colors.white,
      secondary: gold,
      onSecondary: ink,
      tertiary: goldWarm,
      error: const Color(0xFFB91C1C),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: surface,
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        backgroundColor: Colors.white,
        foregroundColor: ink,
        titleTextStyle: TextStyle(color: ink, fontWeight: FontWeight.w800, fontSize: 18),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: card,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: brand.withValues(alpha: 0.08)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brand, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          disabledBackgroundColor: brand.withValues(alpha: 0.35),
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: 0.2),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brandDark,
          side: BorderSide(color: brand.withValues(alpha: 0.35)),
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: brand.withValues(alpha: 0.12),
        labelTextStyle: WidgetStateProperty.resolveWith((s) {
          final selected = s.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
            color: selected ? brandDark : charcoal.withValues(alpha: 0.65),
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((s) {
          final selected = s.contains(WidgetState.selected);
          return IconThemeData(color: selected ? brand : charcoal.withValues(alpha: 0.55));
        }),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: charcoal,
        contentTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: brand),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: brand,
        foregroundColor: Colors.white,
      ),
      dividerTheme: DividerThemeData(color: brand.withValues(alpha: 0.08), thickness: 1),
    );
  }

  static Color statusColor(String? hex, {Color fallback = brand}) {
    if (hex == null || hex.isEmpty) return fallback;
    final h = hex.replaceFirst('#', '');
    if (h.length != 6) return fallback;
    return Color(int.parse('FF$h', radix: 16));
  }
}

class RabsBrand {
  static const name = 'RABS Carpets & Furniture';
  static const shortName = 'RABS';
  static const tagline = 'Turning Houses Into Homes';
  static const phone = '07774 596 596';
  static const address = '194 Waterloo Road, Stoke-on-Trent ST6 3HF';

  static const logo = 'assets/brand/rabs-logo.png';
  static const logoCompact = 'assets/brand/rabs-logo-compact.png';
  static const badge = 'assets/brand/rabs-badge.png';
}
