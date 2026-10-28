import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class CustomerHomePage extends ConsumerStatefulWidget {
  const CustomerHomePage({super.key});

  @override
  ConsumerState<CustomerHomePage> createState() => _CustomerHomePageState();
}

class _CustomerHomePageState extends ConsumerState<CustomerHomePage> {
  Map<String, dynamic>? _me;
  List<dynamic> _jobs = [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final me = await dio.portalGet('/me') as Map<String, dynamic>;
      final jobs = await dio.portalGet('/jobs');
      setState(() {
        _me = me;
        _jobs = jobs is List ? jobs : (jobs['jobs'] as List? ?? []);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = apiErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _signOut() async {
    final ok = await confirmAction(
      context,
      title: 'Sign out?',
      body: 'You will need a new login code next time.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (ok) await ref.read(authProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              BrandHeader(
                subtitle: nz(_me?['name'] ?? user?.displayName, 'Your RABS jobs'),
                trailing: IconButton(tooltip: 'Sign out', onPressed: _signOut, icon: const Icon(Icons.logout, color: RabsTheme.brandDark)),
              ),
              const SizedBox(height: 14),
              const GuideBanner(
                title: 'Your job progress',
                body: 'Tap a job to see where we are — measure, quote, deposit, fitting and completion. You can accept or decline a quote from the job screen.',
                icon: Icons.home_work_outlined,
              ),
              const SizedBox(height: 14),
              if (_error != null) ErrorBanner(_error!, onRetry: _load),
              if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
              if (!_loading && _jobs.isEmpty)
                const EmptyState(
                  'No jobs on your account yet',
                  hint: 'If you expected to see a quotation, check you signed in with the same phone or email that is on the paperwork.',
                  icon: Icons.folder_open_outlined,
                ),
              for (final j in _jobs)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    title: Text(nz((j as Map)['jobNumber'], 'Job'), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(joinClean([humanStatus(j['statusLabel'] ?? j['status']), j['siteAddress']])),
                    trailing: const Icon(Icons.chevron_right, color: RabsTheme.brand),
                    onTap: () => context.push('/customer/jobs/${j['id']}'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
