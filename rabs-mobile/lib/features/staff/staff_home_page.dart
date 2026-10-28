import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class StaffHomePage extends ConsumerStatefulWidget {
  const StaffHomePage({super.key});

  @override
  ConsumerState<StaffHomePage> createState() => _StaffHomePageState();
}

class _StaffHomePageState extends ConsumerState<StaffHomePage> {
  Map<String, dynamic>? _dash;
  String? _error;
  final _search = TextEditingController();
  List<dynamic> _searchJobs = [];
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await ref.read(dioProvider).rabsGet('/dashboard') as Map<String, dynamic>;
      setState(() {
        _dash = d;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = apiErrorMessage(e));
    }
  }

  Future<void> _doSearch(String q) async {
    if (q.trim().length < 2) {
      setState(() => _searchJobs = []);
      return;
    }
    setState(() => _searching = true);
    try {
      final r = await ref.read(dioProvider).rabsGet('/search', query: {'q': q.trim()}) as Map;
      setState(() {
        _searchJobs = (r['jobs'] as List?) ?? [];
        _searching = false;
      });
    } catch (_) {
      setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final d = _dash;
    return SafeArea(
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
                      Text('RABS', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
                      Text('Hi ${user?.displayName ?? ''}', style: TextStyle(color: Colors.grey.shade600)),
                    ],
                  ),
                ),
                IconButton(onPressed: () => ref.read(authProvider.notifier).logout(), icon: const Icon(Icons.logout)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _search,
              decoration: InputDecoration(
                hintText: 'Search jobs, customers, phones…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searching ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))) : null,
              ),
              onChanged: _doSearch,
            ),
            if (_searchJobs.isNotEmpty) ...[
              const SizedBox(height: 8),
              ..._searchJobs.take(8).map((j) {
                final m = j as Map;
                return ListTile(
                  title: Text('${m['jobNumber']} · ${m['customerName']}'),
                  subtitle: Text('${m['statusLabel'] ?? m['status'] ?? ''}'),
                  onTap: () => context.push('/staff/jobs/${m['id']}'),
                );
              }),
            ],
            if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(_error!, onRetry: _load)],
            if (d == null && _error == null) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (d != null) ...[
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Stat('Appointments today', (d['appointmentsToday'] as List?)?.length ?? 0, Icons.event, () => context.go('/staff/diary')),
                  _Stat('Work today', (d['workToday'] as List?)?.length ?? 0, Icons.handyman, () => context.go('/staff/work')),
                  _Stat('Needs action', (d['needsAction'] as List?)?.length ?? 0, Icons.work_outline, () => context.go('/staff/jobs')),
                  if (d['outstanding'] is Map)
                    _Stat(
                      'Outstanding £',
                      ((d['outstanding'] as Map)['total'] as num?)?.toStringAsFixed(0) ?? '0',
                      Icons.payments_outlined,
                      () => context.go('/staff/reports'),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              SectionCard(
                title: 'Pipeline',
                child: Column(
                  children: [
                    for (final p in (d['byStatus'] as List? ?? d['pipeline'] as List? ?? []))
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text('${(p as Map)['label'] ?? p['status']}'),
                        trailing: Text('${p['count'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        onTap: () => context.go('/staff/jobs'),
                      ),
                  ],
                ),
              ),
              if (((d['needsAction'] as List?) ?? []).isNotEmpty) ...[
                const SizedBox(height: 12),
                SectionCard(
                  title: 'Needs action',
                  child: Column(
                    children: [
                      for (final j in (d['needsAction'] as List).take(8))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text('${(j as Map)['jobNumber']} · ${j['customerName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text('${j['statusLabel'] ?? j['status'] ?? ''}'),
                          onTap: () => context.push('/staff/jobs/${j['id']}'),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.icon, this.onTap);
  final String label;
  final dynamic value;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: RabsTheme.brand),
                const SizedBox(height: 8),
                Text('$value', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
