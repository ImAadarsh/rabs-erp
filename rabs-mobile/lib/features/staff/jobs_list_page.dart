import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../shared/widgets.dart';

class JobsListPage extends ConsumerStatefulWidget {
  const JobsListPage({super.key});

  @override
  ConsumerState<JobsListPage> createState() => _JobsListPageState();
}

class _JobsListPageState extends ConsumerState<JobsListPage> {
  List<dynamic> _jobs = [];
  String? _error;
  bool _loading = true;
  final _filter = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _filter.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await ref.read(dioProvider).rabsGet('/jobs', query: {'limit': 100}) as Map;
      setState(() {
        _jobs = (r['data'] as List?) ?? (r['jobs'] as List?) ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = apiErrorMessage(e);
        _loading = false;
      });
    }
  }

  List<dynamic> get _filtered {
    final q = _filter.text.trim().toLowerCase();
    if (q.isEmpty) return _jobs;
    return _jobs.where((j) {
      final m = j as Map;
      final hay = '${m['jobNumber']} ${m['customerName']} ${m['statusLabel'] ?? m['status']} ${m['address'] ?? m['siteAddress'] ?? ''}'.toLowerCase();
      return hay.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _filtered;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            const BrandHeader(subtitle: 'Every live job — tap one to see the next step'),
            const SizedBox(height: 12),
            TextField(
              controller: _filter,
              decoration: InputDecoration(
                hintText: 'Filter by customer, job no, status…',
                prefixIcon: const Icon(Icons.filter_list, color: RabsTheme.brandDark),
                suffixIcon: _filter.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _filter.clear();
                          setState(() {});
                        },
                      ),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            if (!_loading && _jobs.isEmpty)
              const EmptyState(
                'No jobs yet',
                hint: 'Tap New enquiry (bottom right) to start the first customer.',
                icon: Icons.work_outline,
              ),
            if (!_loading && _jobs.isNotEmpty && rows.isEmpty)
              const EmptyState('No jobs match that filter', hint: 'Clear the filter to see everything again.'),
            for (final j in rows)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(
                    joinClean([(j as Map)['jobNumber'], j['customerName']]),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(joinClean([humanStatus(j['statusLabel'] ?? j['status']), j['address'] ?? j['siteAddress']])),
                  trailing: const Icon(Icons.chevron_right, color: RabsTheme.brand),
                  onTap: () => context.push('/staff/jobs/${j['id']}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
