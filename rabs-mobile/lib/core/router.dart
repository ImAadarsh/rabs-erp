import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth_state.dart';
import '../features/auth/login_page.dart';
import '../features/field/field_home_page.dart';
import '../features/field/booking_page.dart';
import '../features/staff/staff_shell.dart';
import '../features/staff/staff_home_page.dart';
import '../features/staff/jobs_list_page.dart';
import '../features/staff/job_detail_page.dart';
import '../features/staff/new_enquiry_page.dart';
import '../features/staff/diary_page.dart';
import '../features/staff/measure_page.dart';
import '../features/staff/quote_page.dart';
import '../features/staff/reports_page.dart';
import '../features/customer/customer_home_page.dart';
import '../features/customer/customer_job_page.dart';

final _rootKey = GlobalKey<NavigatorState>();

String _homePath(AppRoleHome h) {
  switch (h) {
    case AppRoleHome.field:
      return '/field';
    case AppRoleHome.staff:
      return '/staff';
    case AppRoleHome.customer:
      return '/customer';
    case AppRoleHome.none:
      return '/login';
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/login',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      if (!auth.ready) return null;
      final loc = state.matchedLocation;
      final loggingIn = loc == '/login';
      if (!auth.isLoggedIn) return loggingIn ? null : '/login';
      final home = _homePath(auth.user!.home);
      if (loggingIn) return home;
      if (auth.user!.home == AppRoleHome.field && loc.startsWith('/staff')) return '/field';
      if (auth.user!.home == AppRoleHome.customer && !loc.startsWith('/customer')) return '/customer';
      if (auth.user!.home == AppRoleHome.staff && loc.startsWith('/customer')) return '/staff';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(
        path: '/field',
        builder: (_, __) => const FieldHomePage(),
        routes: [
          GoRoute(
            path: 'jobs/:jobId/work/:bookingId',
            builder: (_, s) => BookingPage(
              jobId: s.pathParameters['jobId']!,
              bookingId: s.pathParameters['bookingId']!,
            ),
          ),
        ],
      ),
      ShellRoute(
        builder: (_, __, child) => StaffShell(child: child),
        routes: [
          GoRoute(path: '/staff', builder: (_, __) => const StaffHomePage()),
          GoRoute(path: '/staff/jobs', builder: (_, __) => const JobsListPage()),
          GoRoute(path: '/staff/jobs/:id', builder: (_, s) => JobDetailPage(jobId: s.pathParameters['id']!)),
          GoRoute(path: '/staff/jobs/:id/measure', builder: (_, s) => MeasurePage(jobId: s.pathParameters['id']!)),
          GoRoute(path: '/staff/jobs/:id/quote', builder: (_, s) => QuotePage(jobId: s.pathParameters['id']!)),
          GoRoute(
            path: '/staff/jobs/:jobId/work/:bookingId',
            builder: (_, s) => BookingPage(
              jobId: s.pathParameters['jobId']!,
              bookingId: s.pathParameters['bookingId']!,
            ),
          ),
          GoRoute(path: '/staff/new', builder: (_, __) => const NewEnquiryPage()),
          GoRoute(path: '/staff/diary', builder: (_, __) => const DiaryPage()),
          GoRoute(path: '/staff/reports', builder: (_, __) => const ReportsPage()),
          GoRoute(path: '/staff/work', builder: (_, __) => const FieldHomePage(embeddedInStaff: true)),
        ],
      ),
      GoRoute(
        path: '/customer',
        builder: (_, __) => const CustomerHomePage(),
        routes: [
          GoRoute(
            path: 'jobs/:id',
            builder: (_, s) => CustomerJobPage(jobId: s.pathParameters['id']!),
          ),
        ],
      ),
    ],
  );
});

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this.ref) {
    ref.listen(authProvider, (_, __) => notifyListeners());
  }
  final Ref ref;
}
