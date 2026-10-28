import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth_state.dart';
import '../../core/theme.dart';

class StaffShell extends ConsumerWidget {
  const StaffShell({super.key, required this.child});
  final Widget child;

  int _index(String loc) {
    if (loc.startsWith('/staff/diary')) return 2;
    if (loc.startsWith('/staff/work')) return 3;
    if (loc.startsWith('/staff/reports')) return 4;
    if (loc.startsWith('/staff/jobs') || loc.startsWith('/staff/new')) return 1;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = GoRouterState.of(context).uri.toString();
    final user = ref.watch(authProvider).user;
    final idx = _index(loc);
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: idx,
        onDestinationSelected: (i) {
          switch (i) {
            case 0:
              context.go('/staff');
            case 1:
              context.go('/staff/jobs');
            case 2:
              context.go('/staff/diary');
            case 3:
              context.go('/staff/work');
            case 4:
              context.go('/staff/reports');
          }
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.work_outline), selectedIcon: Icon(Icons.work), label: 'Jobs'),
          NavigationDestination(icon: Icon(Icons.calendar_today_outlined), selectedIcon: Icon(Icons.calendar_today), label: 'Diary'),
          NavigationDestination(icon: Icon(Icons.handyman_outlined), selectedIcon: Icon(Icons.handyman), label: 'Field'),
          NavigationDestination(icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.bar_chart), label: 'Reports'),
        ],
      ),
      floatingActionButton: user?.can('customers') == true && idx <= 1
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/staff/new'),
              backgroundColor: RabsTheme.brand,
              icon: const Icon(Icons.add),
              label: const Text('Enquiry'),
            )
          : null,
    );
  }
}
