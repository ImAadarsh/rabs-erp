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

  Future<void> _signOut() async {
    final ok = await confirmAction(
      context,
      title: 'Sign out?',
      body: 'You will need your work email and password to sign back in.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (ok) await ref.read(authProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final d = _dash;
    final needs = (d?['needsAction'] as List?) ?? [];
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            BrandHeader(
              subtitle: 'Hi ${nz(user?.displayName, 'team')} — here is today\'s pipeline',
              trailing: IconButton(
                tooltip: 'Sign out',
                onPressed: _signOut,
                icon: const Icon(Icons.logout, color: RabsTheme.brandDark),
              ),
            ),
            const SizedBox(height: 14),
            GuideBanner(
              title: 'How to work a job',
              body: 'Open a job → follow the red NEXT STEP. It always tells you what to do (measure, quote, deposit, fitting…). Tap Jobs or Diary below to browse.',
              icon: Icons.route_outlined,
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _search,
              decoration: InputDecoration(
                hintText: 'Search customer, phone, postcode, job…',
                prefixIcon: const Icon(Icons.search, color: RabsTheme.brandDark),
                suffixIcon: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    : (_search.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _search.clear();
                              setState(() => _searchJobs = []);
                            },
                          )
                        : null),
              ),
              onChanged: _doSearch,
            ),
            if (_searchJobs.isNotEmpty) ...[
              const SizedBox(height: 8),
              SectionCard(
                title: 'Search results',
                subtitle: 'Tap a row to open that job',
                child: Column(
                  children: [
                    for (final j in _searchJobs.take(8))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          joinClean([(j as Map)['jobNumber'], j['customerName']]),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(humanStatus(j['statusLabel'] ?? j['status'])),
                        trailing: const Icon(Icons.chevron_right, color: RabsTheme.brand),
                        onTap: () => context.push('/staff/jobs/${j['id']}'),
                      ),
                  ],
                ),
              ),
            ],
            if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(_error!, onRetry: _load)],
            if (d == null && _error == null) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (d != null) ...[
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Stat(
                    'Appointments today',
                    '${(d['appointmentsToday'] as List?)?.length ?? 0}',
                    'Diary',
                    Icons.event,
                    () => context.go('/staff/diary'),
                  ),
                  _Stat(
                    'Field work today',
                    '${(d['workToday'] as List?)?.length ?? 0}',
                    'My work',
                    Icons.handyman,
                    () => context.go('/staff/work'),
                  ),
                  _Stat(
                    'Needs your action',
                    '${needs.length}',
                    'Open list',
                    Icons.priority_high,
                    () => context.go('/staff/jobs'),
                  ),
                  if (d['outstanding'] is Map)
                    _Stat(
                      'Money outstanding',
                      gbp.format(((d['outstanding'] as Map)['total'] as num?)?.toDouble() ?? 0),
                      'Reports',
                      Icons.payments_outlined,
                      () => context.go('/staff/reports'),
                    ),
                ],
              ),
              if (needs.isNotEmpty) ...[
                const SizedBox(height: 16),
                SectionCard(
                  title: 'Needs action',
                  subtitle: 'These jobs are waiting on the next workflow step',
                  child: Column(
                    children: [
                      for (final j in needs.take(8))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            joinClean([(j as Map)['jobNumber'], j['customerName']]),
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          subtitle: Text(humanStatus(j['statusLabel'] ?? j['status'])),
                          trailing: const Icon(Icons.chevron_right, color: RabsTheme.brand),
                          onTap: () => context.push('/staff/jobs/${j['id']}'),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              SectionCard(
                title: 'Pipeline',
                subtitle: 'How many jobs sit in each status',
                child: Column(
                  children: [
                    for (final p in (d['byStatus'] as List? ?? d['pipeline'] as List? ?? []))
                      if (((p as Map)['count'] as num?)?.toInt() != 0)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(humanStatus(p['label'] ?? p['status'])),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: RabsTheme.brand.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text('${p['count'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w900, color: RabsTheme.brandDark)),
                          ),
                          onTap: () => context.go('/staff/jobs'),
                        ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.cta, this.icon, this.onTap);
  final String label;
  final String value;
  final String cta;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 168,
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
                Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: RabsTheme.ink)),
                Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade700, height: 1.25)),
                const SizedBox(height: 6),
                Text(cta, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: RabsTheme.brandDark)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
