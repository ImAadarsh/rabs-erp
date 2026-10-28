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
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('My jobs', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
                        Text(_me?['name']?.toString() ?? user?.displayName ?? 'Customer', style: TextStyle(color: Colors.grey.shade600)),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () => ref.read(authProvider.notifier).logout(), icon: const Icon(Icons.logout)),
                ],
              ),
              const SizedBox(height: 12),
              if (_error != null) ErrorBanner(_error!, onRetry: _load),
              if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
              if (!_loading && _jobs.isEmpty) const EmptyState('No jobs found for your account yet.'),
              for (final j in _jobs)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    title: Text('${(j as Map)['jobNumber']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${j['statusLabel'] ?? j['status'] ?? ''} · ${j['siteAddress'] ?? ''}'),
                    trailing: const Icon(Icons.chevron_right),
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
