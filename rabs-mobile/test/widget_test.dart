import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rabs_mobile/core/theme.dart';
import 'package:rabs_mobile/features/auth/login_page.dart';
import 'package:rabs_mobile/shared/widgets.dart';

void main() {
  testWidgets('Login page shows staff and customer modes', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginPage()),
      ),
    );
    await tester.pump();
    expect(find.text('Staff'), findsOneWidget);
    expect(find.text('Customer'), findsOneWidget);
    expect(find.textContaining('Sign in'), findsWidgets);
    expect(find.textContaining('Staff sign-in'), findsOneWidget);
  });

  testWidgets('StatusChip and ProgressBar render', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: RabsTheme.light(),
        home: const Scaffold(
          body: Column(
            children: [
              StatusChip(label: 'Accepted', colorHex: '#16A34A'),
              ProgressBar(steps: ['APPOINTMENT', 'MEASURE', 'QUOTE'], index: 1),
              NextActionButton(label: 'START MEASUREMENT', onPressed: null),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Accepted'), findsOneWidget);
    expect(find.text('MEASURE'), findsOneWidget);
    expect(find.text('NEXT STEP'), findsOneWidget);
    expect(find.text('START MEASUREMENT'), findsOneWidget);
  });
}
