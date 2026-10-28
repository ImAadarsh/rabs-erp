import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/push_stub.dart';
import 'core/router.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PushNotifications.init();
  runApp(const ProviderScope(child: RabsApp()));
}

class RabsApp extends ConsumerWidget {
  const RabsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'RABS',
      debugShowCheckedModeBanner: false,
      theme: RabsTheme.light(),
      routerConfig: router,
    );
  }
}
